import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MARKERS = ['held.mjs" hook ', 'fiel.mjs" hook '];
const HOOK_COMMAND = /^("(?:[^"\\]|\\.)*")\s+("(?:[^"\\]|\\.)*")\s+hook\b/;

const isHeldHook = (command) => MARKERS.some((marker) => String(command ?? "").includes(marker));

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// Paths a Held hook command points to that no longer exist (npx cache purged,
// repo moved, Node upgraded).
export function missingHookPaths(command) {
  const match = HOOK_COMMAND.exec(String(command ?? ""));
  if (!match) return [];
  return [match[1], match[2]].map((quoted) => JSON.parse(quoted)).filter((path) => !existsSync(path));
}

function track(status, file, event, command) {
  status.installed = true;
  if (!status.events.includes(event)) status.events.push(event);
  if (!status.files.includes(file)) status.files.push(file);
  for (const path of missingHookPaths(command)) if (!status.broken.includes(path)) status.broken.push(path);
}

export function harnessHookStatus(projectDir) {
  const cursorFile = join(projectDir, ".cursor", "hooks.json");
  const claudeFiles = [join(projectDir, ".claude", "settings.local.json"), join(projectDir, ".claude", "settings.json")];
  const cursor = { installed: false, events: [], files: [], broken: [], file: cursorFile };
  const claude = { installed: false, events: [], files: [], broken: [], file: claudeFiles[0] };

  const cursorConfig = existsSync(cursorFile) ? readJson(cursorFile) : null;
  for (const [event, entries] of Object.entries(cursorConfig?.hooks ?? {})) {
    for (const entry of entries ?? []) if (isHeldHook(entry.command)) track(cursor, cursorFile, event, entry.command);
  }

  for (const file of claudeFiles) {
    const config = existsSync(file) ? readJson(file) : null;
    for (const [event, groups] of Object.entries(config?.hooks ?? {})) {
      for (const group of groups ?? []) {
        for (const hook of group.hooks ?? []) if (isHeldHook(hook.command)) track(claude, file, event, hook.command);
      }
    }
  }

  return { cursor, claude, any: cursor.installed || claude.installed, broken: [...cursor.broken, ...claude.broken] };
}
