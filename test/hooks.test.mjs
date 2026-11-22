import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHook, selectFacts } from "../src/hooks/runtime.mjs";
import { saveAutomations } from "../src/store.mjs";
import { applySuggestion, suggestFromAnalysis } from "../src/suggest.mjs";
import { projectWithFindings } from "./helpers/findings.mjs";

const PROMPT = "Arreglá el total. Ojo: no toques `scripts/db-reset.mjs`.";

function projectWithAutomations() {
  const dir = mkdtempSync(join(tmpdir(), "fiel-hook-"));
  const store = { version: 1, automations: [] };
  for (const item of suggestFromAnalysis(projectWithFindings())) applySuggestion(store, item);
  saveAutomations(dir, store);
  return { dir, store };
}

const run = (dir, harness, event, input) => runHook({ harness, event, projectDir: dir, stdin: JSON.stringify(input) });

test("before_read: inyecta el hecho solo al leer una ruta que coincide", () => {
  const { dir, store } = projectWithAutomations();
  const hit = selectFacts(store.automations, { moment: "tool", tool: "Read", filePath: join(dir, "src/generated/api.ts"), projectDir: dir });
  const miss = selectFacts(store.automations, { moment: "tool", tool: "Read", filePath: join(dir, "src/cart.mjs"), projectDir: dir });
  assert.equal(hit.length, 1);
  assert.equal(miss.length, 0);

  const output = JSON.parse(run(dir, "cursor", "postToolUse", { tool_name: "Read", tool_input: { path: "src/generated/api.ts" } }));
  assert.match(output.additional_context, /información, no órdenes/);
  const claude = JSON.parse(run(dir, "claude", "PostToolUse", { tool_name: "Read", tool_input: { file_path: join(dir, "src/generated/api.ts") } }));
  assert.equal(claude.hookSpecificOutput.hookEventName, "PostToolUse");
});

test("Claude Code: guarda lo pedido en el chat, lo pide al resumen y lo reinyecta tras compactar", () => {
  const { dir } = projectWithAutomations();
  const base = { session_id: "conv-1", cwd: dir };
  run(dir, "claude", "UserPromptSubmit", { ...base, prompt: PROMPT });
  const chat = JSON.parse(readFileSync(join(dir, ".held", "chat", "conv-1.json"), "utf8"));
  assert.deepEqual(chat.directives.map((item) => item.text), ["Ojo: no toques `scripts/db-reset.mjs`."]);
  assert.deepEqual(chat.directives[0].anchors, ["scripts/db-reset.mjs"]);

  const preCompact = run(dir, "claude", "PreCompact", { ...base, trigger: "auto" });
  assert.match(preCompact, /^Keep these instructions the user wrote in this chat verbatim/);
  assert.match(preCompact, /scripts\/db-reset\.mjs/);
  assert.match(preCompact, /Include these exact tokens/);

  assert.doesNotMatch(run(dir, "claude", "SessionStart", { ...base, source: "startup" }), /antes de compactar/);
  const compact = JSON.parse(run(dir, "claude", "SessionStart", { ...base, source: "compact" }));
  const context = compact.hookSpecificOutput.additionalContext;
  assert.match(context, /antes de compactar/);
  assert.equal(context.match(/scripts\/db-reset\.mjs/g).length, 1, "el hecho after_compact repetido se omite");
});

test("Cursor: preCompact marca la conversación y el siguiente postToolUse reinyecta una sola vez", () => {
  const { dir } = projectWithAutomations();
  const base = { conversation_id: "c-9", workspace_roots: [dir] };
  assert.deepEqual(JSON.parse(run(dir, "cursor", "beforeSubmitPrompt", { ...base, prompt: PROMPT })), { continue: true });
  const pre = JSON.parse(run(dir, "cursor", "preCompact", { ...base, trigger: "auto" }));
  assert.match(pre.user_message, /reinyectar 1 instrucciones/);
  const first = JSON.parse(run(dir, "cursor", "postToolUse", { ...base, tool_name: "Shell", tool_input: { command: "ls" } }));
  assert.match(first.additional_context, /scripts\/db-reset\.mjs/);
  const second = JSON.parse(run(dir, "cursor", "postToolUse", { ...base, tool_name: "Shell", tool_input: { command: "ls" } }));
  assert.deepEqual(second, {});
});

test("falla abierto: JSON inválido, evento desconocido y sin .held/", () => {
  const dir = mkdtempSync(join(tmpdir(), "fiel-hook-empty-"));
  assert.equal(runHook({ harness: "cursor", event: "sessionStart", projectDir: dir, stdin: "{roto" }), "{}");
  assert.equal(runHook({ harness: "cursor", event: "inventado", projectDir: dir, stdin: "{}" }), "{}");
  assert.equal(runHook({ harness: "claude", event: "SessionStart", projectDir: dir, stdin: "{}" }), "");
  assert.equal(runHook({ harness: "claude", event: "Stop", projectDir: dir, stdin: "{}", dryRun: true }), "");
  assert.ok(existsSync(join(dir, ".held", ".gitignore")));
});

test("hook: revocar en el chat borra la instrucción guardada y no la reinyecta", () => {
  const { dir } = projectWithAutomations();
  const base = { session_id: "conv-rev", cwd: dir };
  run(dir, "claude", "UserPromptSubmit", { ...base, prompt: PROMPT });
  run(dir, "claude", "UserPromptSubmit", { ...base, prompt: "Ya podés tocar `scripts/db-reset.mjs`." });
  const chat = JSON.parse(readFileSync(join(dir, ".held", "chat", "conv-rev.json"), "utf8"));
  assert.deepEqual(chat.directives, []);
  assert.equal(run(dir, "claude", "PreCompact", { ...base, trigger: "auto" }), "");
});
