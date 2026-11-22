import { resolve } from "node:path";
import { analyzePath } from "./analyze.mjs";
import { harnessHookStatus } from "./install-status.mjs";
import { installHooks } from "./install.mjs";
import { saveLastRun } from "./history.mjs";
import { loadAutomations, saveAutomations } from "./store.mjs";
import { applySuggestion, mergeSuggestions, suggestFromAnalysis } from "./suggest.mjs";
import { writeInstructions } from "./analyzers/extractor.mjs";

/**
 * Close the loop for context loss: measure → propose → apply pins → install hooks.
 * Targets chat instructions that compaction tends to drop, not AGENTS.md rules.
 */
export function runOnboard(
  projectDir,
  {
    write = true,
    dryRun = false,
    install = true,
    harnesses,
    cursorRoot,
    claudeRoot,
    sessionsFrom = null,
    now = new Date(),
  } = {},
) {
  const dir = resolve(projectDir);
  const { projects } = analyzePath(dir, { cursorRoot, claudeRoot, sessionsFrom, now });
  const project = projects[0];
  let writtenFile = null;
  if (write && !dryRun) {
    writtenFile = writeInstructions(dir, project.currentRules, now);
    saveLastRun(dir, project);
  }
  const suggestions = suggestFromAnalysis(project, { now });
  const store = mergeSuggestions(loadAutomations(dir), suggestions);
  const applied = [];
  for (const item of suggestions) {
    if (item.kind !== "pin" || item.review) continue;
    if (!dryRun) applySuggestion(store, item, { now });
    applied.push(item);
  }
  if (write && !dryRun) saveAutomations(dir, store);
  const hooksBefore = harnessHookStatus(dir);
  let hookResults = [];
  if (install && !dryRun) {
    hookResults = installHooks(dir, { harnesses });
  }
  return {
    projectDir: dir,
    writtenFile,
    suggestions,
    applied,
    hooksBefore,
    hookResults,
    compaction: project.compaction,
    exposureHints: project.exposureHints ?? [],
    violations: project.rules.reduce((sum, rule) => sum + rule.violations.length, 0),
  };
}