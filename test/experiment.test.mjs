import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzePath } from "../src/analyze.mjs";
import { EXPERIMENT_DIR, prepareExperimentRun } from "../src/demo.mjs";

const NOW = new Date("2026-11-23T12:00:00Z");
const emptyClaude = mkdtempSync(join(tmpdir(), "held-exp-claude-"));

function arm(name) {
  const perSession = [];
  for (const n of [1, 2, 3, 4, 5]) {
    const run = prepareExperimentRun(join(EXPERIMENT_DIR, `${name}-${n}.jsonl`));
    try {
      const [project] = analyzePath(run.projectDir, { cursorRoot: run.cursorRoot, claudeRoot: emptyClaude, now: NOW }).projects;
      assert.equal(project.sessions[0].status, "analyzed", `${name}-${n}`);
      perSession.push(project.rules.reduce((sum, rule) => sum + rule.violations.length, 0));
    } finally {
      rmSync(run.base, { recursive: true, force: true });
    }
  }
  return { total: perSession.reduce((a, b) => a + b, 0), sessionsWithViolations: perSession.filter(Boolean).length, perSession };
}

test("experimento: mismas 5 tareas y modelo, el control viola 13 veces y con los hechos de Held 2", () => {
  const control = arm("ctrl");
  const treated = arm("pin");
  assert.deepEqual(control.perSession, [1, 5, 0, 1, 6]);
  assert.deepEqual(treated.perSession, [0, 2, 0, 0, 0]);
  assert.equal(control.total, 13);
  assert.equal(treated.total, 2);
  assert.equal(control.sessionsWithViolations, 4);
  assert.equal(treated.sessionsWithViolations, 1);
});
