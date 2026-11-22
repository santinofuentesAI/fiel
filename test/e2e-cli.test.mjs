import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareDemo } from "../src/demo.mjs";

const BIN = fileURLToPath(new URL("../bin/held.mjs", import.meta.url));

function cli(demo, args, input = "") {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd: demo.projectDir,
    input,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", HELD_CURSOR_PROJECTS: demo.cursorRoot, HELD_CLAUDE_PROJECTS: demo.claudeRoot },
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

test("e2e CLI: onboard → report → hooks con compactación → doctor → uninstall", () => {
  const demo = prepareDemo();
  try {
    const onboard = cli(demo, ["onboard"]);
    assert.equal(onboard.code, 0, onboard.err);
    assert.match(onboard.out, /ok hooks cursor/);
    assert.match(onboard.out, /ok hooks claude: .*settings\.local\.json/);
    assert.equal(existsSync(join(demo.projectDir, ".claude", "settings.json")), false, "no toca el settings compartido");

    const report = cli(demo, ["report", "--json"]);
    assert.equal(report.code, 0, report.err);
    const [project] = JSON.parse(report.out).projects;
    assert.ok(project.recommendedActions.includes("suggest"));
    assert.ok(Array.isArray(JSON.parse(report.out).pinEffects));

    const strict = cli(demo, ["report", "--no-write", "--fail-on-violations", "--fail-on-compaction-lost"]);
    assert.equal(strict.code, 1);
    assert.match(strict.out, /Efecto de los pins aplicados/);

    const conversation = { session_id: "e2e", cwd: demo.projectDir };
    cli(demo, ["hook", "claude", "UserPromptSubmit"], JSON.stringify({ ...conversation, prompt: "Nunca corras `rm -rf data`. No toques `src/generated/*`." }));
    cli(demo, ["hook", "claude", "UserPromptSubmit"], JSON.stringify({ ...conversation, prompt: "Ya podés tocar `src/generated/*`." }));
    const pre = cli(demo, ["hook", "claude", "PreCompact"], JSON.stringify({ ...conversation, trigger: "auto" }));
    assert.match(pre.out, /rm -rf data/);
    assert.doesNotMatch(pre.out, /src\/generated/, "lo revocado no se pide conservar");
    const after = JSON.parse(cli(demo, ["hook", "claude", "SessionStart"], JSON.stringify({ ...conversation, source: "compact" })).out);
    assert.match(after.hookSpecificOutput.additionalContext, /vale lo más reciente/);

    const doctor = cli(demo, ["doctor"]);
    assert.match(doctor.out, /hooks: Cursor/);
    assert.doesNotMatch(doctor.out, /ROTOS/);

    assert.equal(cli(demo, ["uninstall"]).code, 0);
    const local = JSON.parse(readFileSync(join(demo.projectDir, ".claude", "settings.local.json"), "utf8"));
    assert.deepEqual(local.hooks, {});
  } finally {
    rmSync(demo.base, { recursive: true, force: true });
  }
});

test("e2e CLI: errores claros sin stack trace", () => {
  const demo = prepareDemo();
  try {
    const missing = cli(demo, ["report", "/no/existe"]);
    assert.equal(missing.code, 1);
    assert.match(missing.err, /^held: La ruta no existe/);
    const bad = cli(demo, ["onboard", "--nope"]);
    assert.equal(bad.code, 1);
    assert.doesNotMatch(bad.err, /at .*\.mjs/);
  } finally {
    rmSync(demo.base, { recursive: true, force: true });
  }
});
