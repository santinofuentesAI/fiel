import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzePath } from "../src/analyze.mjs";
import { EXAMPLE_DIR, prepareDemo } from "../src/demo.mjs";

const TRUTH = JSON.parse(readFileSync(join(EXAMPLE_DIR, "truth.json"), "utf8"));
const NOW = new Date("2026-11-22T00:00:00Z");

function violationsOf(project) {
  return project.rules.flatMap((rule) =>
    rule.violations.map((violation) => ({
      sessionId: violation.sessionId,
      type: rule.type,
      tool: violation.tool,
      argument: violation.argument,
    })),
  );
}

test("e2e demo-tienda (Cursor): los veredictos coinciden con la hoja de verdad", () => {
  const demo = prepareDemo();
  const emptyClaude = mkdtempSync(join(tmpdir(), "fiel-no-claude-"));
  const [project] = analyzePath(demo.projectDir, { cursorRoot: demo.cursorRoot, claudeRoot: emptyClaude, now: NOW }).projects;
  assert.equal(project.sessions.filter((session) => session.status === "analyzed").length, 5);
  assert.deepEqual(violationsOf(project), TRUTH.violations);

  const sequence = project.rules.find((rule) => rule.type === "required_sequence");
  const lint = project.rules.find((rule) => rule.type === "required_command");
  assert.equal(sequence.violations.length, 0);
  assert.equal(lint.violations.length, 0);
  assert.ok(sequence.equivalences.length >= 2);
});

test("e2e demo-tienda (Claude Code): lee tool_use con file_path y detecta la instrucción del chat perdida", () => {
  const demo = prepareDemo();
  const [project] = analyzePath(demo.projectDir, { cursorRoot: demo.cursorRoot, claudeRoot: demo.claudeRoot, now: NOW }).projects;
  const claude = project.sessions.find((session) => session.harness === "claude");
  assert.equal(claude.status, "analyzed");
  const claudeViolations = violationsOf(project).filter((item) => item.sessionId === claude.sessionId);
  assert.deepEqual(
    claudeViolations.map((item) => [item.type, item.tool, item.argument]),
    [
      ["preferred_command", "Bash", "node --test test/discounts.test.mjs"],
      ["required_sequence", "Edit", "scripts/db-reset.mjs"],
      ["required_command", "Edit", "scripts/db-reset.mjs"],
    ],
  );
  assert.equal(project.compaction.sessions, 1);
  assert.equal(project.compaction.lost.length, 1);
  assert.match(project.compaction.lost[0].text, /scripts\/db-reset\.mjs/);
});
