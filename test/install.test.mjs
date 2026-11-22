import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeProjectKey } from "../src/readers/projects.mjs";
import { installHooks, mergeFielHooks } from "../src/install.mjs";

const BIN = fileURLToPath(new URL("../bin/fiel.mjs", import.meta.url));
const RULES = "# Reglas\n\n- Don't edit `generated/`.\n- Responde en español.\n";

function fixture() {
  const base = mkdtempSync(join(tmpdir(), "fiel-ship-"));
  const project = join(base, "tienda");
  mkdirSync(project);
  writeFileSync(join(project, "AGENTS.md"), RULES);
  const date = "2026-10-01T12:00:00Z";
  execFileSync("git", ["init", "-q"], { cwd: project });
  execFileSync("git", ["-c", "user.name=f", "-c", "user.email=f@t", "add", "-A"], { cwd: project });
  execFileSync("git", ["-c", "user.name=f", "-c", "user.email=f@t", "commit", "-q", "-m", "reglas"], {
    cwd: project,
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
  const cursorRoot = join(base, "cursor-projects");
  const sessionDir = join(cursorRoot, encodeProjectKey(project), "agent-transcripts", "abc12345");
  mkdirSync(sessionDir, { recursive: true });
  mkdirSync(join(sessionDir, "compaction"));
  writeFileSync(
    join(sessionDir, "compaction", "segment_000.md"),
    "Summary: Don't edit generated/ files by hand.\n",
  );
  writeFileSync(join(sessionDir, "compaction", "segment_001.md"), "Summary: renamed a helper and ran tests.\n");
  const lines = [
    {
      role: "user",
      message: {
        content: [
          {
            type: "text",
            text: "<timestamp>Monday, Oct 5, 2026, 9:00 AM (UTC-6)</timestamp><user_query>arregla esto</user_query>",
          },
        ],
      },
    },
    {
      role: "assistant",
      message: { content: [{ type: "tool_use", name: "Write", input: { path: join(project, "generated", "api.ts") } }] },
    },
  ];
  const transcript = join(sessionDir, "abc12345.jsonl");
  writeFileSync(transcript, lines.map((line) => JSON.stringify(line)).join("\n"));
  const old = new Date("2026-10-05T16:00:00Z");
  utimesSync(transcript, old, old);
  return { project, cursorRoot };
}

function fiel(args, cursorRoot, extra = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    env: { ...process.env, FIEL_CURSOR_PROJECTS: cursorRoot, NO_COLOR: "1" },
    ...extra,
  });
}

test("suggest / apply / undo escriben .fiel y no tocan AGENTS.md", () => {
  const { project, cursorRoot } = fixture();
  const suggested = fiel(["suggest", project, "--json"], cursorRoot);
  assert.equal(suggested.status, 0, suggested.stderr);
  const payload = JSON.parse(suggested.stdout);
  assert.ok(payload.suggestions.length >= 1);
  const pin = payload.suggestions.find((item) => item.trigger === "before_read");
  assert.ok(pin, JSON.stringify(payload.suggestions));

  const applied = fiel(["apply", pin.id, project], cursorRoot);
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stdout, /Aplicada/);
  const automations = JSON.parse(readFileSync(join(project, ".fiel", "automations.json"), "utf8"));
  assert.equal(automations.automations.find((item) => item.id === pin.id).status, "applied");
  assert.equal(readFileSync(join(project, "AGENTS.md"), "utf8"), RULES);

  const undone = fiel(["undo", pin.id, project], cursorRoot);
  assert.equal(undone.status, 0, undone.stderr);
  const after = JSON.parse(readFileSync(join(project, ".fiel", "automations.json"), "utf8"));
  assert.equal(after.automations.find((item) => item.id === pin.id).status, "undone");
});

test("analyze --json incluye instrucciones perdidas al compactar", () => {
  const { project, cursorRoot } = fixture();
  const result = fiel(["analyze", project, "--json", "--no-write"], cursorRoot);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.ok(report.projects[0].lostAtCompact.length >= 1);
  assert.equal(report.projects[0].lostAtCompact[0].sourceFile, "AGENTS.md");
});

test("install escribe hooks de Cursor y dry-run no toca el disco", () => {
  const dir = mkdtempSync(join(tmpdir(), "fiel-install-"));
  const dry = installHooks(dir, { dryRun: true, nodePath: "/usr/bin/node", fielPath: "/opt/fiel/bin/fiel.mjs" });
  assert.equal(dry.wrote, false);
  assert.equal(existsSync(join(dir, ".cursor", "hooks.json")), false);

  const wrote = installHooks(dir, { nodePath: "/usr/bin/node", fielPath: "/opt/fiel/bin/fiel.mjs" });
  assert.equal(wrote.wrote, true);
  const hooks = JSON.parse(readFileSync(join(dir, ".cursor", "hooks.json"), "utf8"));
  assert.match(hooks.hooks.sessionStart[0].command, /fiel\.mjs" inject sessionStart/);
  assert.equal(hooks.hooks.postToolUse[0].matcher, "Read");
  assert.equal(
    JSON.stringify(hooks).includes("deny"),
    false,
  );

  const again = mergeFielHooks(hooks, { nodePath: "/usr/bin/node", fielPath: "/opt/fiel/bin/fiel.mjs" });
  assert.equal(again.hooks.sessionStart.length, 1);
});

test("fiel install --dry-run no crea .cursor y el help lista los comandos nuevos", () => {
  const dir = mkdtempSync(join(tmpdir(), "fiel-install-cli-"));
  const dry = fiel(["install", dir, "--dry-run"], dir);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Dry-run/);
  assert.equal(existsSync(join(dir, ".cursor")), false);

  const help = fiel(["--help"], dir);
  assert.match(help.stdout, /fiel suggest/);
  assert.match(help.stdout, /fiel install/);
});
