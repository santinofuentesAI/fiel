import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const empty = () => ({ version: 1, automations: [] });

export function fielDir(projectDir) {
  return join(projectDir, ".fiel");
}

export function loadAutomations(projectDir) {
  const file = join(fielDir(projectDir), "automations.json");
  if (!existsSync(file)) return empty();
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return { version: 1, automations: Array.isArray(parsed.automations) ? parsed.automations : [] };
  } catch {
    return empty();
  }
}

export function saveAutomations(projectDir, store) {
  const dir = fielDir(projectDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "automations.json"), `${JSON.stringify(store, null, 2)}\n`);
}

export function appendLog(projectDir, event) {
  const dir = fielDir(projectDir);
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, "log.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
}
