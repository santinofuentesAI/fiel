import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzePath } from "../src/analyze.mjs";
import { encodeProjectKey } from "../src/readers/projects.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/demo-tienda/", import.meta.url));
const TRUTH = JSON.parse(readFileSync(join(FIXTURE, "truth.json"), "utf8"));

function git(cwd, args, env = {}) {
  execFileSync("git", ["-c", "user.name=fiel", "-c", "user.email=fiel@test", ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: "ignore",
  });
}

test("e2e demo-tienda: los veredictos coinciden con la hoja de verdad", () => {
  const projectDir = mkdtempSync(join(tmpdir(), "fiel-demo-"));
  writeFileSync(join(projectDir, "AGENTS.md"), readFileSync(join(FIXTURE, "AGENTS.md")));
  writeFileSync(join(projectDir, "package.json"), readFileSync(join(FIXTURE, "package.json")));
  git(projectDir, ["init", "-q"]);
  git(projectDir, ["add", "-A"]);
  git(projectDir, ["commit", "-q", "-m", "reglas"], {
    GIT_AUTHOR_DATE: "2026-11-19T12:00:00Z",
    GIT_COMMITTER_DATE: "2026-11-19T12:00:00Z",
  });

  const cursorRoot = mkdtempSync(join(tmpdir(), "fiel-cursor-"));
  const key = encodeProjectKey(projectDir);
  const old = new Date("2026-11-20T12:00:00Z");
  for (const name of readdirSync(join(FIXTURE, "sessions"))) {
    const sid = name.replace(/\.jsonl$/, "");
    const dir = join(cursorRoot, key, "agent-transcripts", sid);
    mkdirSync(dir, { recursive: true });
    const body = readFileSync(join(FIXTURE, "sessions", name), "utf8").replaceAll("__ROOT__", projectDir);
    const file = join(dir, name);
    writeFileSync(file, body);
    utimesSync(file, old, old);
  }

  const result = analyzePath(projectDir, { cursorRoot, now: new Date("2026-11-21T00:00:00Z") });
  const [project] = result.projects;
  assert.equal(project.sessions.filter((session) => session.status === "analyzed").length, 5);
  const violations = project.rules.flatMap((rule) =>
    rule.violations.map((violation) => ({
      sessionId: violation.sessionId,
      type: rule.type,
      tool: violation.tool,
      argument: violation.argument,
    })),
  );
  assert.deepEqual(violations, TRUTH.violations);

  const sequence = project.rules.find((rule) => rule.type === "required_sequence");
  const lint = project.rules.find((rule) => rule.type === "required_command");
  assert.equal(sequence.violations.length, 0);
  assert.equal(lint.violations.length, 0);
  assert.ok(sequence.equivalences.length >= 2);
});
