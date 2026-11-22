import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeAutomationsStore } from "./security.mjs";
import { ensureHeldDir, heldDir, readJson } from "./paths.mjs";

const empty = () => ({ version: 1, automations: [] });

export { heldDir, ensureHeldDir, readJson };

export function loadAutomations(projectDir) {
  const parsed = readJson(join(heldDir(projectDir), "automations.json"), empty);
  return sanitizeAutomationsStore(parsed);
}

export function saveAutomations(projectDir, store) {
  const dir = ensureHeldDir(projectDir);
  writeFileSync(join(dir, "automations.json"), `${JSON.stringify(store, null, 2)}\n`);
}

export function appendLog(projectDir, event) {
  const dir = ensureHeldDir(projectDir);
  appendFileSync(join(dir, "log.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
}