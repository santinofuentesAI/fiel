import { createHash } from "node:crypto";
import { isPathLike } from "./extractor.mjs";

const DIRECTIVE = new RegExp(
  [
    "\\b(?:nunca|siempre|jam[aá]s)\\b",
    "\\bno\\s+(?:toques|toqu[eé]s|uses|us[eé]s|edites|edit[eé]s|hagas|hag[aá]s|corras|corr[aá]s|borres|borr[eé]s|cambies|cambi[eé]s|modifiques|modifiqu[eé]s|instales|instal[eé]s|subas|sub[aá]s|agregues|agreg[uú][eé]s|metas|met[aá]s|pongas|pong[aá]s|ejecutes|ejecut[eé]s|leas|le[aá]s|abras|abr[aá]s)\\b",
    "\\b(?:don['’]?t|do not|never|always|must not|avoid)\\b",
    "\\b(?:en (?:vez|lugar) de|instead of|rather than)\\b",
    "\\b(?:us[aá]|usar|prefer[ií]|prefer)\\s+`",
  ].join("|"),
  "i",
);
// Sentences Cursor injects inside the user's message (plan mode, subagent
// notices). Verified in real transcripts; they are not the user's rules.
const HARNESS_TEMPLATES = [
  /do not edit the plan file itself/i,
  /do not create them again/i,
  /don't stop until you have completed all the to-?dos/i,
  /if there's no follow-ups needed/i,
  /if you mention an agent or subagent in your response/i,
];
const CODE_SPAN = /`([^`]+)`/g;
const FLAG = /(?:^|\s)(--?[a-z][\w-]+)/gi;
const MIN_LENGTH = 8;
const MAX_LENGTH = 240;

function sentences(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim())
    .filter((part) => part.length >= MIN_LENGTH && part.length <= MAX_LENGTH);
}

export function anchorsOf(text) {
  const anchors = new Set();
  for (const match of text.matchAll(CODE_SPAN)) anchors.add(match[1].trim().toLowerCase());
  for (const token of text.replace(CODE_SPAN, " ").split(/[\s,;:()"'«»]+/)) {
    const clean = token.replace(/[.!?]+$/, "");
    if (clean.length >= 4 && !clean.includes("://") && isPathLike(clean)) anchors.add(clean.toLowerCase());
  }
  for (const match of text.matchAll(FLAG)) anchors.add(match[1].toLowerCase());
  return [...anchors].filter((anchor) => anchor.length >= 3);
}

export function directiveId(sessionId, text) {
  return createHash("sha1").update(`${sessionId}\n${text.toLowerCase().replace(/\s+/g, " ").trim()}`).digest("hex").slice(0, 10);
}

export function extractDirectives(text) {
  const seen = new Set();
  const out = [];
  for (const sentence of sentences(text)) {
    if (!DIRECTIVE.test(sentence) || HARNESS_TEMPLATES.some((template) => template.test(sentence))) continue;
    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: sentence, anchors: anchorsOf(sentence) });
  }
  return out;
}
