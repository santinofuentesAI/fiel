import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureHeldDir, heldDir, readJson } from "./store.mjs";

function violationKeys(project) {
  const keys = [];
  for (const rule of project.rules) {
    for (const violation of rule.violations) {
      keys.push(`${rule.id}\t${violation.sessionId}\t${violation.tool ?? ""}\t${violation.argument ?? ""}`);
    }
  }
  return keys.sort();
}

export function loadLastRun(projectDir) {
  return readJson(join(heldDir(projectDir), "last-run.json"), () => null);
}

export function saveLastRun(projectDir, project, generatedAt = new Date()) {
  ensureHeldDir(projectDir);
  const file = join(heldDir(projectDir), "last-run.json");
  const payload = {
    version: 1,
    generatedAt: generatedAt.toISOString(),
    violationCount: violationKeys(project).length,
    violationKeys: violationKeys(project),
    sessionsAnalyzed: (project.sessions ?? []).filter((session) => session.status === "analyzed").length,
  };
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return file;
}

export function diffViolations(project, previous) {
  const current = new Set(violationKeys(project));
  const prev = new Set(previous?.violationKeys ?? []);
  const added = [...current].filter((key) => !prev.has(key));
  const resolved = [...prev].filter((key) => !current.has(key));
  return {
    previousAt: previous?.generatedAt ?? null,
    added,
    resolved,
    currentCount: current.size,
    previousCount: prev.size,
  };
}