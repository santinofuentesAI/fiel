import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOOK_EVENTS } from "./hooks/runtime.mjs";

export const HARNESSES = ["cursor", "claude"];
const MARKERS = ['held.mjs" hook ', 'fiel.mjs" hook '];

export function heldBinPath() {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "held.mjs");
}

/** @deprecated */
export const fielBinPath = heldBinPath;

function hookCommand({ nodePath, heldPath }, harness, event) {
  return `${JSON.stringify(nodePath)} ${JSON.stringify(heldPath)} hook ${harness} ${event}`;
}

function readConfig(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error(`${file} no es JSON válido; no lo toco.`);
  }
}

const isHeldHook = (command) => MARKERS.some((marker) => String(command ?? "").includes(marker));

// Cursor: .cursor/hooks.json, flat list per event.
export function mergeCursorHooks(config, bin) {
  const hooks = { ...(config.hooks ?? {}) };
  for (const event of Object.keys(HOOK_EVENTS.cursor)) {
    const current = (hooks[event] ?? []).filter((entry) => !isHeldHook(entry.command));
    hooks[event] = [...current, { command: hookCommand(bin, "cursor", event), timeout: 5 }];
  }
  return { ...config, version: config.version ?? 1, hooks };
}

export function stripCursorHooks(config) {
  const hooks = {};
  for (const [event, entries] of Object.entries(config.hooks ?? {})) {
    const kept = entries.filter((entry) => !isHeldHook(entry.command));
    if (kept.length > 0) hooks[event] = kept;
  }
  return { ...config, hooks };
}

// Claude Code: .claude/settings.json, groups of { matcher, hooks: [...] }.
export function mergeClaudeHooks(settings, bin) {
  const stripped = stripClaudeHooks(settings);
  const hooks = { ...(stripped.hooks ?? {}) };
  for (const event of Object.keys(HOOK_EVENTS.claude)) {
    const group = { hooks: [{ type: "command", command: hookCommand(bin, "claude", event), timeout: 5 }] };
    if (event === "PostToolUse") group.matcher = "Read";
    hooks[event] = [...(hooks[event] ?? []), group];
  }
  return { ...stripped, hooks };
}

export function stripClaudeHooks(settings) {
  if (!settings.hooks) return settings;
  const hooks = {};
  for (const [event, groups] of Object.entries(settings.hooks)) {
    const kept = groups
      .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((hook) => !isHeldHook(hook.command)) }))
      .filter((group) => group.hooks.length > 0);
    if (kept.length > 0) hooks[event] = kept;
  }
  return { ...settings, hooks };
}

// Claude Code hooks go to settings.local.json: the hook command holds absolute
// paths of this machine, and Claude Code keeps that file out of git.
// settings.json is only read to migrate hooks from Held < 0.6.
export const TARGETS = {
  cursor: {
    file: [".cursor", "hooks.json"],
    legacy: [],
    empty: { version: 1, hooks: {} },
    merge: mergeCursorHooks,
    strip: stripCursorHooks,
  },
  claude: {
    file: [".claude", "settings.local.json"],
    legacy: [[".claude", "settings.json"]],
    empty: {},
    merge: mergeClaudeHooks,
    strip: stripClaudeHooks,
  },
};

function write(file, config, dryRun) {
  if (dryRun) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}

function stripLegacy(projectDir, target, dryRun) {
  for (const parts of target.legacy) {
    const file = join(projectDir, ...parts);
    if (!existsSync(file)) continue;
    const config = readConfig(file, target.empty);
    const stripped = target.strip(config);
    if (JSON.stringify(stripped) !== JSON.stringify(config)) write(file, stripped, dryRun);
  }
}

export function isEphemeralInstall(binPath = heldBinPath()) {
  return /[\\/]_npx[\\/]/.test(binPath);
}

export function installHooks(
  projectDir,
  { harnesses = HARNESSES, nodePath = process.execPath, heldPath = heldBinPath(), fielPath, dryRun = false } = {},
) {
  const binPath = heldPath ?? fielPath ?? heldBinPath();
  return harnesses.map((harness) => {
    const target = TARGETS[harness];
    const file = join(projectDir, ...target.file);
    stripLegacy(projectDir, target, dryRun);
    const config = target.merge(readConfig(file, target.empty), { nodePath, heldPath: binPath });
    write(file, config, dryRun);
    return { harness, file, config, wrote: !dryRun };
  });
}

export function uninstallHooks(projectDir, { harnesses = HARNESSES, dryRun = false } = {}) {
  const results = [];
  for (const harness of harnesses) {
    const target = TARGETS[harness];
    for (const parts of [target.file, ...target.legacy]) {
      const file = join(projectDir, ...parts);
      if (!existsSync(file)) continue;
      const config = target.strip(readConfig(file, target.empty));
      write(file, config, dryRun);
      results.push({ harness, file, config, wrote: !dryRun });
    }
  }
  return results;
}