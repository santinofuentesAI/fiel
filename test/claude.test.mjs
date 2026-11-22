import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findClaudeTranscripts, readClaudeTranscript } from "../src/readers/claude.mjs";

const line = (record) => JSON.stringify({ cwd: "/work/tienda", sessionId: "s1", ...record });

function transcript() {
  const dir = mkdtempSync(join(tmpdir(), "fiel-claude-"));
  mkdirSync(join(dir, "-work-tienda"));
  const file = join(dir, "-work-tienda", "s1.jsonl");
  writeFileSync(
    file,
    [
      JSON.stringify({ type: "file-history-snapshot" }),
      line({ type: "user", isMeta: true, timestamp: "2026-11-21T15:00:00Z", message: { role: "user", content: "Caveat: generated" } }),
      line({ type: "user", timestamp: "2026-11-21T15:00:01Z", message: { role: "user", content: "<command-name>/clear</command-name>" } }),
      line({ type: "user", timestamp: "2026-11-21T15:00:02Z", message: { role: "user", content: "arreglá el total" } }),
      line({
        type: "assistant",
        timestamp: "2026-11-21T15:00:03Z",
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", id: "t1", name: "Edit", input: { file_path: "/work/tienda/src/cart.mjs" } },
            { type: "tool_use", id: "t2", name: "Bash", input: { command: "npm test" } },
          ],
        },
      }),
      line({
        type: "user",
        timestamp: "2026-11-21T15:00:04Z",
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", is_error: true, content: "1 failing" }] },
      }),
      line({ type: "system", subtype: "compact_boundary", timestamp: "2026-11-21T15:30:00Z" }),
      line({ type: "user", isCompactSummary: true, timestamp: "2026-11-21T15:30:00Z", message: { role: "user", content: "Summary: total fixed." } }),
      "{ cortado",
    ].join("\n"),
  );
  return { dir, file };
}

test("readClaudeTranscript: texto real del usuario, tool_use con file_path, fallo y resumen de compactación", () => {
  const { file } = transcript();
  const events = readClaudeTranscript(file, "s1");
  const users = events.filter((event) => event.kind === "user_text");
  assert.deepEqual(users.map((event) => event.text), ["arreglá el total"]);
  assert.equal(users[0].timestamp.toISOString(), "2026-11-21T15:00:02.000Z");
  const tools = events.filter((event) => event.kind === "tool_use");
  assert.deepEqual(
    tools.map((event) => [event.tool, event.family, event.path, event.command, event.failed]),
    [
      ["Edit", "edit", "/work/tienda/src/cart.mjs", null, false],
      ["Bash", "shell", null, "npm test", true],
    ],
  );
  assert.equal(events.filter((event) => event.kind === "compact_summary").length, 1);
});

test("findClaudeTranscripts toma el proyecto del campo cwd", () => {
  const { dir } = transcript();
  const [found] = findClaudeTranscripts(dir);
  assert.equal(found.harness, "claude");
  assert.equal(found.projectDir, "/work/tienda");
  assert.equal(found.session, "s1");
});
