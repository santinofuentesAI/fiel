#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { analyzeAll, analyzePath, FielError } from "../src/analyze.mjs";
import { DEFINITIONS } from "../src/analyzers/compliance.mjs";
import { writeInstructions } from "../src/analyzers/extractor.mjs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const HELP = `fiel ${version}: mide si tu agente cumple las instrucciones que le diste.

Uso:
  fiel analyze [ruta]            Analiza el proyecto en [ruta] (por defecto, la carpeta actual)
  fiel analyze --all             Analiza todos los proyectos con sesiones de Cursor en disco

Opciones:
  --json                         Salida estructurada en JSON
  --no-write                     No escribe .fiel/instructions.json
  --sessions-from <ruta>         Usa las sesiones registradas para otra ruta
                                 (útil si moviste o renombraste el proyecto)
  -h, --help                     Muestra esta ayuda
  -v, --version                  Muestra la versión

Con [ruta], escribe las instrucciones extraídas en <ruta>/.fiel/instructions.json.
Nunca modifica AGENTS.md, CLAUDE.md ni .cursor/rules/.`;

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const bold = paint(1);
const dim = paint(2);
const red = paint(31);
const green = paint(32);
const yellow = paint(33);

function parseArgs(argv) {
  const options = {
    command: null,
    path: null,
    all: false,
    json: false,
    write: true,
    sessionsFrom: null,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--all") options.all = true;
    else if (arg === "--no-write") options.write = false;
    else if (arg === "--json") options.json = true;
    else if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg === "-v" || arg === "--version") options.version = true;
    else if (arg === "--sessions-from") {
      options.sessionsFrom = argv[i + 1];
      i += 1;
      if (!options.sessionsFrom) throw new FielError("--sessions-from necesita una ruta.");
    } else if (arg.startsWith("-")) throw new FielError(`Opción desconocida: ${arg}`);
    else if (!options.command) options.command = arg;
    else if (!options.path) options.path = arg;
    else throw new FielError(`Argumento de más: ${arg}`);
  }
  return options;
}

const ref = (rule) => `[${rule.sourceFile}:${rule.lineNumber}]`;
const shortId = (id) => id.slice(0, 8);
const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const sessionsLabel = (count) => `${count} ${count === 1 ? "sesión" : "sesiones"}`;

function describeRule(rule) {
  switch (rule.type) {
    case "forbidden_path":
      return `no editar ${rule.paths.join(", ")}`;
    case "forbidden_command":
      return `nunca correr ${rule.commands.map((command) => `"${command}"`).join(", ")}`;
    case "preferred_command":
      return `usar "${rule.preferred}" en vez de "${rule.avoided}"`;
    case "required_command":
      return `correr siempre "${rule.command}"`;
    case "required_sequence":
      return `tras editar ${rule.scope ?? "código"}, correr ${rule.commands.join(" | ")}`;
    case "exposure_only":
      return rule.text;
    default: {
      const unhandled = rule.type;
      throw new Error(`Tipo de regla sin descripción: ${unhandled}`);
    }
  }
}

function formatSkipReasons(sessions) {
  const counts = new Map();
  for (const session of sessions.filter((item) => item.status === "skipped")) {
    counts.set(session.reason, (counts.get(session.reason) ?? 0) + 1);
  }
  return [...counts].map(([reason, count]) => `${reason}: ${count}`).join(", ");
}

function printProject(project, lines) {
  const verifiable = project.rules.filter((rule) => rule.verifiable);
  const currentVerifiable = project.currentRules.filter((rule) => rule.verifiable).length;
  const analyzed = project.sessions.filter((session) => session.status === "analyzed");
  const skipped = project.sessions.length - analyzed.length;
  const ongoing = analyzed.filter((session) => session.ongoing).length;

  lines.push(bold(`Proyecto: ${project.projectDir}`));
  lines.push(`  Archivos de reglas: ${project.ruleFiles.join(", ")}`);
  lines.push(
    `  Instrucciones actuales: ${project.currentRules.length} (verificables ${currentVerifiable}, solo exposición ${project.currentRules.length - currentVerifiable})`,
  );
  const skipText = skipped > 0 ? `, omitidas ${skipped} (${formatSkipReasons(project.sessions)})` : "";
  const ongoingText = ongoing > 0 ? `, ${ongoing} en curso` : "";
  if (project.sessionRoot !== project.projectDir) lines.push(`  Sesiones tomadas de: ${project.sessionRoot}`);
  lines.push(`  Sesiones: ${project.sessions.length} encontradas, analizadas ${analyzed.length}${ongoingText}${skipText}`);

  for (const session of project.sessions) {
    const date = session.start ? session.start.toISOString().slice(0, 16).replace("T", " ") : "sin fecha";
    const exposure = (session.exposure ?? []).map((item) => `${item.file}=${item.status} (${item.reason})`).join("; ");
    const mark = session.status === "analyzed" ? green("analizada") : yellow("omitida");
    lines.push(dim(`    ${shortId(session.sessionId)} ${date} UTC ${mark}${exposure ? ` · ${exposure}` : ""}`));
  }

  if (verifiable.length === 0) {
    lines.push("  Reglas verificables: ninguna.");
  } else {
    lines.push("  Reglas verificables:");
    for (const rule of verifiable) {
      const violations = rule.violations.length;
      const equivalent = rule.equivalences.length > 0 ? ` (${rule.equivalences.length} por equivalente)` : "";
      const counts = `expuesta ${rule.exposedSessions}, aplicables ${rule.applicable}, cumple ${rule.complied}${equivalent}, viola ${violations > 0 ? red(violations) : violations}${rule.pendingSessions ? `, pendiente ${rule.pendingSessions}` : ""}, ~${rule.tokensCumulative} tokens`;
      lines.push(`    ${ref(rule)} ${rule.type}: ${truncate(describeRule(rule), 70)}`);
      lines.push(dim(`      ${counts}`));
    }
  }

  const equivalences = verifiable.flatMap((rule) => rule.equivalences.map((item) => ({ rule, item })));
  if (equivalences.length > 0) {
    lines.push(`  Cumplimientos por equivalente (${equivalences.length}, revísalos):`);
    for (const { rule, item } of equivalences) {
      lines.push(dim(`    ${ref(rule)} sesión ${shortId(item.sessionId)} · ${truncate(item.argument, 60)} ≈ ${item.via}`));
    }
  }

  const violations = verifiable.flatMap((rule) => rule.violations.map((violation) => ({ rule, violation })));
  if (violations.length === 0) {
    lines.push(`  Violaciones: ${green("ninguna")} en sesiones con exposición conocida.`);
  } else {
    lines.push(`  ${red(`Violaciones (${violations.length}):`)}`);
    for (const { rule, violation } of violations) {
      const missing = violation.missing ? ` · faltó: ${violation.missing}` : "";
      lines.push(
        `    ${ref(rule)} sesión ${shortId(violation.sessionId)} · ${violation.tool} ${violation.argument}${missing}`,
      );
    }
  }
}

function printReport(result, { writtenFile }) {
  const lines = [bold(`fiel ${version} · cumplimiento de instrucciones (sesiones de Cursor)`), ""];
  for (const project of result.projects) {
    printProject(project, lines);
    lines.push("");
  }
  if (result.skippedProjects.length > 0) {
    const total = result.skippedProjects.reduce((sum, item) => sum + item.sessions, 0);
    lines.push(bold(`Proyectos omitidos: ${result.skippedProjects.length} (${sessionsLabel(total)})`));
    for (const item of result.skippedProjects) {
      lines.push(dim(`  ${item.projectDir ?? item.key} · ${sessionsLabel(item.sessions)} · ${item.reason}`));
    }
    lines.push("");
  }
  lines.push(bold("Cómo se cuenta"));
  for (const [type, definition] of Object.entries(DEFINITIONS)) lines.push(dim(`  ${type}: ${definition}`));
  lines.push(dim("  tokens: estimación (caracteres/4) × mensajes del usuario en sesiones expuestas."));
  lines.push(dim("  Sesiones con actividad en los últimos 30 min no se juzgan en reglas de fin de sesión."));
  lines.push(dim("  Sin resultados de herramientas en Cursor: un comando ejecutado cuenta, aunque haya fallado."));
  if (writtenFile) lines.push("", `Instrucciones escritas en ${writtenFile}`);
  console.log(lines.join("\n"));
}

function toJson(result, writtenFile) {
  return {
    version,
    generatedAt: new Date().toISOString(),
    definitions: DEFINITIONS,
    instructionsFile: writtenFile ?? null,
    projects: result.projects.map((project) => ({
      projectDir: project.projectDir,
      ruleFiles: project.ruleFiles,
      sessions: project.sessions,
      rules: project.rules,
    })),
    skippedProjects: result.skippedProjects,
  };
}

function run(argv) {
  const options = parseArgs(argv);
  if (options.version) return console.log(version);
  if (options.help || !options.command) return console.log(HELP);
  if (options.command !== "analyze") throw new FielError(`Comando desconocido: ${options.command}. Usa "fiel --help".`);
  if (options.all && options.path) throw new FielError("Usa una ruta o --all, no ambas.");

  const result = options.all
    ? analyzeAll()
    : analyzePath(options.path ?? process.cwd(), { sessionsFrom: options.sessionsFrom });
  if (result.projects.length === 0) {
    throw new FielError("Ningún proyecto con sesiones tiene carpeta en disco y archivos de reglas.");
  }

  let writtenFile = null;
  if (!options.all && options.write) {
    try {
      writtenFile = writeInstructions(result.projects[0].projectDir, result.projects[0].currentRules);
    } catch (error) {
      console.error(`fiel: aviso: no se pudo escribir .fiel/instructions.json (${error.code ?? error.message}); el análisis sigue.`);
    }
  }

  if (options.json) console.log(JSON.stringify(toJson(result, writtenFile), null, 2));
  else printReport(result, { writtenFile });
}

try {
  run(process.argv.slice(2));
  process.exitCode = 0;
} catch (error) {
  const message = error instanceof FielError ? error.message : `error inesperado: ${error.stack ?? error}`;
  console.error(`fiel: ${message}`);
  process.exitCode = 1;
}
