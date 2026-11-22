import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installHooks, isEphemeralInstall, uninstallHooks } from "../src/install.mjs";
import { harnessHookStatus } from "../src/install-status.mjs";

const BIN = { nodePath: "/usr/bin/node", heldPath: "/opt/held/bin/held.mjs" };
const read = (file) => JSON.parse(readFileSync(file, "utf8"));

function projectWithExistingHooks() {
  const dir = mkdtempSync(join(tmpdir(), "fiel-install-"));
  mkdirSync(join(dir, ".cursor"));
  mkdirSync(join(dir, ".claude"));
  writeFileSync(join(dir, ".cursor", "hooks.json"), JSON.stringify({ version: 1, hooks: { sessionStart: [{ command: "echo mio" }] } }));
  writeFileSync(
    join(dir, ".claude", "settings.json"),
    JSON.stringify({ model: "opus", hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo guard" }] }] } }),
  );
  return dir;
}

test("install agrega los hooks de Held sin borrar los del usuario y es idempotente", () => {
  const dir = projectWithExistingHooks();
  installHooks(dir, BIN);
  installHooks(dir, BIN);

  const cursor = read(join(dir, ".cursor", "hooks.json"));
  assert.deepEqual(Object.keys(cursor.hooks).sort(), ["beforeSubmitPrompt", "postToolUse", "preCompact", "sessionStart"]);
  assert.equal(cursor.hooks.sessionStart.length, 2);
  assert.equal(cursor.hooks.sessionStart[0].command, "echo mio");
  assert.match(cursor.hooks.sessionStart[1].command, /held\.mjs" hook cursor sessionStart$/);

  const shared = read(join(dir, ".claude", "settings.json"));
  assert.equal(shared.model, "opus");
  assert.deepEqual(Object.keys(shared.hooks), ["PreToolUse"], "settings.json (compartido) no recibe rutas de esta máquina");
  const claude = read(join(dir, ".claude", "settings.local.json"));
  assert.equal(claude.hooks.SessionStart.length, 1);
  assert.equal(claude.hooks.PostToolUse[0].matcher, "Read");
  assert.match(claude.hooks.PreCompact[0].hooks[0].command, /held\.mjs" hook claude PreCompact$/);
  assert.equal(JSON.stringify([cursor, claude]).includes("deny"), false);
});

test("install migra hooks de Held viejos de settings.json a settings.local.json", () => {
  const dir = projectWithExistingHooks();
  const legacy = read(join(dir, ".claude", "settings.json"));
  legacy.hooks.SessionStart = [{ hooks: [{ type: "command", command: '"/usr/bin/node" "/old/fiel.mjs" hook claude SessionStart' }] }];
  writeFileSync(join(dir, ".claude", "settings.json"), JSON.stringify(legacy));
  installHooks(dir, { ...BIN, harnesses: ["claude"] });
  assert.deepEqual(Object.keys(read(join(dir, ".claude", "settings.json")).hooks), ["PreToolUse"]);
  assert.equal(read(join(dir, ".claude", "settings.local.json")).hooks.SessionStart.length, 1);
});

test("doctor ve hooks que apuntan a rutas que ya no existen", () => {
  const dir = projectWithExistingHooks();
  installHooks(dir, { nodePath: process.execPath, heldPath: "/tmp/npx-borrado/_npx/abc/held.mjs", harnesses: ["cursor"] });
  const status = harnessHookStatus(dir);
  assert.ok(status.cursor.installed);
  assert.deepEqual(status.broken, ["/tmp/npx-borrado/_npx/abc/held.mjs"]);
  assert.equal(isEphemeralInstall("/home/u/.npm/_npx/abc/node_modules/held/bin/held.mjs"), true);
  assert.equal(isEphemeralInstall("/usr/lib/node_modules/held/bin/held.mjs"), false);
});

test("uninstall quita solo lo de Held; dry-run no escribe", () => {
  const dir = projectWithExistingHooks();
  installHooks(dir, BIN);
  uninstallHooks(dir);
  assert.deepEqual(read(join(dir, ".cursor", "hooks.json")).hooks, { sessionStart: [{ command: "echo mio" }] });
  assert.deepEqual(Object.keys(read(join(dir, ".claude", "settings.json")).hooks), ["PreToolUse"]);

  const fresh = mkdtempSync(join(tmpdir(), "fiel-install-dry-"));
  const results = installHooks(fresh, { ...BIN, dryRun: true, harnesses: ["claude"] });
  assert.equal(results.length, 1);
  assert.equal(results[0].wrote, false);
  assert.equal(existsSync(join(fresh, ".claude")), false);
});

test("install no pisa un archivo de configuración con JSON inválido", () => {
  const dir = mkdtempSync(join(tmpdir(), "fiel-install-bad-"));
  mkdirSync(join(dir, ".cursor"));
  writeFileSync(join(dir, ".cursor", "hooks.json"), "{ roto");
  assert.throws(() => installHooks(dir, { ...BIN, harnesses: ["cursor"] }), /no es JSON válido/);
  assert.equal(readFileSync(join(dir, ".cursor", "hooks.json"), "utf8"), "{ roto");
});
