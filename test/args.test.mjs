import { test } from "node:test";
import assert from "node:assert/strict";
import { UsageError, parseArgs } from "../src/cli/args.mjs";

test("parseArgs asigna posicionales por comando y lee banderas con valor", () => {
  const apply = parseArgs(["apply", "pin-1", "../repo", "--json"]);
  assert.equal(apply.command, "apply");
  assert.equal(apply.id, "pin-1");
  assert.equal(apply.path, "../repo");
  assert.equal(apply.json, true);

  const analyze = parseArgs(["analyze", "--judge", "jev", "--sessions-from", "2026-11-01", "--no-write"]);
  assert.equal(analyze.judge, "jev");
  assert.equal(analyze.sessionsFrom, "2026-11-01");
  assert.equal(analyze.write, false);

  assert.deepEqual([parseArgs(["hook", "claude", "PreCompact"]).harness, parseArgs(["hook", "claude", "PreCompact"]).event], ["claude", "PreCompact"]);
  assert.equal(parseArgs(["--version"]).version, true);
});

test("parseArgs rechaza con UsageError lo que no entiende", () => {
  assert.throws(() => parseArgs(["analizar"]), UsageError);
  assert.throws(() => parseArgs(["analyze", "--rapido"]), /Opción desconocida/);
  assert.throws(() => parseArgs(["analyze", "--judge"]), /necesita un valor/);
  assert.throws(() => parseArgs(["analyze", "--judge", "gpt"]), /Juez desconocido/);
  assert.throws(() => parseArgs(["demo", "extra"]), /Argumento de más/);
});
