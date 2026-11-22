import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HELD_DIR = ".held";
const LEGACY_DIR = ".fiel";

const LOCAL_GITIGNORE =
  "# Generado por held: estado local del proyecto (no commitear medidas ni automatizaciones)\nlog.jsonl\nchat/\ninstructions.json\nautomations.json\nlast-run.json\n";

/** Directorio de estado del proyecto; lee `.held` o, si no existe, `.fiel` legado. */
export function heldDir(projectDir) {
  const held = join(projectDir, HELD_DIR);
  if (existsSync(held)) return held;
  const legacy = join(projectDir, LEGACY_DIR);
  if (existsSync(legacy)) return legacy;
  return held;
}

/** Siempre crea y escribe en `.held` (migra desde `.fiel` solo a nivel de lectura). */
export function ensureHeldDir(projectDir) {
  const dir = join(projectDir, HELD_DIR);
  mkdirSync(dir, { recursive: true });
  const ignore = join(dir, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, LOCAL_GITIGNORE);
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