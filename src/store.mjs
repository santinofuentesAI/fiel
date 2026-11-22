import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOCAL_ONLY = "# Generado por fiel: bitácora y notas de chat son locales\nlog.jsonl\nchat/\n";

const empty = () => ({ version: 1, automations: [] });

export function fielDir(projectDir) {
  return join(projectDir, ".fiel");
}

export function ensureFielDir(projectDir) {
  const dir = fielDir(projectDir);
  mkdirSync(dir, { recursive: true });
  const ignore = join(dir, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, LOCAL_ONLY);
  return dir;
}

export function readJson(file, fallback) {
  if (!existsSync(file)) return fallback();
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback();
  }
}

export function loadAutomations(projectDir) {
  const parsed = readJson(join(fielDir(projectDir), "automations.json"), empty);
  return { version: 1, automations: Array.isArray(parsed.automations) ? parsed.automations : [] };
}

export function saveAutomations(projectDir, store) {
  const dir = ensureFielDir(projectDir);
  writeFileSync(join(dir, "automations.json"), `${JSON.stringify(store, null, 2)}\n`);
}

export function appendLog(projectDir, event) {
  const dir = ensureFielDir(projectDir);
  appendFileSync(join(dir, "log.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
}
