import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { envFirst } from "../env.mjs";

const USER_QUERY = /<user_query>\s*([\s\S]*?)\s*<\/user_query>/;
const TIMESTAMP =
  /<timestamp>\s*[A-Za-z]+,\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*\(UTC([+-]\d{1,2})(?::?(\d{2}))?\)\s*<\/timestamp>/;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const EDIT_TOOLS = new Set(["Edit", "Write", "StrReplace", "MultiEdit", "EditNotebook", "NotebookEdit"]);
const READ_TOOLS = new Set(["Read"]);
const SHELL_TOOLS = new Set(["Bash", "Shell"]);
const SEARCH_TOOLS = new Set(["Grep", "Glob"]);

export function toolFamily(name) {
  if (EDIT_TOOLS.has(name)) return "edit";
  if (READ_TOOLS.has(name)) return "read";
  if (SHELL_TOOLS.has(name)) return "shell";
  if (SEARCH_TOOLS.has(name)) return "search";
  return "other";
}

export function extractUserText(raw) {
  const match = USER_QUERY.exec(raw);
  if (match) return match[1];
  return raw.trimStart().startsWith("<") ? "" : raw;
}

export function parseCursorTimestamp(raw) {
  const match = TIMESTAMP.exec(raw);
  if (!match) return null;
  const [, monthName, day, year, hour, minute, meridiem, offsetHours, offsetMinutes] = match;
  const month = MONTHS.indexOf(monthName.slice(0, 3).toLowerCase());
  if (month === -1) return null;
  const hour24 = (Number(hour) % 12) + (meridiem === "PM" ? 12 : 0);
  const offset = Number(offsetHours);
  const offsetMin = Math.sign(offset || 1) * Number(offsetMinutes ?? 0);
  return new Date(Date.UTC(Number(year), month, Number(day), hour24 - offset, Number(minute) - offsetMin));
}

export function normalizeLine(line, session, index) {
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    return [];
  }
  const content = obj?.message?.content;
  if (!obj.role || !Array.isArray(content)) return [];
  const events = [];
  for (const block of content) {
    if (block?.type === "text" && typeof block.text === "string") {
      if (obj.role === "user") {
        const text = extractUserText(block.text);
        const timestamp = parseCursorTimestamp(block.text);
        if (text) events.push({ session, index, role: "user", kind: "user_text", text, timestamp });
      } else {
        events.push({ session, index, role: "assistant", kind: "assistant_text", text: block.text });
      }
    } else if (block?.type === "tool_use") {
      const input = block.input ?? {};
      events.push({
        session,
        index,
        role: "assistant",
        kind: "tool_use",
        tool: block.name,
        family: toolFamily(block.name),
        path: input.path ?? input.file_path ?? input.target_file ?? null,
        command: typeof input.command === "string" ? input.command : null,
      });
    }
  }
  return events;
}

export function readTranscript(file, session) {
  const events = [];
  let index = 0;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    events.push(...normalizeLine(line, session, index));
    index += 1;
  }
  return events;
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "compaction") continue;
      walk(full, out);
    } else if (entry.name.endsWith(".jsonl")) {
      out.push(full);
    }
  }
}

export function sessionStart(events) {
  for (const event of events) {
    if (event.kind === "user_text" && event.timestamp) return event.timestamp;
  }
  return null;
}

export function defaultCursorRoot() {
  return envFirst(["HELD_CURSOR_PROJECTS", "FIEL_CURSOR_PROJECTS"], join(homedir(), ".cursor", "projects"));
}

export function findCursorTranscripts(root = defaultCursorRoot()) {
  const files = [];
  let projects = [];
  try {
    projects = readdirSync(root);
  } catch {
    return files;
  }
  for (const project of projects) {
    const dir = join(root, project, "agent-transcripts");
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    const found = [];
    walk(dir, found);
    for (const file of found) {
      files.push({
        harness: "cursor",
        file,
        project,
        session: file.split(sep).pop().replace(".jsonl", ""),
        modifiedAt: statSync(file).mtime,
      });
    }
  }
  return files;
}
