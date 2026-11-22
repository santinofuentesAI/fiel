import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeLine, extractUserText, toolFamily, findCursorTranscripts } from "../src/readers/cursor.mjs";

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

test("normalizeLine guarda la fecha del mensaje del usuario", () => {
  const [event] = normalizeLine(
    line({
      role: "user",
      message: { content: [{ type: "text", text: "<timestamp>Friday, Nov 20, 2026, 10:29 AM (UTC-6)</timestamp>\n<user_query>hola</user_query>" }] },
    }),
    "s",
    0,
  );
  assert.equal(event.timestamp.toISOString(), "2026-11-20T16:29:00.000Z");
});

test("findCursorTranscripts incluye jsonl de subagents y omite compaction", () => {
  const root = mkdtempSync(join(tmpdir(), "fiel-cursor-"));
  const base = join(root, "proj", "agent-transcripts", "sess");
  mkdirSync(join(base, "subagents"), { recursive: true });
  mkdirSync(join(base, "compaction"), { recursive: true });
  writeFileSync(join(base, "sess.jsonl"), "{}\n");
  writeFileSync(join(base, "subagents", "child.jsonl"), "{}\n");
  writeFileSync(join(base, "compaction", "ignored.jsonl"), "{}\n");
  const found = findCursorTranscripts(root).map((item) => item.session).sort();
  assert.deepEqual(found, ["child", "sess"]);
});
