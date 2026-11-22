import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EVENTS = ["sessionStart", "preCompact", "beforeSubmitPrompt", "postToolUse"];

export function fielBinPath() {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "fiel.mjs");
}

function loadHooks(file) {
  if (!existsSync(file)) return { version: 1, hooks: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return { version: 1, hooks: parsed.hooks && typeof parsed.hooks === "object" ? parsed.hooks : {} };
  } catch {
    return { version: 1, hooks: {} };
  }
}

function alreadyHasFiel(entries) {
  return (entries ?? []).some((entry) => {
    const command = String(entry.command ?? "");
    return command.includes("fiel.mjs") && command.includes(" inject ");
  });
}

export function mergeFielHooks(existing, { nodePath, fielPath }) {
  const hooks = { ...existing.hooks };
  for (const event of EVENTS) {
    const command = `${JSON.stringify(nodePath)} ${JSON.stringify(fielPath)} inject ${event}`;
    const entry = {
      command,
      timeout: 8,
      ...(event === "postToolUse" ? { matcher: "Read" } : {}),
    };
    const current = Array.isArray(hooks[event]) ? [...hooks[event]] : [];
    if (!alreadyHasFiel(current)) current.push(entry);
    hooks[event] = current;
  }
  return { version: 1, hooks };
}

export function installHooks(projectDir, { nodePath = process.execPath, fielPath = fielBinPath(), dryRun = false } = {}) {
  const cursorDir = join(projectDir, ".cursor");
  const hooksFile = join(cursorDir, "hooks.json");
  const merged = mergeFielHooks(loadHooks(hooksFile), { nodePath, fielPath });
  if (dryRun) return { hooksFile, merged, wrote: false };
  mkdirSync(cursorDir, { recursive: true });
  writeFileSync(hooksFile, `${JSON.stringify(merged, null, 2)}\n`);
  chmodSync(hooksFile, 0o644);
  return { hooksFile, merged, wrote: true };
}
