import { DEFINITIONS } from "../analyzers/compliance.mjs";

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : String(text));
export const bold = paint(1);
export const dim = paint(2);
export const red = paint(31);
export const green = paint(32);
export const yellow = paint(33);
export const cyan = paint(36);

export const ref = (rule) => `[${rule.sourceFile}:${rule.lineNumber}]`;
export const shortId = (id) => String(id).slice(0, 8);
export const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const sessionsLabel = (count) => `${count} ${count === 1 ? "sesión" : "sesiones"}`;
const pct = (value) => (value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`);

export function describeRule(rule) {
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

function harnessCounts(sessions) {
  const counts = new Map();
  for (const session of sessions) counts.set(session.harness, (counts.get(session.harness) ?? 0) + 1);
  return [...counts].map(([harness, count]) => `${harness} ${count}`).join(", ");
}

function printSessions(project, lines) {
  const analyzed = project.sessions.filter((session) => session.status === "analyzed");
  const skipped = project.sessions.length - analyzed.length;
  const ongoing = analyzed.filter((session) => session.ongoing).length;
  const skipText = skipped > 0 ? `, omitidas ${skipped} (${formatSkipReasons(project.sessions)})` : "";
  const ongoingText = ongoing > 0 ? `, ${ongoing} en curso` : "";
  if (project.sessionRoot !== project.projectDir) lines.push(`  Sesiones tomadas de: ${project.sessionRoot}`);
  lines.push(
    `  Sesiones: ${project.sessions.length} (${harnessCounts(project.sessions)}), analizadas ${analyzed.length}${ongoingText}${skipText}`,
  );
  for (const session of project.sessions) {
    const date = session.start ? new Date(session.start).toISOString().slice(0, 16).replace("T", " ") : "sin fecha";
    const exposure = (session.exposure ?? []).map((item) => `${item.file}=${item.status}`).join("; ");
    const mark = session.status === "analyzed" ? green("analizada") : yellow(`omitida: ${session.reason}`);
    lines.push(dim(`    ${shortId(session.sessionId)} ${session.harness} ${date} UTC ${mark}${exposure ? ` · ${exposure}` : ""}`));
  }
}

function printRules(project, lines) {
  const verifiable = project.rules.filter((rule) => rule.verifiable);
  if (verifiable.length === 0) {
    lines.push("  Reglas verificables: ninguna.");
    return;
  }
  lines.push("  Reglas verificables:");
  for (const rule of verifiable) {
    const violations = rule.violations.length;
    const equivalent = rule.equivalences.length > 0 ? ` (${rule.equivalences.length} por equivalente)` : "";
    const pending = rule.pendingSessions ? `, pendiente ${rule.pendingSessions}` : "";
    const counts = `expuesta ${rule.exposedSessions}, aplicables ${rule.applicable}, cumple ${rule.complied}${equivalent}, viola ${violations > 0 ? red(violations) : violations}${pending}, ~${rule.tokensCumulative} tokens`;
    lines.push(`    ${ref(rule)} ${rule.type}: ${truncate(describeRule(rule), 70)}`);
    lines.push(dim(`      ${counts}`));
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
    return;
  }
  lines.push(`  ${red(`Violaciones (${violations.length}):`)}`);
  for (const { rule, violation } of violations) {
    const missing = violation.missing ? ` · faltó: ${violation.missing}` : "";
    lines.push(`    ${ref(rule)} sesión ${shortId(violation.sessionId)} · ${violation.tool} ${violation.argument}${missing}`);
  }
}

function printCompaction(project, lines) {
  const compaction = project.compaction;
  if (!compaction || compaction.sessions === 0) {
    lines.push(dim("  Compactación: ninguna sesión compactada."));
    return;
  }
  lines.push(
    `  Compactación: ${sessionsLabel(compaction.sessions)} con ${compaction.compactions} ${compaction.compactions === 1 ? "compactación" : "compactaciones"}. Instrucciones que diste en el chat:`,
  );
  lines.push(
    `    ${compaction.lost.length > 0 ? yellow(`perdidas ${compaction.lost.length}`) : green("perdidas 0")}, conservadas ${compaction.kept}, sin ancla ${compaction.unanchored.length} (solo las juzga Jev)`,
  );
  for (const item of compaction.lost) {
    lines.push(dim(`    sesión ${shortId(item.sessionId)} ${item.harness} · «${truncate(item.text, 90)}»`));
  }
}

function printJudge(project, lines) {
  const judged = project.judged;
  if (!judged) return;
  lines.push(cyan(`  Juez Jev (${judged.model}, probabilístico, aparte de lo anterior):`));
  if (judged.skipped.length > 0) lines.push(dim(`    tareas apagadas por la compuerta: ${judged.skipped.join(", ")}`));
  for (const item of judged.violations) {
    lines.push(`    posible violación ${ref(item)} sesión ${shortId(item.sessionId)} p=${item.probability.toFixed(2)} · ${truncate(item.text, 60)}`);
  }
  for (const item of judged.lostAtCompact) {
    lines.push(`    posible pérdida al compactar, sesión ${shortId(item.sessionId)} p(conservada)=${item.probabilityKept.toFixed(2)} · «${truncate(item.text, 60)}»`);
  }
  const found = judged.violations.length + judged.lostAtCompact.length;
  lines.push(dim(`    ${judged.checked} ${judged.checked === 1 ? "pregunta" : "preguntas"} a Jev, ${found} sobre el umbral`));
}

export function formatProject(project) {
  const lines = [];
  const currentVerifiable = project.currentRules.filter((rule) => rule.verifiable).length;
  lines.push(bold(`Proyecto: ${project.projectDir}`));
  lines.push(`  Archivos de reglas: ${project.ruleFiles.join(", ")}`);
  lines.push(
    `  Instrucciones actuales: ${project.currentRules.length} (verificables ${currentVerifiable}, solo exposición ${project.currentRules.length - currentVerifiable})`,
  );
  printSessions(project, lines);
  printRules(project, lines);
  printCompaction(project, lines);
  printJudge(project, lines);
  return lines.join("\n");
}

export function formatReport(result, { version, writtenFile }) {
  const lines = [bold(`fiel ${version} · cumplimiento de instrucciones (Cursor y Claude Code)`), ""];
  for (const project of result.projects) lines.push(formatProject(project), "");
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
  lines.push(dim("  compactación: AGENTS.md y CLAUDE.md se reenvían; se revisa lo que dijiste en el chat contra el resumen."));
  lines.push(dim("  Sesiones con actividad en los últimos 30 min no se juzgan en reglas de fin de sesión."));
  if (writtenFile) lines.push("", `Instrucciones escritas en ${writtenFile}`);
  return lines.join("\n");
}

export function formatAutomations(store) {
  if (store.automations.length === 0) return "  Automatizaciones: ninguna. Corre `fiel suggest` y `fiel apply <id>`.";
  const lines = [`  Automatizaciones (${store.automations.length}):`];
  for (const item of store.automations) {
    lines.push(dim(`    ${item.id} ${item.status} ${item.kind} @ ${item.trigger} · ${truncate(item.fact, 72)}`));
  }
  return lines.join("\n");
}

export function formatSuggestions(suggestions) {
  if (suggestions.length === 0) return "Nada que proponer: no hubo violaciones ni instrucciones perdidas al compactar.";
  const lines = [bold(`Propuestas (${suggestions.length}) · se guardan solo en .fiel/automations.json`), ""];
  for (const item of suggestions) {
    lines.push(`${item.id}  ${item.kind} @ ${item.trigger}${item.glob ? ` (${item.glob})` : ""}`);
    lines.push(dim(`    ${item.fact}`));
  }
  lines.push("", "Aplica una con `fiel apply <id>` y deshazla con `fiel undo <id>`. Nunca toca AGENTS.md.");
  return lines.join("\n");
}

export function formatGate(gate) {
  const lines = [bold(`Compuerta de Jev (${gate.model}, ${gate.cases} casos, ${gate.measuredAt.slice(0, 16)})`)];
  lines.push(dim(`  Umbral elegido con la mitad de los casos; precisión y recall medidos en la otra mitad. Mínimo: precisión ${pct(gate.minPrecision)}, recall ${pct(gate.minRecall)}.`));
  for (const [task, result] of Object.entries(gate.tasks)) {
    const mark = result.passed ? green("ENCENDIDA") : yellow("APAGADA");
    lines.push(
      `  ${task}: ${mark} · umbral ${result.threshold ?? "—"} · prueba: precisión ${pct(result.test.precision)}, recall ${pct(result.test.recall)}, exactitud ${pct(result.test.accuracy)} · ${result.reason}`,
    );
  }
  return lines.join("\n");
}
