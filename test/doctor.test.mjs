import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctor, formatDoctor } from "../src/doctor.mjs";

const offline = async () => ({ ok: false, detail: "ECONNREFUSED" });

test("doctor exige Node 20 y sesiones; git, reglas y Jev son avisos", async () => {
  const cursorRoot = mkdtempSync(join(tmpdir(), "fiel-doc-cursor-"));
  const claudeRoot = mkdtempSync(join(tmpdir(), "fiel-doc-claude-"));
  const cwd = mkdtempSync(join(tmpdir(), "fiel-doc-cwd-"));
  const empty = await doctor({ cwd, cursorRoot, claudeRoot, nodeVersion: "18.0.0", health: offline });
  assert.equal(empty.ok, false);
  assert.equal(empty.checks.find((check) => check.name === "node").ok, false);

  mkdirSync(join(claudeRoot, "-tmp-x"), { recursive: true });
  writeFileSync(join(claudeRoot, "-tmp-x", "s.jsonl"), `${JSON.stringify({ type: "user", cwd: "/tmp/x" })}\n`);
  writeFileSync(join(cwd, "AGENTS.md"), "- x\n");
  const ready = await doctor({ cwd, cursorRoot, claudeRoot, nodeVersion: "22.1.0", health: offline });
  assert.equal(ready.ok, true);
  assert.match(ready.checks.find((check) => check.name === "sesiones").detail, /1 de Claude Code/);
  assert.equal(ready.checks.find((check) => check.name === "jev").ok, false);
  assert.match(formatDoctor(ready), /Listo para `fiel analyze`/);
});
