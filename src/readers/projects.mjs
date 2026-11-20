import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export function encodeProjectKey(path) {
  return resolve(path).replace(/^\/+/, "").replace(/[^A-Za-z0-9]/g, "-");
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// Cursor's key collapses "/", " ", "." and "-" into "-", so the only reliable
// decoding is to walk the disk and keep the branches whose encoding is a prefix.
export function resolveProjectKey(key, root = "/") {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const candidate = join(root, entry.name);
    if (!(entry.isDirectory() || (entry.isSymbolicLink() && isDirectory(candidate)))) continue;
    const encoded = encodeProjectKey(candidate);
    if (encoded === key) return candidate;
    if (key.startsWith(`${encoded}-`)) {
      const found = resolveProjectKey(key, candidate);
      if (found) return found;
    }
  }
  return null;
}
