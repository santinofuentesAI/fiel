import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MAX_HOOK_STDIN_BYTES,
  parseHookStdin,
  redactSecrets,
  resolveHookProjectDir,
  sanitizeAutomationsStore,
} from "../src/security.mjs";

test("parseHookStdin rechaza JSON enorme y inválido", () => {
  assert.deepEqual(parseHookStdin("{}"), {});
  assert.deepEqual(parseHookStdin("{roto"), {});
  assert.deepEqual(parseHookStdin("x".repeat(MAX_HOOK_STDIN_BYTES + 1)), {});
});

test("resolveHookProjectDir elige el root con AGENTS.md entre varios", () => {
  const base = mkdtempSync(join(tmpdir(), "fiel-hook-root-"));
  const other = join(base, "other");
  const real = join(base, "tienda");
  mkdirSync(other, { recursive: true });
  mkdirSync(real, { recursive: true });
  writeFileSync(join(real, "AGENTS.md"), "- x\n");
  const dir = resolveHookProjectDir({
    harness: "cursor",
    env: {},
    input: { workspace_roots: [other, real] },
  });
  assert.equal(dir, real);
});

test("sanitizeAutomationsStore descarta pins aplicados sin fact y scripts en glob", () => {
  const clean = sanitizeAutomationsStore({
    version: 1,
    automations: [
      { id: "deadbeef01", kind: "pin", trigger: "session_start", status: "applied", fact: "ok" },
      { id: "deadbeef02", kind: "pin", trigger: "session_start", status: "applied", fact: "" },
      {
        id: "deadbeef03",
        kind: "pin",
        trigger: "before_read",
        status: "applied",
        fact: "no",
        glob: "/etc/passwd",
      },
      { id: "x".repeat(40), kind: "pin", trigger: "session_start", status: "applied", fact: "nope" },
    ],
  });
  assert.deepEqual(clean.automations.map((item) => item.id), ["deadbeef01"]);
});

test("redactSecrets oculta tokens comunes", () => {
  assert.match(redactSecrets("token=ghp_123456789012345678901234567890"), /\[redactado\]/);
  assert.match(redactSecrets("Bearer sk-ant-api03-abcdefghijklmnop"), /\[redactado\]/);
});