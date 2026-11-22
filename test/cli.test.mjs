import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeProjectKey } from "../src/readers/projects.mjs";

const BIN = fileURLToPath(new URL("../bin/fiel.mjs", import.meta.url));
const RULES = "# Reglas\n\n- Don't edit `generated/`.\n- Responde en español.\n";

function fixture() {
  const base = mkdtempSync(join(tmpdir(), "fiel-cli-"));
  const project = join(base, "mi proyecto");
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
  const lines = [
    { role: "user", message: { content: [{ type: "text", text: "<timestamp>Monday, Oct 5, 2026, 9:00 AM (UTC-6)</timestamp><user_query>arregla esto</user_query>" }] } },
    { role: "assistant", message: { content: [{ type: "tool_use", name: "Write", input: { path: join(project, "generated", "api.ts") } }] } },
  ];
  const transcript = join(sessionDir, "abc12345.jsonl");
  writeFileSync(transcript, lines.map((line) => JSON.stringify(line)).join("\n"));
  const old = new Date("2026-10-05T16:00:00Z");
  utimesSync(transcript, old, old);
  return { project, cursorRoot };
}

function fiel(args, cursorRoot) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      FIEL_CURSOR_PROJECTS: cursorRoot,
      FIEL_CLAUDE_PROJECTS: join(cursorRoot, "no-claude"),
      NO_COLOR: "1",
    },
  });
}

test("analyze --json reporta la violación con evidencia y escribe .fiel/instructions.json", () => {
  const { project, cursorRoot } = fixture();
  const result = fiel(["analyze", project, "--json"], cursorRoot);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  const [rule] = report.projects[0].rules.filter((item) => item.verifiable);
  assert.equal(rule.lineNumber, 3);
  assert.deepEqual(
    rule.violations.map((v) => [v.sessionId, v.tool, v.argument]),
    [["abc12345", "Write", "generated/api.ts"]],
  );
  assert.equal(report.projects[0].sessions[0].exposure[0].status, "git");
  assert.ok(existsSync(join(project, ".fiel", "instructions.json")));
  assert.equal(readFileSync(join(project, "AGENTS.md"), "utf8"), RULES);
});

test("analyze en texto muestra el origen [archivo:línea]", () => {
  const { project, cursorRoot } = fixture();
  const result = fiel(["analyze", project], cursorRoot);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[AGENTS\.md:3\] sesión abc12345 · Write generated\/api\.ts/);
});

test("help y version salen 0", () => {
  const { cursorRoot } = fixture();
  const help = fiel(["--help"], cursorRoot);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /fiel analyze/);
  assert.match(help.stdout, /fiel doctor/);
  const ver = fiel(["--version"], cursorRoot);
  assert.equal(ver.status, 0);
  assert.match(ver.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test("errores claros con código 1: sin sesiones, sin reglas, opción inválida", () => {
  const { project, cursorRoot } = fixture();
  const empty = mkdtempSync(join(tmpdir(), "fiel-empty-"));

  const noSessions = fiel(["analyze", empty], cursorRoot);
  assert.equal(noSessions.status, 1);
  assert.match(noSessions.stderr, /No hay sesiones de Cursor/);

  const noRules = fiel(["analyze", empty, "--sessions-from", project], cursorRoot);
  assert.equal(noRules.status, 1);
  assert.match(noRules.stderr, /No hay archivos de reglas/);

  const badOption = fiel(["analyze", "--nope"], cursorRoot);
  assert.equal(badOption.status, 1);
  assert.match(badOption.stderr, /Opción desconocida/);
});
