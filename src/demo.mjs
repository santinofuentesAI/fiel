import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeProjectKey } from "./readers/projects.mjs";

export const EXAMPLE_DIR = fileURLToPath(new URL("../examples/demo-tienda/", import.meta.url));
const RULES_DATE = "2026-11-19T12:00:00Z";
const SESSIONS_MTIME = new Date("2026-11-21T18:00:00Z");

function git(cwd, args) {
  execFileSync("git", ["-c", "user.name=fiel", "-c", "user.email=fiel@demo", ...args], {
    cwd,
    env: { ...process.env, GIT_AUTHOR_DATE: RULES_DATE, GIT_COMMITTER_DATE: RULES_DATE },
    stdio: "ignore",
  });
}

function copySession(source, target, projectDir) {
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, readFileSync(source, "utf8").replaceAll("__ROOT__", projectDir));
  utimesSync(target, SESSIONS_MTIME, SESSIONS_MTIME);
}

// Builds a throwaway copy of the trap repo with its rules committed before the
// sessions, plus Cursor and Claude Code session folders pointing at it.
export function prepareDemo(base = mkdtempSync(join(tmpdir(), "fiel-demo-"))) {
  const projectDir = join(base, "tienda");
  mkdirSync(projectDir, { recursive: true });
  for (const file of ["AGENTS.md", "package.json"]) writeFileSync(join(projectDir, file), readFileSync(join(EXAMPLE_DIR, file)));
  git(projectDir, ["init", "-q"]);
  git(projectDir, ["add", "-A"]);
  git(projectDir, ["commit", "-q", "-m", "reglas"]);

  const cursorRoot = join(base, "cursor-projects");
  const key = encodeProjectKey(projectDir);
  for (const name of readdirSync(join(EXAMPLE_DIR, "cursor"))) {
    const session = name.replace(/\.jsonl$/, "");
    copySession(join(EXAMPLE_DIR, "cursor", name), join(cursorRoot, key, "agent-transcripts", session, name), projectDir);
  }
  const claudeRoot = join(base, "claude-projects");
  for (const name of readdirSync(join(EXAMPLE_DIR, "claude"))) {
    copySession(join(EXAMPLE_DIR, "claude", name), join(claudeRoot, key, name), projectDir);
  }
  return { base, projectDir, cursorRoot, claudeRoot };
}
