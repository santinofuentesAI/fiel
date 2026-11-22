import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctor, formatDoctor } from "../src/doctor.mjs";

test("doctor exige Node 20 y transcripts; git y reglas son avisos", () => {
  const cursorRoot = mkdtempSync(join(tmpdir(), "fiel-doc-cursor-"));
  const cwd = mkdtempSync(join(tmpdir(), "fiel-doc-cwd-"));
  const empty = doctor({ cwd, cursorRoot, nodeVersion: "18.0.0" });
  assert.equal(empty.ok, false);
  assert.equal(empty.checks.find((check) => check.name === "node").ok, false);

  mkdirSync(join(cursorRoot, "p", "agent-transcripts", "s"), { recursive: true });
  writeFileSync(join(cursorRoot, "p", "agent-transcripts", "s", "s.jsonl"), "{}\n");
  writeFileSync(join(cwd, "AGENTS.md"), "- x\n");
  const ready = doctor({ cwd, cursorRoot, nodeVersion: "22.1.0" });
  assert.equal(ready.ok, true);
  assert.match(formatDoctor(ready), /Listo para `fiel analyze`/);
});
