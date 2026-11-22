import { relative, isAbsolute } from "node:path";
import { extractDirectives } from "../analyzers/directives.mjs";
import { redactSecrets } from "../security.mjs";
import { positiveScore } from "./gate.mjs";

const MAX_ACTIONS = 80;

function actionLines(session, projectDir) {
  return session.events
    .filter((event) => event.kind === "tool_use" && (event.family === "edit" || event.family === "shell"))
    .slice(-MAX_ACTIONS)
    .map((event) => {
      if (event.command) return redactSecrets(`${event.tool}: ${event.command.slice(0, 160)}`);
      const path = event.path && isAbsolute(event.path) ? relative(projectDir, event.path) : event.path;
      return redactSecrets(`${event.tool}: ${path}`);
    });
}

// Only rules the patterns cannot verify and that read like a do/don't.
function judgeableRules(project) {
  return project.rules.filter((rule) => !rule.verifiable && extractDirectives(rule.text).length > 0);
}

// Probabilistic findings are returned apart from the deterministic ones and
// never become violations of verifiable rules.
export async function judgeProject(project, { ask, gate }) {
  const findings = { model: gate.model, checked: 0, violations: [], lostAtCompact: [], skipped: [] };
  const violation = gate.tasks.violation;
  const preserved = gate.tasks.preserved;

  if (violation?.passed) {
    const rules = judgeableRules(project);
    const analyzed = new Map(project.sessions.filter((item) => item.status === "analyzed").map((item) => [item.sessionId, item]));
    for (const session of project.loadedSessions) {
      const report = analyzed.get(session.session);
      if (!report) continue;
      const actions = actionLines(session, project.sessionRoot ?? project.projectDir);
      if (actions.length === 0) continue;
      const exposed = new Set(report.exposedRuleIds ?? []);
      for (const rule of rules.filter((item) => exposed.has(item.id))) {
        const { probability } = await ask("violation", { instruction: rule.text, actions });
        findings.checked += 1;
        if (positiveScore("violation", probability) >= violation.threshold) {
          findings.violations.push({
            ruleId: rule.id,
            sourceFile: rule.sourceFile,
            lineNumber: rule.lineNumber,
            text: rule.text,
            sessionId: session.session,
            probability,
          });
        }
      }
    }
  } else findings.skipped.push("violation");

  if (preserved?.passed) {
    for (const item of project.compaction?.unanchored ?? []) {
      const { probability } = await ask("preserved", { instruction: item.text, summary: item.summary });
      findings.checked += 1;
      if (positiveScore("preserved", probability) >= preserved.threshold) {
        findings.lostAtCompact.push({ id: item.id, sessionId: item.sessionId, text: item.text, probabilityKept: probability });
      }
    }
  } else findings.skipped.push("preserved");

  return findings;
}
