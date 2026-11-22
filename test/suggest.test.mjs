import { test } from "node:test";
import assert from "node:assert/strict";
import { applySuggestion, findAutomation, mergeSuggestions, suggestFromAnalysis, undoAutomation } from "../src/suggest.mjs";
import { projectWithFindings } from "./helpers/findings.mjs";

const now = new Date("2026-11-22T18:00:00Z");

test("suggest: before_read por forbidden_path y after_compact por la instrucción del chat perdida", () => {
  const suggestions = suggestFromAnalysis(projectWithFindings(), { now });
  assert.deepEqual(
    suggestions.map((item) => [item.kind, item.trigger, item.glob]),
    [
      ["pin", "before_read", "src/generated/*"],
      ["pin", "after_compact", null],
    ],
  );
  assert.match(suggestions[0].fact, /\[AGENTS\.md:7\]/);
  assert.match(suggestions[1].fact, /scripts\/db-reset\.mjs/);
});

test("findAutomation no adivina con prefijo ambiguo", () => {
  const store = {
    version: 1,
    automations: [
      { id: "abc1111111", status: "proposed" },
      { id: "abc2222222", status: "proposed" },
    ],
  };
  assert.equal(findAutomation(store, "abc"), null);
  assert.equal(findAutomation(store, "abc1111111")?.id, "abc1111111");
});

test("apply y undo cambian solo el estado; merge no duplica", () => {
  const suggestions = suggestFromAnalysis(projectWithFindings(), { now });
  const store = mergeSuggestions(mergeSuggestions({ version: 1, automations: [] }, suggestions), suggestions);
  assert.equal(store.automations.length, 2);
  assert.equal(store.automations[0].status, "proposed");
  assert.equal(applySuggestion(store, store.automations[0], { now }).status, "applied");
  assert.equal(undoAutomation(store, store.automations[0].id, { now }).status, "undone");
  assert.equal(undoAutomation(store, "nope", { now }), null);
});
