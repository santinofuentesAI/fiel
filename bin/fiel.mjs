#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { analyzeAll, analyzePath, FielError } from "../src/analyze.mjs";
import { doctor, formatDoctor } from "../src/doctor.mjs";
import { DEFINITIONS } from "../src/analyzers/compliance.mjs";
import { writeInstructions } from "../src/analyzers/extractor.mjs";
import { applySuggestion, findAutomation, mergeSuggestions, suggestFromAnalysis, undoAutomation } from "../src/suggest.mjs";
import { loadAutomations, saveAutomations } from "../src/store.mjs";
import { installHooks } from "../src/install.mjs";
import { handleHook } from "../src/hooks/inject.mjs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const HELP = `fiel ${version}: mide si tu agente cumple las instrucciones que le diste.

Uso:
  fiel analyze [ruta]            Analiza el proyecto en [ruta] (por defecto, la carpeta actual)
  fiel analyze --all             Analiza todos los proyectos con sesiones de Cursor en disco
  fiel report [ruta]             Igual que analyze, más compactación y automatizaciones
  fiel suggest [ruta]            Propone fijar o podar contexto a partir del análisis
  fiel apply <id> [ruta]         Aplica una propuesta solo en .fiel/automations.json
  fiel undo <id> [ruta]          Deshace una automatización aplicada
  fiel install [ruta]            Instala hooks de Cursor que inyectan esos hechos
  fiel doctor                    Comprueba Node, transcripts de Cursor y archivos de reglas

Opciones:
  --json                         Salida estructurada en JSON
  --no-write                     No escribe .fiel/instructions.json
  --dry-run                      Muestra qué haría install/inject, sin escribir
  --sessions-from <ruta>         Usa las sesiones registradas para otra ruta
                                 (útil si moviste o renombraste el proyecto)
  -h, --help                     Muestra esta ayuda
  -v, --version                  Muestra la versión

Nunca modifica AGENTS.md, CLAUDE.md ni .cursor/rules/. El estado vive en .fiel/.`;

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
    id: null,
    all: false,
    json: false,
    write: true,
    dryRun: false,
    sessionsFrom: null,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--all") options.all = true;
    else if (arg === "--no-write") options.write = false;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg === "-v" || arg === "--version") options.version = true;
    else if (arg === "--sessions-from") {
      options.sessionsFrom = argv[i + 1];
      i += 1;
      if (!options.sessionsFrom) throw new FielError("--sessions-from necesita una ruta.");
    } else if (arg.startsWith("-")) throw new FielError(`Opción desconocida: ${arg}`);
    else if (!options.command) options.command = arg;
    else if ((options.command === "apply" || options.command === "undo") && !options.id) options.id = arg;
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

  const lost = project.lostAtCompact ?? [];
  if (lost.length === 0) {
    lines.push("  Compactación: ninguna instrucción perdida (o no hay segment_*.md).");
  } else {
    lines.push(`  ${yellow(`Perdidas al compactar (${lost.length}):`)}`);
    for (const item of lost) {
      lines.push(dim(`    ${ref(item)} sesión ${shortId(item.sessionId)} · ${truncate(item.text, 70)}`));
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
      lostAtCompact: project.lostAtCompact ?? [],
    })),
    skippedProjects: result.skippedProjects,
  };
}

function runAnalyze(options) {
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
  return { result, writtenFile };
}

function printAutomations(projectDir, lines) {
  const store = loadAutomations(projectDir);
  if (store.automations.length === 0) {
    lines.push("  Automatizaciones: ninguna. Corré `fiel suggest` y `fiel apply <id>`.");
    return;
  }
  lines.push(`  Automatizaciones (${store.automations.length}):`);
  for (const item of store.automations) {
    lines.push(dim(`    ${item.id} ${item.status} ${item.kind} @ ${item.trigger} · ${truncate(item.fact, 72)}`));
  }
}

function printSuggestions(suggestions) {
  if (suggestions.length === 0) {
    console.log("Nada que proponer: no hubo violaciones ni instrucciones perdidas al compactar.");
    return;
  }
  const lines = [bold(`Propuestas (${suggestions.length}) · solo .fiel/automations.json`), ""];
  for (const item of suggestions) {
    lines.push(`${item.id}  ${item.kind} @ ${item.trigger}${item.glob ? ` (${item.glob})` : ""}`);
    lines.push(dim(`    ${item.fact}`));
  }
  lines.push("", 'Aplicá una con `fiel apply <id>`. Deshacé con `fiel undo <id>`. Nunca toca AGENTS.md.');
  console.log(lines.join("\n"));
}

function projectPath(options) {
  return options.path ?? process.cwd();
}

function runSuggest(options) {
  const { result } = runAnalyze({ ...options, all: false, write: false });
  const project = result.projects[0];
  const suggestions = suggestFromAnalysis(project);
  const store = loadAutomations(project.projectDir);
  mergeSuggestions(store, suggestions);
  if (options.write) saveAutomations(project.projectDir, store);
  if (options.json) {
    console.log(JSON.stringify({ version, projectDir: project.projectDir, suggestions, automations: store.automations }, null, 2));
    return;
  }
  printSuggestions(suggestions);
}

function runApply(options) {
  if (!options.id) throw new FielError('fiel apply necesita un id. Corré `fiel suggest` para listarlos.');
  const path = projectPath(options);
  let store = loadAutomations(path);
  let item = findAutomation(store, options.id);
  if (!item) {
    const { result } = runAnalyze({ ...options, all: false, write: false, path });
    mergeSuggestions(store, suggestFromAnalysis(result.projects[0]));
    item = findAutomation(store, options.id);
  }
  if (!item) throw new FielError(`No hay automatización ${options.id}. Corré fiel suggest primero.`);
  const applied = applySuggestion(store, item);
  saveAutomations(path, store);
  if (options.json) {
    console.log(JSON.stringify(applied, null, 2));
    return;
  }
  console.log(`Aplicada ${applied.id} (${applied.kind} @ ${applied.trigger}) en ${path}/.fiel/automations.json`);
}

function runUndo(options) {
  if (!options.id) throw new FielError("fiel undo necesita un id.");
  const path = projectPath(options);
  const store = loadAutomations(path);
  const undone = undoAutomation(store, findAutomation(store, options.id)?.id ?? options.id);
  if (!undone) throw new FielError(`No hay automatización ${options.id} para deshacer.`);
  saveAutomations(path, store);
  if (options.json) {
    console.log(JSON.stringify(undone, null, 2));
    return;
  }
  console.log(`Deshecha ${undone.id}. El hook ya no la inyecta.`);
}

function runInstall(options) {
  const path = projectPath(options);
  const result = installHooks(path, { dryRun: options.dryRun });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (options.dryRun) {
    console.log(`Dry-run: escribiría hooks de Fiel en ${result.hooksFile} (sin denegar herramientas).`);
    return;
  }
  console.log(`Hooks de Cursor en ${result.hooksFile}. Inyectan hechos de .fiel/; no bloquean el agente.`);
}

function runInject(options) {
  let stdin = "";
  try {
    stdin = readFileSync(0, "utf8");
  } catch {
    stdin = "";
  }
  let payload = {};
  try {
    payload = handleHook({
      stdin,
      argv: [options.id, options.path].filter(Boolean),
      cwd: process.env.CURSOR_PROJECT_DIR ?? process.cwd(),
      dryRun: options.dryRun,
    });
  } catch {
    payload = {};
  }
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function run(argv) {
  const options = parseArgs(argv);
  if (options.version) return console.log(version);
  if (options.help || !options.command) return console.log(HELP);
  if (options.command === "doctor") {
    const report = doctor();
    console.log(formatDoctor(report));
    if (!report.ok) process.exitCode = 1;
    return;
  }
  if (options.command === "inject") return runInject(options);
  if (options.command === "install") return runInstall(options);
  if (options.command === "suggest") return runSuggest(options);
  if (options.command === "apply") return runApply(options);
  if (options.command === "undo") return runUndo(options);
  if (options.command !== "analyze" && options.command !== "report") {
    throw new FielError(`Comando desconocido: ${options.command}. Usa "fiel --help".`);
  }

  const { result, writtenFile } = runAnalyze(options);
  if (options.json) {
    const extra = options.command === "report" && result.projects[0]
      ? { automations: loadAutomations(result.projects[0].projectDir).automations }
      : {};
    console.log(JSON.stringify({ ...toJson(result, writtenFile), ...extra }, null, 2));
    return;
  }
  printReport(result, { writtenFile });
  if (options.command === "report" && result.projects[0]) {
    const lines = [];
    printAutomations(result.projects[0].projectDir, lines);
    if (lines.length > 0) console.log(lines.join("\n"));
  }
}

try {
  run(process.argv.slice(2));
} catch (error) {
  const message = error instanceof FielError ? error.message : `error inesperado: ${error.stack ?? error}`;
  console.error(`fiel: ${message}`);
  process.exitCode = 1;
}
