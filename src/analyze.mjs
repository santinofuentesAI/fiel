import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { defaultCursorRoot, findCursorTranscripts, readTranscript, sessionStart } from "./readers/cursor.mjs";
import { defaultClaudeRoot, findClaudeTranscripts, readClaudeTranscript } from "./readers/claude.mjs";
import { encodeProjectKey, resolveProjectKey } from "./readers/projects.mjs";
import { findRuleFiles, sessionExposure } from "./analyzers/exposure.mjs";
import { extractInstructions } from "./analyzers/extractor.mjs";
import { analyzeSessions } from "./analyzers/compliance.mjs";
import { loadScripts } from "./analyzers/scripts.mjs";
import { chatDirectivesAtCompact } from "./analyzers/compaction.mjs";

export class FielError extends Error {}

function readEvents(transcript) {
  return transcript.harness === "claude"
    ? readClaudeTranscript(transcript.file, transcript.session)
    : readTranscript(transcript.file, transcript.session);
}

function loadSessions(transcripts) {
  return transcripts
    .map((transcript) => {
      const events = readEvents(transcript);
      return { ...transcript, events, start: sessionStart(events) };
    })
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
}

export function currentInstructions(projectDir, ruleFiles) {
  return ruleFiles.flatMap((file) => extractInstructions(readFileSync(join(projectDir, file), "utf8"), file));
}

function compactionReport(sessions) {
  const report = { sessions: 0, compactions: 0, lost: [], kept: 0, unanchored: [] };
  for (const session of sessions) {
    const result = chatDirectivesAtCompact(session);
    if (!result) continue;
    report.sessions += 1;
    report.compactions += result.compactions;
    report.lost.push(...result.lost);
    report.kept += result.kept.length;
    report.unanchored.push(...result.unanchored.map((item) => ({ ...item, summary: result.summary })));
  }
  return report;
}

export function analyzeProject({ projectDir, sessionRoot = projectDir, transcripts, now = new Date() }) {
  const ruleFiles = findRuleFiles(projectDir);
  const currentRules = currentInstructions(projectDir, ruleFiles);
  const sessions = loadSessions(transcripts);
  const result = analyzeSessions({
    projectDir,
    sessionRoot,
    ruleFiles,
    currentRules,
    sessions,
    scripts: loadScripts(projectDir),
    now,
    exposureFor: (date) => sessionExposure(projectDir, ruleFiles, date),
  });
  return { ...result, currentRules, compaction: compactionReport(sessions), loadedSessions: sessions };
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function analyzePath(
  path,
  { cursorRoot = defaultCursorRoot(), claudeRoot = defaultClaudeRoot(), sessionsFrom = null, now = new Date() } = {},
) {
  const projectDir = resolve(path);
  if (!isDirectory(projectDir)) throw new FielError(`La ruta no existe o no es una carpeta: ${projectDir}`);
  const sessionRoot = sessionsFrom ? resolve(sessionsFrom) : projectDir;
  const key = encodeProjectKey(sessionRoot);
  const transcripts = [
    ...findCursorTranscripts(cursorRoot).filter((transcript) => transcript.project === key),
    ...findClaudeTranscripts(claudeRoot).filter((transcript) => resolve(transcript.projectDir) === sessionRoot),
  ];
  if (transcripts.length === 0) {
    throw new FielError(
      `No hay sesiones de Cursor ni de Claude Code para ${sessionsFrom ?? projectDir} (buscado como "${key}" en ${cursorRoot} y por cwd en ${claudeRoot}).`,
    );
  }
  if (findRuleFiles(projectDir).length === 0) {
    throw new FielError(`No hay archivos de reglas en ${projectDir} (AGENTS.md, CLAUDE.md o .cursor/rules/).`);
  }
  return { projects: [analyzeProject({ projectDir, sessionRoot, transcripts, now })], skippedProjects: [] };
}

function groupByProjectDir(transcripts, resolveKey) {
  const groups = new Map();
  const skipped = [];
  const cursorKeys = new Map();
  for (const transcript of transcripts) {
    let projectDir = transcript.projectDir ?? null;
    if (transcript.harness === "cursor") {
      if (/^\d+$/.test(transcript.project) || transcript.project === "empty-window") {
        skipped.push({ key: transcript.project, reason: "ventana sin carpeta de proyecto" });
        continue;
      }
      if (!cursorKeys.has(transcript.project)) cursorKeys.set(transcript.project, resolveKey(transcript.project));
      projectDir = cursorKeys.get(transcript.project);
    }
    if (!projectDir || !existsSync(projectDir)) {
      skipped.push({ key: transcript.project, reason: "la carpeta ya no existe (¿movida? usa --sessions-from)" });
      continue;
    }
    if (!groups.has(projectDir)) groups.set(projectDir, []);
    groups.get(projectDir).push(transcript);
  }
  return { groups, skipped };
}

function summarizeSkipped(skipped) {
  const counts = new Map();
  for (const item of skipped) {
    const id = `${item.key}\u0000${item.reason}`;
    const current = counts.get(id) ?? { ...item, sessions: 0 };
    current.sessions += 1;
    counts.set(id, current);
  }
  return [...counts.values()];
}

export function analyzeAll({
  cursorRoot = defaultCursorRoot(),
  claudeRoot = defaultClaudeRoot(),
  now = new Date(),
  resolveKey = resolveProjectKey,
} = {}) {
  const transcripts = [...findCursorTranscripts(cursorRoot), ...findClaudeTranscripts(claudeRoot)];
  if (transcripts.length === 0) throw new FielError(`No hay sesiones de Cursor (${cursorRoot}) ni de Claude Code (${claudeRoot}).`);
  const { groups, skipped } = groupByProjectDir(transcripts, resolveKey);
  const projects = [];
  for (const [projectDir, group] of groups) {
    if (findRuleFiles(projectDir).length === 0) {
      skipped.push(...group.map(() => ({ key: projectDir, projectDir, reason: "sin archivos de reglas" })));
      continue;
    }
    projects.push(analyzeProject({ projectDir, transcripts: group, now }));
  }
  return { projects, skippedProjects: summarizeSkipped(skipped) };
}
