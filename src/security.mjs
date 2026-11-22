import { existsSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export const MAX_HOOK_STDIN_BYTES = 256 * 1024;
export const MAX_FACT_CHARS = 400;
export const MAX_AUTOMATIONS = 48;

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /\bgho_[A-Za-z0-9]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi,
  /\b(?:api[_-]?key|password|secret|token)\s*[=:]\s*\S+/gi,
];

export function redactSecrets(text) {
  if (typeof text !== "string" || text.length === 0) return text;
  let out = text;
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, "[redactado]");
  return out;
}

export function parseHookStdin(stdin) {
  if (typeof stdin !== "string" || stdin.length > MAX_HOOK_STDIN_BYTES) return {};
  const trimmed = stdin.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    return {};
  }
}

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// Cursor can pass several workspace roots; pick the one that looks like a dev project.
export function resolveHookProjectDir({ harness, env = process.env, input = {} }) {
  const candidates = [];
  if (harness === "claude") {
    if (env.CLAUDE_PROJECT_DIR) candidates.push(env.CLAUDE_PROJECT_DIR);
    if (input.cwd) candidates.push(input.cwd);
  } else {
    if (env.CURSOR_PROJECT_DIR) candidates.push(env.CURSOR_PROJECT_DIR);
    if (Array.isArray(input.workspace_roots)) candidates.push(...input.workspace_roots);
  }
  candidates.push(process.cwd());

  const score = (dir) => {
    let points = 0;
    if (existsSync(resolve(dir, "AGENTS.md"))) points += 4;
    if (existsSync(resolve(dir, "CLAUDE.md"))) points += 3;
    if (existsSync(resolve(dir, ".git"))) points += 2;
    if (existsSync(resolve(dir, ".fiel"))) points += 1;
    return points;
  };

  let best = null;
  let bestScore = -1;
  for (const raw of candidates) {
    if (!raw) continue;
    const dir = resolve(String(raw));
    if (!isDir(dir)) continue;
    const points = score(dir);
    if (points > bestScore || (points === bestScore && best === null)) {
      best = dir;
      bestScore = points;
    }
    if (points >= 4) return dir;
  }
  return best ?? resolve(String(candidates.find(Boolean) ?? process.cwd()));
}

function cleanText(text, max) {
  if (typeof text !== "string") return "";
  return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").slice(0, max);
}

const TRIGGERS = new Set(["session_start", "after_compact", "before_prompt", "before_read"]);

export function sanitizeAutomationsStore(store) {
  if (!store || typeof store !== "object") return { version: 1, automations: [] };
  const automations = (Array.isArray(store.automations) ? store.automations : [])
    .slice(0, MAX_AUTOMATIONS)
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      if (item.kind !== "pin" && item.kind !== "prune") return [];
      if (typeof item.id !== "string" || item.id.length < 8 || item.id.length > 32) return [];
      if (!TRIGGERS.has(item.trigger)) return [];
      if (item.status !== "applied" && item.status !== "proposed" && item.status !== "undone") return [];
      const fact = cleanText(item.fact, MAX_FACT_CHARS);
      if (item.kind === "pin" && item.status === "applied" && !fact) return [];
      if (item.trigger === "before_read" && item.status === "applied") {
        if (typeof item.glob !== "string" || !item.glob || isAbsolute(item.glob)) return [];
      }
      return [
        {
          ...item,
          fact,
          glob: typeof item.glob === "string" ? item.glob.slice(0, 120) : null,
          sourceFile: cleanText(item.sourceFile ?? "", 80),
        },
      ];
    });
  return { version: 1, automations };
}