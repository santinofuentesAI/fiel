import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { toolFamily } from "./cursor.mjs";

// Lines Claude Code writes on the user's behalf: slash-command echoes, local
// command output and reminders. They are not instructions from the user.
const SYNTHETIC_USER_TEXT = /^\s*<(?:command-name|command-message|command-args|local-command-stdout|local-command-stderr|system-reminder)\b/;
const HEAD_BYTES = 64 * 1024;

export function defaultClaudeRoot() {
  return process.env.FIEL_CLAUDE_PROJECTS ?? join(homedir(), ".claude", "projects");
}

function textBlocks(content) {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  return content.filter((block) => block?.type === "text" && typeof block.text === "string").map((block) => block.text);
}

function toolEvent(block, session, index) {
  const input = block.input ?? {};
  return {
    session,
    index,
    role: "assistant",
    kind: "tool_use",
    id: block.id ?? null,
    tool: block.name,
    family: toolFamily(block.name),
    path: input.file_path ?? input.notebook_path ?? input.path ?? null,
    command: typeof input.command === "string" ? input.command : null,
    failed: false,
  };
}

export function readClaudeTranscript(file, session) {
  const events = [];
  const byToolId = new Map();
  let index = 0;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      index += 1;
      continue;
    }
    const content = record?.message?.content;
    const timestamp = record.timestamp ? new Date(record.timestamp) : null;
    if (record.type === "user" && record.isCompactSummary) {
      events.push({ session, index, role: "user", kind: "compact_summary", text: textBlocks(content).join("\n"), timestamp });
    } else if (record.type === "user" && !record.isMeta) {
      for (const text of textBlocks(content)) {
        if (text.trim() && !SYNTHETIC_USER_TEXT.test(text)) {
          events.push({ session, index, role: "user", kind: "user_text", text, timestamp });
        }
      }
      for (const block of Array.isArray(content) ? content : []) {
        if (block?.type === "tool_result" && block.is_error === true && byToolId.has(block.tool_use_id)) {
          byToolId.get(block.tool_use_id).failed = true;
        }
      }
    } else if (record.type === "assistant" && Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === "text" && typeof block.text === "string") {
          events.push({ session, index, role: "assistant", kind: "assistant_text", text: block.text });
        } else if (block?.type === "tool_use") {
          const event = toolEvent(block, session, index);
          if (event.id) byToolId.set(event.id, event);
          events.push(event);
        }
      }
    }
    index += 1;
  }
  return events;
}

function headCwd(file) {
  const fd = openSync(file, "r");
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const read = readSync(fd, buffer, 0, HEAD_BYTES, 0);
    for (const line of buffer.subarray(0, read).toString("utf8").split("\n")) {
      try {
        const record = JSON.parse(line);
        if (typeof record.cwd === "string") return record.cwd;
      } catch {
        // the last line of the chunk may be cut; keep looking
      }
    }
    return null;
  } finally {
    closeSync(fd);
  }
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
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".jsonl")) out.push(full);
  }
}

// Claude Code stores each session under ~/.claude/projects/<encoded cwd>/.
// The encoding is lossy, so the project is taken from the `cwd` field instead.
export function findClaudeTranscripts(root = defaultClaudeRoot()) {
  const files = [];
  walk(root, files);
  return files
    .map((file) => {
      const cwd = headCwd(file);
      return {
        harness: "claude",
        file,
        project: cwd ?? basename(join(file, "..")),
        projectDir: cwd,
        session: basename(file, ".jsonl"),
        modifiedAt: statSync(file).mtime,
      };
    })
    .filter((transcript) => transcript.projectDir);
}
