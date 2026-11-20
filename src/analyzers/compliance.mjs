import { isAbsolute, relative } from "node:path";
import { extractInstructions } from "./extractor.mjs";
import { expandCommand, isEquivalent, splitSegments } from "./scripts.mjs";

const CODE_EXTENSIONS =
  /\.(?:[cm]?[jt]sx?|rs|py|go|java|kt|rb|php|cs|swift|sol|vue|svelte|c|cc|cpp|h|hpp|scala|ex|exs|dart|sql)$/i;

export const ONGOING_WINDOW_MS = 30 * 60 * 1000;

export const DEFINITIONS = {
  forbidden_path: "aplicable = cada edición del agente dentro del proyecto; viola = la ruta coincide con la prohibida",
  forbidden_command: "aplicable = cada comando de shell del agente; viola = empieza con el comando prohibido",
  preferred_command: "aplicable = cada comando que usa la opción preferida o la evitada; viola = usó la evitada",
  required_command: "aplicable = sesión terminada con al menos una edición; viola = el comando nunca se ejecutó",
  required_sequence:
    "aplicable = sesión terminada que editó código (o el alcance indicado); viola = ningún comando de verificación después de la última edición",
  equivalence:
    "cumple por equivalente = el agente corrió lo mismo que ejecuta el script (p. ej. tsc en vez de npm run typecheck); comandos con --write o --fix no cuentan",
};

function escapeRegex(text) {
  return text.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

// Patterns are anchored at the project root on purpose: "readme.md" means the
// root file, not every nested readme. Missing a match beats inventing one.
export function pathMatcher(pattern) {
  const clean = pattern.replace(/^\.\//, "").replace(/^\//, "");
  if (clean.endsWith("/")) return (path) => path.startsWith(clean);
  const source = escapeRegex(clean)
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  const regex = new RegExp(`^${source}(?:/.*)?$`);
  return (path) => regex.test(path);
}

function startsWithCommand(segment, command) {
  return segment === command || segment.startsWith(`${command} `);
}

function projectRelative(projectDir, path) {
  if (!path) return null;
  const rel = isAbsolute(path) ? relative(projectDir, path) : path.replace(/^\.\//, "");
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel;
}

function edits(events, projectDir) {
  return events
    .map((event, position) => ({ event, position }))
    .filter(({ event }) => event.kind === "tool_use" && event.family === "edit")
    .map(({ event, position }) => ({ event, position, rel: projectRelative(projectDir, event.path) }))
    .filter((edit) => edit.rel !== null);
}

function shells(events) {
  return events
    .map((event, position) => ({ event, position }))
    .filter(({ event }) => event.kind === "tool_use" && event.family === "shell" && event.command);
}

function evidence(sessionId, event, argument) {
  return { sessionId, tool: event.tool, argument, eventIndex: event.index };
}

function evaluateForbiddenPath(rule, ctx) {
  const matchers = rule.paths.map(pathMatcher);
  const result = { applicable: 0, complied: 0, violations: [] };
  for (const edit of ctx.edits) {
    result.applicable += 1;
    if (matchers.some((matches) => matches(edit.rel))) {
      result.violations.push(evidence(ctx.sessionId, edit.event, edit.rel));
    } else {
      result.complied += 1;
    }
  }
  return result;
}

function evaluateForbiddenCommand(rule, ctx) {
  const result = { applicable: 0, complied: 0, violations: [] };
  for (const { event } of ctx.shells) {
    for (const segment of splitSegments(event.command)) {
      result.applicable += 1;
      const normalized = segment.replace(/\s+/g, " ");
      if (rule.commands.some((command) => startsWithCommand(normalized, command))) {
        result.violations.push(evidence(ctx.sessionId, event, segment));
      } else {
        result.complied += 1;
      }
    }
  }
  return result;
}

function evaluatePreferredCommand(rule, ctx) {
  const result = { applicable: 0, complied: 0, violations: [] };
  for (const { event } of ctx.shells) {
    for (const segment of splitSegments(event.command)) {
      if (startsWithCommand(segment, rule.avoided)) {
        result.applicable += 1;
        result.violations.push(evidence(ctx.sessionId, event, segment));
      } else if (startsWithCommand(segment, rule.preferred)) {
        result.applicable += 1;
        result.complied += 1;
      }
    }
  }
  return result;
}

function equivalentLeaf(segment, commands, scripts) {
  for (const command of commands) {
    const leaf = expandCommand(command, scripts).find((candidate) => isEquivalent(segment, candidate));
    if (leaf && leaf !== command) return `${command} → ${leaf}`;
  }
  return null;
}

// Literal matches win; a script-equivalent run only counts when no literal one exists.
function findRun(ctx, commands, afterPosition = -1) {
  let equivalent = null;
  for (const { event, position } of ctx.shells) {
    if (position <= afterPosition) continue;
    for (const segment of splitSegments(event.command)) {
      if (commands.some((command) => segment.includes(command))) return { kind: "literal" };
      if (!equivalent) {
        const via = equivalentLeaf(segment, commands, ctx.scripts);
        if (via) equivalent = { kind: "equivalent", ...evidence(ctx.sessionId, event, segment), via };
      }
    }
  }
  return equivalent;
}

function outcomeFromRun(run, missingEvidence) {
  if (run?.kind === "literal") return { applicable: 1, complied: 1, violations: [] };
  if (run?.kind === "equivalent") {
    const { kind, ...equivalence } = run;
    return { applicable: 1, complied: 1, violations: [], equivalences: [equivalence] };
  }
  return { applicable: 1, complied: 0, violations: [missingEvidence] };
}

function evaluateRequiredCommand(rule, ctx) {
  if (ctx.edits.length === 0) return { applicable: 0, complied: 0, violations: [] };
  const last = ctx.edits.at(-1);
  return outcomeFromRun(findRun(ctx, [rule.command]), {
    ...evidence(ctx.sessionId, last.event, last.rel),
    missing: rule.command,
  });
}

function evaluateRequiredSequence(rule, ctx) {
  const inScope = rule.scope ? pathMatcher(rule.scope) : (path) => CODE_EXTENSIONS.test(path);
  const scoped = ctx.edits.filter((edit) => inScope(edit.rel));
  if (scoped.length === 0) return { applicable: 0, complied: 0, violations: [] };
  const last = scoped.at(-1);
  return outcomeFromRun(findRun(ctx, rule.commands, last.position), {
    ...evidence(ctx.sessionId, last.event, last.rel),
    missing: rule.commands.join(" | "),
  });
}

const END_OF_SESSION_TYPES = new Set(["required_command", "required_sequence"]);

export function evaluateRule(rule, ctx) {
  switch (rule.type) {
    case "forbidden_path":
      return evaluateForbiddenPath(rule, ctx);
    case "forbidden_command":
      return evaluateForbiddenCommand(rule, ctx);
    case "preferred_command":
      return evaluatePreferredCommand(rule, ctx);
    case "required_command":
      return evaluateRequiredCommand(rule, ctx);
    case "required_sequence":
      return evaluateRequiredSequence(rule, ctx);
    case "exposure_only":
      return null;
    default: {
      const unhandled = rule.type;
      throw new Error(`Tipo de regla sin evaluador: ${unhandled}`);
    }
  }
}

function emptyRuleStats(rule) {
  return {
    ...rule,
    exposedSessions: 0,
    pendingSessions: 0,
    applicable: 0,
    complied: 0,
    violations: [],
    equivalences: [],
    tokensCumulative: 0,
  };
}

function userTurns(events) {
  return events.filter((event) => event.kind === "user_text").length;
}

export function analyzeSessions({
  projectDir,
  sessionRoot = projectDir,
  ruleFiles,
  currentRules,
  sessions,
  scripts = {},
  now = new Date(),
  exposureFor,
}) {
  const rules = new Map(currentRules.map((rule) => [rule.id, emptyRuleStats(rule)]));
  const report = [];

  for (const session of sessions) {
    if (!session.start) {
      report.push({ sessionId: session.session, status: "skipped", reason: "sin fecha en el transcript" });
      continue;
    }
    const exposure = exposureFor(session.start);
    const known = exposure.filter((item) => item.status === "git" || item.status === "disk");
    const unknown = exposure.filter((item) => item.status === "unknown");
    const summary = exposure.map(({ file, status, reason }) => ({ file, status, reason }));
    if (known.length === 0 && unknown.length > 0) {
      report.push({
        sessionId: session.session,
        start: session.start,
        status: "skipped",
        reason: "exposición desconocida",
        exposure: summary,
      });
      continue;
    }

    const ongoing = now - session.modifiedAt < ONGOING_WINDOW_MS;
    const ctx = {
      sessionId: session.session,
      edits: edits(session.events, sessionRoot),
      shells: shells(session.events),
      scripts,
    };
    const turns = userTurns(session.events);
    const exposedIds = new Set();

    for (const item of known) {
      for (const rule of extractInstructions(item.content, item.file)) {
        if (exposedIds.has(rule.id)) continue;
        exposedIds.add(rule.id);
        if (!rules.has(rule.id)) rules.set(rule.id, emptyRuleStats(rule));
        const stats = rules.get(rule.id);
        stats.exposedSessions += 1;
        stats.tokensCumulative += rule.tokenEstimate * turns;
        if (ongoing && END_OF_SESSION_TYPES.has(rule.type)) {
          stats.pendingSessions += 1;
          continue;
        }
        const outcome = evaluateRule(rule, ctx);
        if (!outcome) continue;
        stats.applicable += outcome.applicable;
        stats.complied += outcome.complied;
        stats.violations.push(...outcome.violations);
        stats.equivalences.push(...(outcome.equivalences ?? []));
      }
    }

    report.push({
      sessionId: session.session,
      start: session.start,
      status: "analyzed",
      ongoing,
      userTurns: turns,
      exposedRules: exposedIds.size,
      exposure: summary,
    });
  }

  return {
    projectDir,
    sessionRoot,
    ruleFiles,
    sessions: report,
    rules: [...rules.values()],
  };
}
