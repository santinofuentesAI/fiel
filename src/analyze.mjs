import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { defaultCursorRoot, findCursorTranscripts, readTranscript, sessionStart } from "./readers/cursor.mjs";
import { encodeProjectKey, resolveProjectKey } from "./readers/projects.mjs";
import { findRuleFiles, sessionExposure } from "./analyzers/exposure.mjs";
import { extractInstructions } from "./analyzers/extractor.mjs";
import { analyzeSessions } from "./analyzers/compliance.mjs";
import { loadScripts } from "./analyzers/scripts.mjs";
import { lostAtCompact as findLostAtCompact } from "./analyzers/compaction.mjs";

export class FielError extends Error {}

function groupByProject(transcripts) {
  const groups = new Map();
  for (const transcript of transcripts) {
    if (!groups.has(transcript.project)) groups.set(transcript.project, []);
    groups.get(transcript.project).push(transcript);
  }
  return groups;
}

function loadSessions(transcripts) {
  return transcripts
    .map((transcript) => {
      const events = readTranscript(transcript.file, transcript.session);
      return { ...transcript, events, start: sessionStart(events) };
    })
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
}

export function currentInstructions(projectDir, ruleFiles) {
  return ruleFiles.flatMap((file) => extractInstructions(readFileSync(join(projectDir, file), "utf8"), file));
}

function sessionText(session) {
  return session.events
    .map((event) => [event.text, event.path, event.command].filter(Boolean).join("\n"))
    .join("\n");
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
  const lostAtCompact = [];
  for (const session of sessions) {
    for (const item of findLostAtCompact({
      transcriptFile: session.file,
      transcriptText: sessionText(session),
      instructions: currentRules,
    })) {
      lostAtCompact.push({ ...item, sessionId: session.session });
    }
  }
  return { ...result, currentRules, lostAtCompact };
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function analyzePath(path, { cursorRoot = defaultCursorRoot(), sessionsFrom = null, now = new Date() } = {}) {
  const projectDir = resolve(path);
  if (!isDirectory(projectDir)) throw new FielError(`La ruta no existe o no es una carpeta: ${projectDir}`);
  const sessionRoot = sessionsFrom ? resolve(sessionsFrom) : projectDir;
  const key = encodeProjectKey(sessionRoot);
  const transcripts = findCursorTranscripts(cursorRoot).filter((transcript) => transcript.project === key);
  if (transcripts.length === 0) {
    throw new FielError(
      `No hay sesiones de Cursor para ${sessionsFrom ?? projectDir} (buscado como "${key}" en ${cursorRoot}).`,
    );
  }
  if (findRuleFiles(projectDir).length === 0) {
    throw new FielError(`No hay archivos de reglas en ${projectDir} (AGENTS.md, CLAUDE.md o .cursor/rules/).`);
  }
  return { projects: [analyzeProject({ projectDir, sessionRoot, transcripts, now })], skippedProjects: [] };
}

export function analyzeAll({ cursorRoot = defaultCursorRoot(), now = new Date(), resolveKey = resolveProjectKey } = {}) {
  const transcripts = findCursorTranscripts(cursorRoot);
  if (transcripts.length === 0) throw new FielError(`No hay sesiones de Cursor en ${cursorRoot}.`);
  const projects = [];
  const skippedProjects = [];
  for (const [key, group] of groupByProject(transcripts)) {
    const projectDir = resolveKey(key);
    if (/^\d+$/.test(key) || key === "empty-window") {
      skippedProjects.push({ key, sessions: group.length, reason: "ventana sin carpeta de proyecto" });
      continue;
    }
    if (!projectDir || !existsSync(projectDir)) {
      skippedProjects.push({ key, sessions: group.length, reason: "la carpeta ya no existe (¿movida? usa --sessions-from)" });
      continue;
    }
    if (findRuleFiles(projectDir).length === 0) {
      skippedProjects.push({ key, projectDir, sessions: group.length, reason: "sin archivos de reglas" });
      continue;
    }
    projects.push(analyzeProject({ projectDir, transcripts: group, now }));
  }
  return { projects, skippedProjects };
}
