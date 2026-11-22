import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeAll, analyzePath, HeldError } from "../analyze.mjs";
import { DEFINITIONS } from "../analyzers/compliance.mjs";
import { writeInstructions } from "../analyzers/extractor.mjs";
import { doctor, formatDoctor } from "../doctor.mjs";
import { prepareDemo } from "../demo.mjs";
import { runOnboard } from "../onboard.mjs";
import { runHook } from "../hooks/runtime.mjs";
import { HARNESSES, installHooks, uninstallHooks } from "../install.mjs";
import { runGate } from "../judges/gate.mjs";
import { askJev, gateFile, jevHealth, jevUrl, loadGate, saveGate } from "../judges/jev.mjs";
import { judgeProject } from "../judges/judge.mjs";
import { loadAutomations, saveAutomations } from "../store.mjs";
import { applySuggestion, findAutomation, mergeSuggestions, suggestFromAnalysis, undoAutomation } from "../suggest.mjs";
import { diffRun, loadLastRun, saveLastRun } from "../history.mjs";
import { parseHookStdin, redactSecrets, resolveHookProjectDir } from "../security.mjs";
import {
  bold,
  dim,
  formatAutomations,
  formatGate,
  formatReport,
  formatSessionsList,
  formatSuggestions,
  green,
  shortId,
  truncate,
  yellow,
} from "./format.mjs";

const out = (text) => console.log(text);
const json = (value) => console.log(JSON.stringify(value, null, 2));

function projectJson(project) {
  return {
    projectDir: project.projectDir,
    ruleFiles: project.ruleFiles,
    sessions: project.sessions,
    rules: project.rules.map((rule) => ({
      ...rule,
      violations: rule.violations.map((violation) => ({
        ...violation,
        argument: violation.argument ? redactSecrets(String(violation.argument)) : violation.argument,
      })),
    })),
    compaction: project.compaction
      ? { ...project.compaction, unanchored: (project.compaction.unanchored ?? []).map(({ summary, ...item }) => item) }
      : null,
    judged: project.judged ?? null,
  };
}

function violationCount(project) {
  return project.rules.reduce((sum, rule) => sum + rule.violations.length, 0);
}

function reportJson(result, { version, writtenFile = null, extra = {} }) {
  return {
    version,
    generatedAt: new Date().toISOString(),
    definitions: DEFINITIONS,
    instructionsFile: writtenFile,
    projects: result.projects.map(projectJson),
    skippedProjects: result.skippedProjects,
    ...extra,
  };
}

async function requireGate() {
  const health = await jevHealth();
  if (!health.ok) throw new HeldError(`Jev no responde en ${jevUrl()}. Levántalo con \`./jev serve\` o quita --judge.`);
  const gate = loadGate();
  if (!gate) throw new HeldError("Jev no tiene compuerta medida. Corre `held jev gate` primero.");
  return gate;
}

async function analyze(options, roots = {}) {
  if (options.all && options.path) throw new HeldError("Usa una ruta o --all, no ambas.");
  const result = options.all
    ? analyzeAll(roots)
    : analyzePath(options.path ?? process.cwd(), { sessionsFrom: options.sessionsFrom, ...roots });
  if (result.projects.length === 0) throw new HeldError("Ningún proyecto con sesiones tiene carpeta en disco y archivos de reglas.");
  if (options.judge === "jev") {
    const gate = await requireGate();
    for (const project of result.projects) project.judged = await judgeProject(project, { ask: askJev, gate });
  }
  let writtenFile = null;
  if (!options.all && options.write) {
    try {
      writtenFile = writeInstructions(result.projects[0].projectDir, result.projects[0].currentRules);
    } catch (error) {
      console.error(`held: aviso: no se pudo escribir .held/instructions.json (${error.code ?? error.message}); el análisis sigue.`);
    }
  }
  return { result, writtenFile };
}

export async function analyzeCommand(options, { version }) {
  const singleProject = !options.all;
  const projectDir = singleProject ? resolve(options.path ?? process.cwd()) : null;
  const previous = singleProject && options.write ? loadLastRun(projectDir) : null;
  const { result, writtenFile } = await analyze(options);
  const deltas =
    singleProject && options.command === "report" ? [diffRun(result.projects[0], previous)] : null;
  if (singleProject && options.write && result.projects[0]) saveLastRun(projectDir, result.projects[0]);
  const automations = options.command === "report" && singleProject ? loadAutomations(result.projects[0].projectDir) : null;
  const extra = { ...(automations ? { automations: automations.automations } : {}), ...(deltas ? { delta: deltas[0] } : {}) };
  if (options.json) return json(reportJson(result, { version, writtenFile, extra }));
  out(formatReport(result, { version, writtenFile, deltas }));
  if (automations) out(formatAutomations(automations));
  if (options.failOnViolations) {
    const violations = result.projects.reduce((sum, project) => sum + violationCount(project), 0);
    if (violations > 0) process.exitCode = 1;
  }
  if (options.failOnCompactionLost) {
    const lost = result.projects.reduce((sum, project) => sum + (project.compaction?.lost?.length ?? 0), 0);
    if (lost > 0) process.exitCode = 1;
  }
}

export async function suggestCommand(options, { version }) {
  const { result } = await analyze({ ...options, all: false, write: false });
  const project = result.projects[0];
  const suggestions = suggestFromAnalysis(project);
  const store = mergeSuggestions(loadAutomations(project.projectDir), suggestions);
  if (options.save) saveAutomations(project.projectDir, store);
  if (options.json) return json({ version, projectDir: project.projectDir, suggestions, saved: options.save, automations: store.automations });
  out(formatSuggestions(suggestions));
}

export async function sessionsCommand(options, { version }) {
  const { result } = await analyze({ ...options, all: false, write: false });
  const project = result.projects[0];
  if (options.json) return json({ version, projectDir: project.projectDir, sessions: project.sessions });
  out(formatSessionsList(project));
}

export async function applyCommand(options) {
  if (!options.id) throw new HeldError("held apply necesita un id. Corre `held suggest` para verlos.");
  const path = resolve(options.path ?? process.cwd());
  const store = loadAutomations(path);
  let item = findAutomation(store, options.id);
  if (!item) {
    const { result } = await analyze({ ...options, path, all: false, write: false });
    mergeSuggestions(store, suggestFromAnalysis(result.projects[0]));
    item = findAutomation(store, options.id);
  }
  if (!item) throw new HeldError(`No hay propuesta ${options.id}. Corre \`held suggest\` primero.`);
  const applied = applySuggestion(store, item);
  saveAutomations(path, store);
  if (options.json) return json(applied);
  out(`Aplicada ${applied.id} (${applied.kind} @ ${applied.trigger}) en ${path}/.held/automations.json`);
}

export async function undoCommand(options) {
  if (!options.id) throw new HeldError("held undo necesita un id.");
  const path = resolve(options.path ?? process.cwd());
  const store = loadAutomations(path);
  const undone = undoAutomation(store, findAutomation(store, options.id)?.id);
  if (!undone) throw new HeldError(`No hay automatización ${options.id} para deshacer.`);
  saveAutomations(path, store);
  if (options.json) return json(undone);
  out(`Deshecha ${undone.id}. Los hooks ya no la inyectan.`);
}

export function selectedHarnesses(options) {
  const picked = HARNESSES.filter((harness) => options[harness]);
  return picked.length > 0 ? picked : HARNESSES;
}

export async function installCommand(options) {
  const path = resolve(options.path ?? process.cwd());
  const results = (options.command === "uninstall" ? uninstallHooks : installHooks)(path, {
    harnesses: selectedHarnesses(options),
    dryRun: options.dryRun,
  });
  if (options.json) return json(results);
  for (const result of results) {
    if (options.dryRun) out(`${bold(result.harness)} (dry-run) ${result.file}:\n${JSON.stringify(result.config, null, 2)}`);
    else out(`${green("ok")} ${result.harness}: ${result.file}`);
  }
  if (options.command === "install" && !options.dryRun) {
    out(dim("Los hooks inyectan hechos de .held/ y guardan lo que pides en el chat para reinyectarlo tras compactar. No bloquean herramientas."));
    out(dim("Cursor Cloud Agents no corre hooks al inicio; los hechos @ session_start aplican en sesiones locales."));
    out(dim("El hook usa CURSOR_PROJECT_DIR / CLAUDE_PROJECT_DIR cuando el IDE los define."));
  }
}

export async function hookCommand(options) {
  let stdin = "";
  try {
    stdin = readFileSync(0, "utf8");
  } catch {
    stdin = "";
  }
  const input = parseHookStdin(stdin);
  const projectDir = resolveHookProjectDir({ harness: options.harness, input });
  const output = runHook({ harness: options.harness, event: options.event, stdin, projectDir, dryRun: options.dryRun });
  if (output) process.stdout.write(`${output}\n`);
}

export async function jevCommand(options) {
  const action = options.action ?? "status";
  if (action === "status") {
    const health = await jevHealth();
    const gate = loadGate();
    if (options.json) return json({ url: jevUrl(), health, gate });
    out(`Jev en ${jevUrl()}: ${health.ok ? green("responde") : `no responde (${health.detail})`}`);
    out(gate ? formatGate(gate) : "Sin compuerta medida. Corre `held jev gate` con Jev levantado.");
    return;
  }
  if (action !== "gate") throw new HeldError(`Acción desconocida: held jev ${action}. Usa status o gate.`);
  const health = await jevHealth();
  if (!health.ok) throw new HeldError(`Jev no responde en ${jevUrl()}. Descárgalo de https://github.com/feder-cr/jev y corre \`./jev serve\`.`);
  const gate = await runGate(askJev, {
    onProgress: (done, total) => {
      if (!options.json && process.stderr.isTTY) process.stderr.write(`\r  ${done}/${total} casos`);
    },
  });
  if (!options.json && process.stderr.isTTY) process.stderr.write("\n");
  const file = saveGate(gate);
  if (options.json) return json({ file, ...gate });
  out(formatGate(gate));
  out(dim(`Guardado en ${file}. \`held analyze --judge jev\` usa solo las tareas encendidas.`));
}

export async function doctorCommand(options) {
  const report = await doctor();
  if (options.json) json(report);
  else out(formatDoctor(report));
  if (!report.ok) process.exitCode = 1;
}

export async function onboardCommand(options, { version }) {
  const path = resolve(options.path ?? process.cwd());
  const result = runOnboard(path, {
    write: options.write && !options.dryRun,
    dryRun: options.dryRun,
    install: !options.dryRun,
    harnesses: selectedHarnesses(options),
    sessionsFrom: options.sessionsFrom,
  });
  if (options.json) {
    return json({
      version,
      projectDir: path,
      dryRun: options.dryRun,
      writtenFile: result.writtenFile,
      violations: result.violations,
      compaction: result.compaction,
      applied: result.applied.map((item) => ({ id: item.id, trigger: item.trigger, kind: item.kind })),
      hooks: result.hookResults.map((item) => ({ harness: item.harness, file: item.file })),
    });
  }
  const lost = result.compaction?.lost?.length ?? 0;
  out(bold(`held onboard · ${path}`));
  if (options.dryRun) out(dim("(dry-run: no escribe .held/ ni instala hooks)"));
  out(`Violaciones de reglas: ${result.violations}`);
  out(
    `Compactación (memoria del chat): ${lost > 0 ? yellow(`${lost} instrucciones perdidas en resumen`) : green("ninguna perdida medible")}`,
  );
  out(`Pins aplicados: ${result.applied.filter((item) => item.kind === "pin").length}`);
  if (!options.dryRun && result.hookResults.length > 0) {
    out(green("Hooks instalados en Cursor y Claude Code."));
    out(dim("PreCompact pedirá conservar tokens exactos; tras compactar, SessionStart/postToolUse reinyecta hechos + tus instrucciones."));
  }
  if (lost > 0) {
    for (const item of result.compaction.lost.slice(0, 5)) {
      out(dim(`  · ${shortId(item.sessionId)} «${truncate(item.text, 72)}»`));
    }
  }
  out("");
  out(`Siguiente: ${bold("held report")} en CI o antes de abrir el IDE para ver delta.`);
}

const DEMO_PROMPT =
  "Agregá un descuento del 10% en `src/discounts.mjs`. Ojo: no toques `scripts/db-reset.mjs` y al final corré `npm run check`.";

export async function demoCommand(options, { version }) {
  const demo = prepareDemo();
  const roots = { cursorRoot: demo.cursorRoot, claudeRoot: demo.claudeRoot };
  const { result } = await analyze({ ...options, path: demo.projectDir, all: false, write: false }, roots);
  const project = result.projects[0];
  const suggestions = suggestFromAnalysis(project);
  const store = mergeSuggestions(loadAutomations(demo.projectDir), suggestions);
  for (const item of store.automations.filter((automation) => automation.kind === "pin")) applySuggestion(store, item);
  saveAutomations(demo.projectDir, store);

  const conversation = { session_id: "demo", cwd: demo.projectDir };
  runHook({ harness: "claude", event: "UserPromptSubmit", projectDir: demo.projectDir, stdin: JSON.stringify({ ...conversation, prompt: DEMO_PROMPT }) });
  const preCompact = runHook({ harness: "claude", event: "PreCompact", projectDir: demo.projectDir, stdin: JSON.stringify({ ...conversation, trigger: "auto" }) });
  const afterCompact = runHook({ harness: "claude", event: "SessionStart", projectDir: demo.projectDir, stdin: JSON.stringify({ ...conversation, source: "compact" }) });

  if (options.json) {
    return json({ ...reportJson(result, { version }), demo, suggestions, hooks: { preCompact, afterCompact: JSON.parse(afterCompact || "{}") } });
  }
  out(bold("held demo · repo trampa con 5 sesiones reales de Cursor y 1 de ejemplo de Claude Code"));
  out(dim(`Carpeta temporal: ${demo.base}\n`));
  out(formatReport(result, { version }));
  out("");
  out(formatSuggestions(suggestions));
  out("");
  out(bold("1) Lo que el hook le pide al resumen de Claude Code antes de compactar (PreCompact):"));
  out(dim(preCompact || "(nada)"));
  out("");
  out(bold("2) Lo que el hook reinyecta después de compactar (SessionStart, source=compact):"));
  out(dim(JSON.parse(afterCompact || "{}").hookSpecificOutput?.additionalContext ?? "(nada)"));
  out("");
  out(`Pruébalo en tu proyecto: ${bold("held onboard")} (todo en uno) o ${bold("held analyze")} → suggest → apply → install.`);
}
