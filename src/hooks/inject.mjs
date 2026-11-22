import { appendLog, loadAutomations } from "../store.mjs";

const MAX_CHARS = 700;

function globMatch(glob, filePath) {
  if (!glob || !filePath) return false;
  const path = filePath.replace(/\\/g, "/");
  const clean = glob.replace(/^\.\//, "");
  const stem = clean.replace(/\/?\*+$/, "");
  if (stem && path.includes(stem)) return true;
  const escaped = clean.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
  return new RegExp(escaped).test(path);
}

export function selectFacts(automations, { event, tool, filePath }) {
  const applied = automations.filter((item) => item.status === "applied" && item.kind === "pin");
  return applied.filter((item) => {
    switch (item.trigger) {
      case "session_start":
        return event === "sessionStart" || event === "beforeSubmitPrompt";
      case "after_compact":
        return event === "preCompact" || event === "sessionStart";
      case "before_prompt":
        return event === "beforeSubmitPrompt";
      case "before_read":
        return (
          (event === "postToolUse" || event === "preToolUse") &&
          (!tool || tool === "Read") &&
          globMatch(item.glob, filePath)
        );
      default:
        return false;
    }
  });
}

export function formatFacts(facts) {
  if (facts.length === 0) return "";
  let body = "Hechos medidos por Fiel (no son órdenes):\n";
  for (const fact of facts) {
    const line = `- ${fact.fact}\n`;
    if (body.length + line.length > MAX_CHARS) break;
    body += line;
  }
  return body.slice(0, MAX_CHARS);
}

function eventFrom(input, argv) {
  return argv[0] ?? input.hook_event_name ?? input.event ?? input.conversation?.hook ?? "sessionStart";
}

function filePathFrom(input) {
  const args = input.tool_input ?? input.arguments ?? input ?? {};
  return args.path ?? args.file_path ?? args.target_file ?? input.filePath ?? null;
}

export function handleHook({ stdin = "", argv = [], cwd = process.cwd(), dryRun = false } = {}) {
  let input = {};
  try {
    input = stdin.trim() ? JSON.parse(stdin) : {};
  } catch {
    input = {};
  }
  const event = eventFrom(input, argv);
  const tool = input.tool_name ?? input.tool ?? null;
  const filePath = filePathFrom(input);
  const store = loadAutomations(cwd);
  const facts = selectFacts(store.automations, { event, tool, filePath });
  const additional_context = formatFacts(facts);
  if (!dryRun) {
    try {
      appendLog(cwd, { event, tool, filePath, injected: facts.map((item) => item.id) });
    } catch {
      /* fail open */
    }
  }
  if (!additional_context) return {};
  return { additional_context };
}
