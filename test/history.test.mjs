import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diffViolations, loadLastRun, saveLastRun } from "../src/history.mjs";

const project = {
  rules: [
    {
      id: "rule-a",
      violations: [{ sessionId: "sess-1", tool: "Shell", argument: "npm test" }],
    },
  ],
};

test("saveLastRun y diffViolations marcan violaciones nuevas y resueltas", () => {
  const dir = mkdtempSync(join(tmpdir(), "fiel-history-"));
  saveLastRun(dir, { rules: [{ id: "rule-a", violations: [] }] });
  const delta = diffViolations(project, loadLastRun(dir));
  assert.equal(delta.added.length, 1);
  assert.equal(delta.resolved.length, 0);
  saveLastRun(dir, project);
  const delta2 = diffViolations({ rules: [{ id: "rule-a", violations: [] }] }, loadLastRun(dir));
  assert.equal(delta2.resolved.length, 1);
});