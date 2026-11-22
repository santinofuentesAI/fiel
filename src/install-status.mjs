import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MARKERS = ['held.mjs" hook ', 'fiel.mjs" hook '];

const isHeldHook = (command) => MARKERS.some((marker) => String(command ?? "").includes(marker));

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function harnessHookStatus(projectDir) {
  const cursorFile = join(projectDir, ".cursor", "hooks.json");
  const claudeFile = join(projectDir, ".claude", "settings.json");
  const cursor = { installed: false, events: [], file: cursorFile };
  const claude = { installed: false, events: [], file: claudeFile };

  const cursorConfig = existsSync(cursorFile) ? readJson(cursorFile) : null;
  if (cursorConfig?.hooks) {
    for (const [event, entries] of Object.entries(cursorConfig.hooks)) {
      if ((entries ?? []).some((entry) => isHeldHook(entry.command))) {
        cursor.installed = true;
        cursor.events.push(event);
      }
    }
  }

  const claudeConfig = existsSync(claudeFile) ? readJson(claudeFile) : null;
  if (claudeConfig?.hooks) {
    for (const [event, groups] of Object.entries(claudeConfig.hooks)) {
      if ((groups ?? []).some((group) => (group.hooks ?? []).some((hook) => isHeldHook(hook.command)))) {
        claude.installed = true;
        claude.events.push(event);
      }
    }
  }

  return { cursor, claude, any: cursor.installed || claude.installed };
}