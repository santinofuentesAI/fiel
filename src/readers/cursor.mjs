import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";

const USER_QUERY = /<user_query>\s*([\s\S]*?)\s*<\/user_query>/;
const EDIT_TOOLS = new Set(["Edit", "Write", "StrReplace", "MultiEdit", "EditNotebook"]);
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
        if (text) events.push({ session, index, role: "user", kind: "user_text", text });
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
      if (entry.name === "subagents" || entry.name === "compaction") continue;
      walk(full, out);
    } else if (entry.name.endsWith(".jsonl")) {
      out.push(full);
    }
  }
}

export function findCursorTranscripts(root = join(homedir(), ".cursor", "projects")) {
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
      files.push({ file, project, session: file.split(sep).pop().replace(".jsonl", "") });
    }
  }
  return files;
}
