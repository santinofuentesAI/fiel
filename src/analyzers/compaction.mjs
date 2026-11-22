import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { directiveId, extractDirectives } from "./directives.mjs";

// Rule files (AGENTS.md, CLAUDE.md, .cursor/rules) are re-sent after a compaction.
// What a compaction can drop is what the user said in the chat, so only chat
// directives are checked here.

const SUMMARY_START = "## Summary (curated by compaction step)";
const SUMMARY_END = "## Verbatim turns";
const PREFIX_PROBE = 40;

function cursorSegments(transcriptFile) {
  const dir = join(dirname(transcriptFile), "compaction");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^segment_\d+\.md$/.test(name))
    .sort()
    .map((name) => readFileSync(join(dir, name), "utf8"));
}

function cursorSummary(segment) {
  const start = segment.indexOf(SUMMARY_START);
  if (start === -1) return segment;
  const end = segment.indexOf(SUMMARY_END, start);
  return segment.slice(start + SUMMARY_START.length, end === -1 ? undefined : end);
}

function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, " ");
}

/** Whether an anchor from the user message still appears in the compaction summary. */
export function anchorInSummary(anchor, summary) {
  const summaryNorm = normalize(summary);
  const raw = anchor.toLowerCase().trim();
  if (raw.length < 3) return false;
  if (summaryNorm.includes(raw)) return true;
  const base = raw.split(/[/\\]/).pop();
  if (base && base.length >= 6 && summaryNorm.includes(base)) return true;
  return false;
}

export function directiveKeptInSummary(directive, summary) {
  if (directive.anchors.length === 0) return false;
  return directive.anchors.some((anchor) => anchorInSummary(anchor, summary));
}

// Returns the summary the agent kept after the last compaction and the user
// messages that were compacted away, or null when the session never compacted.
export function compactionView(session) {
  const userTexts = session.events.filter((event) => event.kind === "user_text");
  if (session.harness === "claude") {
    const summaries = session.events.filter((event) => event.kind === "compact_summary");
    if (summaries.length === 0) return null;
    const last = summaries.at(-1);
    return {
      summary: last.text,
      compactions: summaries.length,
      compacted: userTexts.filter((event) => event.index < last.index),
    };
  }
  const segments = cursorSegments(session.file);
  if (segments.length === 0) return null;
  const history = normalize(segments.join("\n"));
  return {
    summary: cursorSummary(segments.at(-1)),
    compactions: segments.length,
    compacted: userTexts.filter((event) => history.includes(normalize(event.text).slice(0, PREFIX_PROBE))),
  };
}

// Deterministic verdict only for directives with an anchor (code span, path,
// flag). The rest are returned as `unanchored` for an optional judge.
export function chatDirectivesAtCompact(session) {
  const view = compactionView(session);
  if (!view) return null;
  const lost = [];
  const kept = [];
  const unanchored = [];
  const seen = new Set();
  for (const event of view.compacted) {
    for (const directive of extractDirectives(event.text)) {
      const id = directiveId(session.session, directive.text);
      if (seen.has(id)) continue;
      seen.add(id);
      const item = {
        id,
        sessionId: session.session,
        harness: session.harness,
        text: directive.text,
        anchors: directive.anchors,
        at: event.timestamp ?? null,
      };
      if (directive.anchors.length === 0) unanchored.push(item);
      else if (directiveKeptInSummary(directive, view.summary)) kept.push(item);
      else lost.push(item);
    }
  }
  return { compactions: view.compactions, summary: view.summary, lost, kept, unanchored };
}
