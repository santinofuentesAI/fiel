import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { prepareDemo } from "../src/demo.mjs";
import { analyzePath } from "../src/analyze.mjs";
import { saveLastRun, loadLastRun, diffViolations } from "../src/history.mjs";

test("dos corridas guardan last-run v2 con compactación y delta de violaciones", () => {
  const demo = prepareDemo();
  try {
    const { projects } = analyzePath(demo.projectDir, {
      cursorRoot: demo.cursorRoot,
      claudeRoot: demo.claudeRoot,
    });
    const project = projects[0];
    saveLastRun(demo.projectDir, project);
    const first = loadLastRun(demo.projectDir);
    assert.equal(first.version, 2);
    assert.ok("compactionLost" in first);
    saveLastRun(demo.projectDir, project);
    const diff = diffViolations(project, first);
    assert.equal(diff.added.length, 0);
    assert.equal(diff.resolved.length, 0);
    assert.ok(existsSync(join(demo.projectDir, ".held", "last-run.json")));
    const raw = JSON.parse(readFileSync(join(demo.projectDir, ".held", "last-run.json"), "utf8"));
    assert.equal(raw.version, 2);
  } finally {
    rmSync(demo.base, { recursive: true, force: true });
  }
});