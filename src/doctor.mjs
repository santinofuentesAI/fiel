import { homedir } from "node:os";
import { join } from "node:path";
import { defaultCursorRoot, findCursorTranscripts } from "./readers/cursor.mjs";
import { findRuleFiles, isGitRepo } from "./analyzers/exposure.mjs";

function nodeMajor(version = process.versions.node) {
  return Number(version.split(".")[0]);
}

export function doctor({
  cwd = process.cwd(),
  nodeVersion = process.versions.node,
  cursorRoot = defaultCursorRoot(),
} = {}) {
  const checks = [];
  const major = nodeMajor(nodeVersion);
  checks.push({
    name: "node",
    required: true,
    ok: major >= 20,
    detail: major >= 20 ? `v${nodeVersion}` : `v${nodeVersion}; se necesita Node 20 o superior`,
  });

  const transcripts = findCursorTranscripts(cursorRoot);
  checks.push({
    name: "transcripts",
    required: true,
    ok: transcripts.length > 0,
    detail:
      transcripts.length > 0
        ? `${transcripts.length} sesiones de Cursor en ${cursorRoot}`
        : `no hay agent-transcripts en ${cursorRoot}`,
  });

  const ruleFiles = findRuleFiles(cwd);
  checks.push({
    name: "reglas",
    required: false,
    ok: ruleFiles.length > 0,
    detail:
      ruleFiles.length > 0
        ? `${ruleFiles.join(", ")} en ${cwd}`
        : `no hay AGENTS.md, CLAUDE.md ni .cursor/rules/ en ${cwd}`,
  });

  checks.push({
    name: "git",
    required: false,
    ok: isGitRepo(cwd),
    detail: isGitRepo(cwd)
      ? "repo git: Fiel puede reconstruir la versión de las reglas por fecha"
      : "sin git: solo se juzgan sesiones posteriores al mtime del archivo de reglas",
  });

  return {
    ok: checks.filter((check) => check.required).every((check) => check.ok),
    home: homedir(),
    cursorRoot,
    cwd,
    checks,
  };
}

export function formatDoctor(report) {
  const lines = ["fiel doctor", ""];
  for (const check of report.checks) {
    lines.push(`${check.ok ? "ok" : check.required ? "!!" : ".."}  ${check.name}: ${check.detail}`);
  }
  lines.push("");
  lines.push(report.ok ? "Listo para `fiel analyze`." : "Falta algo marcado con !!. El resto son avisos.");
  return lines.join("\n");
}
