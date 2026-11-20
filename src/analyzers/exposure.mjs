import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT_RULE_FILES = ["AGENTS.md", "CLAUDE.md"];
const RULES_DIR = join(".cursor", "rules");
const RULE_EXTENSIONS = /\.(md|mdc)$/;

function git(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function walkRules(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkRules(full, out);
    else if (RULE_EXTENSIONS.test(entry.name)) out.push(full);
  }
}

export function findRuleFiles(projectDir) {
  const files = ROOT_RULE_FILES.filter((name) => existsSync(join(projectDir, name)));
  const nested = [];
  walkRules(join(projectDir, RULES_DIR), nested);
  return [...files, ...nested.map((full) => relative(projectDir, full)).sort()];
}

export function isGitRepo(projectDir) {
  return git(projectDir, ["rev-parse", "--is-inside-work-tree"])?.trim() === "true";
}

function gitExposure(projectDir, file, date) {
  const everCommitted = git(projectDir, ["log", "-n", "1", "--format=%H", "--", file])?.trim();
  if (!everCommitted) return null;
  const commit = git(projectDir, [
    "log",
    "-n",
    "1",
    `--before=${date.toISOString()}`,
    "--format=%H",
    "--",
    file,
  ])?.trim();
  if (!commit) {
    return {
      file,
      status: "unknown",
      reason: "versionado en git, pero sin commits anteriores a la sesión",
    };
  }
  const content = git(projectDir, ["show", `${commit}:./${file}`]);
  if (content === null) {
    return { file, status: "absent", reason: "borrado en git antes de la sesión", commit };
  }
  return { file, status: "git", reason: `commit ${commit.slice(0, 7)}`, commit, content };
}

function diskExposure(projectDir, file, date) {
  const full = join(projectDir, file);
  let stats;
  try {
    stats = statSync(full);
  } catch {
    return { file, status: "unknown", reason: "no existe en disco ni en git" };
  }
  if (stats.mtime < date) {
    return {
      file,
      status: "disk",
      reason: "sin historial git; mtime anterior a la sesión",
      content: readFileSync(full, "utf8"),
    };
  }
  return {
    file,
    status: "unknown",
    reason: "sin historial git y modificado después de la sesión",
  };
}

export function exposureAt(projectDir, file, date, { gitRepo = isGitRepo(projectDir) } = {}) {
  if (gitRepo) {
    const fromGit = gitExposure(projectDir, file, date);
    if (fromGit) return fromGit;
  }
  return diskExposure(projectDir, file, date);
}

export function sessionExposure(projectDir, files, date) {
  const gitRepo = isGitRepo(projectDir);
  return files.map((file) => exposureAt(projectDir, file, date, { gitRepo }));
}
