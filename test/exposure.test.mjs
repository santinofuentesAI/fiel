import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exposureAt, findRuleFiles, sessionExposure } from "../src/analyzers/exposure.mjs";

function tempDir() {
  return mkdtempSync(join(tmpdir(), "fiel-exposure-"));
}

function gitCommit(dir, message, isoDate) {
  const env = { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate };
  const run = (args) =>
    execFileSync("git", ["-c", "user.name=fiel", "-c", "user.email=fiel@test", ...args], {
      cwd: dir,
      env,
      stdio: "ignore",
    });
  run(["add", "-A"]);
  run(["commit", "-q", "-m", message]);
}

function gitRepo() {
  const dir = tempDir();
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

test("findRuleFiles encuentra AGENTS.md, CLAUDE.md y .cursor/rules anidadas", () => {
  const dir = tempDir();
  writeFileSync(join(dir, "AGENTS.md"), "x");
  mkdirSync(join(dir, ".cursor", "rules", "db"), { recursive: true });
  writeFileSync(join(dir, ".cursor", "rules", "db", "migrations.mdc"), "x");
  writeFileSync(join(dir, ".cursor", "rules", "notas.txt"), "x");
  assert.deepEqual(findRuleFiles(dir), ["AGENTS.md", join(".cursor", "rules", "db", "migrations.mdc")]);
});

test("git: usa la versión vigente en la fecha de la sesión, no la actual", () => {
  const dir = gitRepo();
  writeFileSync(join(dir, "AGENTS.md"), "- versión 1\n");
  gitCommit(dir, "v1", "2026-10-01T12:00:00Z");
  writeFileSync(join(dir, "AGENTS.md"), "- versión 2\n");
  gitCommit(dir, "v2", "2026-10-10T12:00:00Z");

  const between = exposureAt(dir, "AGENTS.md", new Date("2026-10-05T00:00:00Z"));
  assert.equal(between.status, "git");
  assert.equal(between.content, "- versión 1\n");

  const after = exposureAt(dir, "AGENTS.md", new Date("2026-10-11T00:00:00Z"));
  assert.equal(after.content, "- versión 2\n");
});

test("git: sesión anterior al primer commit queda como unknown, no se inventa", () => {
  const dir = gitRepo();
  writeFileSync(join(dir, "AGENTS.md"), "- regla\n");
  gitCommit(dir, "v1", "2026-10-10T12:00:00Z");
  const result = exposureAt(dir, "AGENTS.md", new Date("2026-10-01T00:00:00Z"));
  assert.equal(result.status, "unknown");
  assert.equal(result.content, undefined);
});

test("git: archivo borrado antes de la sesión queda como absent", () => {
  const dir = gitRepo();
  writeFileSync(join(dir, "CLAUDE.md"), "- regla\n");
  writeFileSync(join(dir, "otro.txt"), "x");
  gitCommit(dir, "v1", "2026-10-01T12:00:00Z");
  execFileSync("git", ["rm", "-q", "CLAUDE.md"], { cwd: dir });
  gitCommit(dir, "borra", "2026-10-02T12:00:00Z");
  const result = exposureAt(dir, "CLAUDE.md", new Date("2026-10-05T00:00:00Z"));
  assert.equal(result.status, "absent");
});

test("sin git: usa el disco solo si el mtime es anterior a la sesión", () => {
  const dir = tempDir();
  const file = join(dir, "AGENTS.md");
  writeFileSync(file, "- regla\n");
  const mtime = new Date("2026-10-05T00:00:00Z");
  utimesSync(file, mtime, mtime);

  const later = exposureAt(dir, "AGENTS.md", new Date("2026-10-06T00:00:00Z"));
  assert.equal(later.status, "disk");
  assert.equal(later.content, "- regla\n");

  const earlier = exposureAt(dir, "AGENTS.md", new Date("2026-10-04T00:00:00Z"));
  assert.equal(earlier.status, "unknown");
  assert.equal(earlier.content, undefined);
});

test("repo git con archivo sin versionar cae al mtime", () => {
  const dir = gitRepo();
  writeFileSync(join(dir, "README.md"), "x");
  gitCommit(dir, "init", "2026-10-01T12:00:00Z");
  const file = join(dir, "AGENTS.md");
  writeFileSync(file, "- regla\n");
  const mtime = new Date("2026-10-05T00:00:00Z");
  utimesSync(file, mtime, mtime);
  const [result] = sessionExposure(dir, ["AGENTS.md"], new Date("2026-10-06T00:00:00Z"));
  assert.equal(result.status, "disk");
});
