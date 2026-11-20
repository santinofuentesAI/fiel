import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeLine, extractUserText, toolFamily } from "../src/readers/cursor.mjs";
import { classifyUserText, findFriction } from "../src/analyzers/friction.mjs";

const line = (obj) => JSON.stringify(obj);

test("extractUserText toma solo lo de <user_query>", () => {
  const raw = "<timestamp>Friday</timestamp>\n<user_query>\nhola mundo\n</user_query>";
  assert.equal(extractUserText(raw), "hola mundo");
});

test("extractUserText descarta mensajes de sistema sin user_query", () => {
  assert.equal(extractUserText("<system_reminder>algo</system_reminder>"), "");
});

test("toolFamily agrupa herramientas de Cursor y Claude Code", () => {
  assert.equal(toolFamily("StrReplace"), "edit");
  assert.equal(toolFamily("Edit"), "edit");
  assert.equal(toolFamily("Bash"), "shell");
  assert.equal(toolFamily("Shell"), "shell");
  assert.equal(toolFamily("Read"), "read");
  assert.equal(toolFamily("CreatePlan"), "other");
});

test("normalizeLine convierte tool_use con ruta y comando", () => {
  const events = normalizeLine(
    line({
      role: "assistant",
      message: { content: [
        { type: "tool_use", name: "StrReplace", input: { path: "/a/b.ts" } },
        { type: "tool_use", name: "Shell", input: { command: "npm test" } },
      ] },
    }),
    "s1",
    3,
  );
  assert.equal(events.length, 2);
  assert.deepEqual([events[0].family, events[0].path], ["edit", "/a/b.ts"]);
  assert.deepEqual([events[1].family, events[1].command], ["shell", "npm test"]);
});

test("normalizeLine ignora líneas de estado y JSON inválido", () => {
  assert.deepEqual(normalizeLine(line({ status: "x", type: "y" }), "s", 0), []);
  assert.deepEqual(normalizeLine("{no es json", "s", 0), []);
});

test("classifyUserText distingue corrección, confusión y texto normal", () => {
  assert.equal(classifyUserText("no, te dije que usaras bun")?.category, "correction");
  assert.equal(classifyUserText("no entiendo qué hiciste")?.category, "confusion");
  assert.equal(classifyUserText("perfecto, sigue con el siguiente paso"), null);
});

test("classifyUserText ignora pegados largos", () => {
  assert.equal(classifyUserText(`te dije ${"x".repeat(700)}`), null);
});

test("findFriction solo cuenta si el agente actuó antes y no es el primer mensaje", () => {
  const events = [
    { kind: "user_text", text: "te dije que no toques eso", session: "s", index: 0 },
    { kind: "tool_use", tool: "Edit", family: "edit", path: "a.ts", session: "s", index: 1 },
    { kind: "user_text", text: "otra vez lo mismo", session: "s", index: 2 },
    { kind: "assistant_text", text: "ok", session: "s", index: 3 },
    { kind: "user_text", text: "de nuevo", session: "s", index: 4 },
  ];
  const incidents = findFriction(events);
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].index, 2);
  assert.equal(incidents[0].previousTools[0].tool, "Edit");
});
