import { test } from "node:test";
import assert from "node:assert/strict";
import { applySuggestion, suggestFromAnalysis, undoAutomation } from "../src/suggest.mjs";
import { formatFacts, handleHook, selectFacts } from "../src/hooks/inject.mjs";
import { saveAutomations } from "../src/store.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const now = new Date("2026-11-22T18:00:00Z");

function projectWithViolation() {
  return {
    rules: [
      {
        id: "rule-gen",
        type: "forbidden_path",
        sourceFile: "AGENTS.md",
        lineNumber: 7,
        paths: ["src/generated/*"],
        violations: [{ sessionId: "abc12345", tool: "Write", argument: "src/generated/api.ts" }],
        exposedSessions: 1,
        applicable: 1,
        tokensCumulative: 40,
      },
    ],
    lostAtCompact: [
      {
        id: "rule-rm",
        sourceFile: "AGENTS.md",
        lineNumber: 11,
        text: "Never run `rm -rf data`",
        sessionId: "abc12345",
        needle: "rm -rf data",
      },
    ],
  };
}

test("suggest propone pin before_read por forbidden_path y after_compact por lo perdido", () => {
  const suggestions = suggestFromAnalysis(projectWithViolation(), { now });
  const kinds = suggestions.map((item) => [item.kind, item.trigger, item.glob]);
  assert.deepEqual(kinds, [
    ["pin", "before_read", "src/generated/*"],
    ["pin", "after_compact", null],
  ]);
  assert.match(suggestions[0].fact, /\[AGENTS\.md:7\]/);
  assert.equal(suggestions[0].fact.includes("órdenes"), false);
});

test("apply y undo solo cambian el estado en memoria", () => {
  const [suggestion] = suggestFromAnalysis(projectWithViolation(), { now });
  const store = { version: 1, automations: [] };
  const applied = applySuggestion(store, suggestion, { now });
  assert.equal(applied.status, "applied");
  assert.equal(store.automations.length, 1);
  const undone = undoAutomation(store, suggestion.id, { now });
  assert.equal(undone.status, "undone");
});

test("el hook inyecta hechos aplicados y falla abierto si no hay nada", () => {
  const dir = mkdtempSync(join(tmpdir(), "fiel-hook-"));
  const [suggestion] = suggestFromAnalysis(projectWithViolation(), { now });
  const store = { version: 1, automations: [] };
  applySuggestion(store, suggestion, { now });
  saveAutomations(dir, store);

  const facts = selectFacts(store.automations, {
    event: "postToolUse",
    tool: "Read",
    filePath: `${dir}/src/generated/api.ts`,
  });
  assert.equal(facts.length, 1);
  const body = formatFacts(facts);
  assert.match(body, /Hechos medidos por Fiel \(no son órdenes\)/);
  assert.ok(body.length <= 700);

  const payload = handleHook({
    stdin: JSON.stringify({ tool_name: "Read", tool_input: { path: "src/generated/api.ts" } }),
    argv: ["postToolUse"],
    cwd: dir,
    dryRun: true,
  });
  assert.match(payload.additional_context, /AGENTS\.md:7/);

  const empty = handleHook({ stdin: "{", argv: ["sessionStart"], cwd: dir, dryRun: true });
  assert.deepEqual(empty, {});
});
