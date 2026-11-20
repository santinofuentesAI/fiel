import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const SCRIPT_CALL = /^(?:npm|pnpm|yarn|bun)\s+(?:run(?:-script)?\s+)?([\w:.-]+)/;
const RUNNER_PREFIX = /^(?:npx|bunx|pnpx|pnpm\s+(?:exec|dlx)|yarn\s+(?:exec|dlx)|npm\s+exec)\s+(?:--\s+)?/;
const MUTATING = /(?:^|\s)(?:--write|--fix|-w|fix)(?:\s|$)/;
const MAX_DEPTH = 5;
const INTERPRETERS = new Set(["node", "python", "python3", "deno", "bash", "sh", "ruby"]);
const SUBCOMMAND = /^[a-z][\w:-]*$/;

function readScripts(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8")).scripts ?? {};
  } catch {
    return {};
  }
}

export function loadScripts(projectDir) {
  const scripts = {};
  const add = (file) => {
    for (const [name, body] of Object.entries(readScripts(file))) {
      if (typeof body !== "string") continue;
      (scripts[name] ??= []).push(body);
    }
  };
  add(join(projectDir, "package.json"));
  let entries = [];
  try {
    entries = readdirSync(projectDir, { withFileTypes: true });
  } catch {
    return scripts;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) {
      add(join(projectDir, entry.name, "package.json"));
    }
  }
  return scripts;
}

export function splitSegments(command) {
  return command
    .split(/\s*(?:&&|\|\||;|\||\n)\s*/)
    .map((segment) => segment.trim().replace(/^(?:[A-Z_][A-Z0-9_]*=\S*\s+)+/, ""))
    .filter(Boolean);
}

// "npx tsc --noEmit" -> "tsc", "cargo test -p x" -> "cargo test", "node a.mjs" -> "node a.mjs".
export function signatureOf(segment) {
  const [first = "", ...rest] = segment.replace(RUNNER_PREFIX, "").split(/\s+/);
  const binary = basename(first);
  if (INTERPRETERS.has(binary)) {
    const script = rest.find((token) => !token.startsWith("-"));
    return script ? `${binary} ${script}` : binary;
  }
  return rest[0] && SUBCOMMAND.test(rest[0]) ? `${binary} ${rest[0]}` : binary;
}

export function isMutating(segment) {
  return MUTATING.test(segment);
}

export function isEquivalent(segment, leaf) {
  if (isMutating(segment) || signatureOf(segment) !== signatureOf(leaf)) return false;
  return !leaf.includes("--check") || segment.includes("--check");
}

// Returns the leaf commands a script alias runs, e.g. "npm run typecheck" -> ["tsc -b"].
export function expandCommand(command, scripts, seen = new Set()) {
  const name = SCRIPT_CALL.exec(command)?.[1];
  const bodies = name ? scripts[name] : undefined;
  if (!bodies || seen.size >= MAX_DEPTH) return [command];
  if (seen.has(name)) return [];
  const nextSeen = new Set(seen).add(name);
  const leaves = bodies.flatMap((body) =>
    splitSegments(body).flatMap((segment) => expandCommand(segment, scripts, nextSeen)),
  );
  return leaves.length > 0 ? leaves : [command];
}
