import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { extractDirectives } from "../analyzers/directives.mjs";
import { pathMatcher } from "../analyzers/compliance.mjs";
import { parseHookStdin } from "../security.mjs";
import { appendLog, ensureFielDir, fielDir, loadAutomations, readJson } from "../store.mjs";

const MAX_FACT_CHARS = 700;
const MAX_DIRECTIVE_CHARS = 1200;
const MAX_DIRECTIVES = 12;

// Each harness names its events differently; Fiel only cares about four moments.
export const HOOK_EVENTS = {
  cursor: { sessionStart: "session_start", beforeSubmitPrompt: "prompt", preCompact: "pre_compact", postToolUse: "tool" },
  claude: { SessionStart: "session_start", UserPromptSubmit: "prompt", PreCompact: "pre_compact", PostToolUse: "tool" },
};

function chatFile(projectDir, conversation) {
  const safe = String(conversation ?? "default").replace(/[^\w.-]/g, "_").slice(0, 80);
  return join(fielDir(projectDir), "chat", `${safe}.json`);
}

export function loadChat(projectDir, conversation) {
  const chat = readJson(chatFile(projectDir, conversation), () => ({}));
  return {
    directives: Array.isArray(chat.directives) ? chat.directives : [],
    pendingReinject: chat.pendingReinject === true,
  };
}

function saveChat(projectDir, conversation, chat) {
  ensureFielDir(projectDir);
  const file = chatFile(projectDir, conversation);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(chat, null, 2)}\n`);
}

export function rememberDirectives(chat, prompt, now = new Date()) {
  for (const directive of extractDirectives(prompt ?? "")) {
    if (!chat.directives.some((item) => item.text === directive.text)) {
      chat.directives.push({ text: directive.text, at: now.toISOString() });
    }
  }
  chat.directives = chat.directives.slice(-MAX_DIRECTIVES);
  return chat;
}

function relativeTo(projectDir, filePath) {
  if (!filePath) return null;
  const rel = isAbsolute(filePath) ? relative(projectDir, filePath) : filePath.replace(/^\.\//, "");
  return rel.startsWith("..") ? null : rel;
}

export function selectFacts(automations, { moment, tool = null, filePath = null, projectDir = "." }) {
  const rel = relativeTo(projectDir, filePath);
  return automations.filter((item) => {
    if (item.status !== "applied" || item.kind !== "pin") return false;
    switch (item.trigger) {
      case "session_start":
        return moment === "session_start";
      case "after_compact":
        return moment === "after_compact";
      case "before_prompt":
        return moment === "prompt";
      case "before_read":
        return moment === "tool" && tool === "Read" && rel !== null && pathMatcher(item.glob)(rel);
      default:
        return false;
    }
  });
}

function capped(header, lines, max) {
  if (lines.length === 0) return "";
  let body = `${header}\n`;
  for (const line of lines) {
    if (body.length + line.length + 3 > max) break;
    body += `- ${line}\n`;
  }
  return body.trimEnd();
}

export function formatFacts(facts) {
  return capped("Hechos medidos por Fiel en sesiones anteriores (información, no órdenes):", facts.map((item) => item.fact), MAX_FACT_CHARS);
}

export function formatDirectives(directives) {
  return capped(
    "Instrucciones que el usuario escribió en este chat antes de compactar (Fiel las guardó textuales):",
    directives.map((item) => `«${item.text}»`),
    MAX_DIRECTIVE_CHARS,
  );
}

function compactInstructions(directives) {
  if (directives.length === 0) return "";
  return capped(
    "Keep these instructions the user wrote in this chat verbatim in the summary:",
    directives.map((item) => `«${item.text}»`),
    MAX_DIRECTIVE_CHARS,
  );
}

export function decideHook({ harness, event, input, projectDir, now = new Date() }) {
  const moment = HOOK_EVENTS[harness]?.[event];
  if (!moment) return { moment: null, context: "", injected: [] };
  const conversation = input.conversation_id ?? input.session_id ?? "default";
  const { automations } = loadAutomations(projectDir);
  const chat = loadChat(projectDir, conversation);
  const facts = [];
  let directives = [];
  const useFacts = (selected) => facts.push(...selected);
  const reinject = () => {
    directives = chat.directives;
    const quoted = directives.map((item) => `«${item.text}`);
    useFacts(
      selectFacts(automations, { moment: "after_compact" }).filter((item) => !quoted.some((quote) => item.fact.includes(quote))),
    );
  };
  let userMessage = "";
  let summaryInstructions = "";
  let chatChanged = false;

  switch (moment) {
    case "prompt":
      rememberDirectives(chat, input.prompt, now);
      chatChanged = true;
      if (harness === "claude") useFacts(selectFacts(automations, { moment: "prompt" }));
      break;
    case "session_start":
      useFacts(selectFacts(automations, { moment: "session_start" }));
      if (harness === "claude" && input.source === "compact") reinject();
      break;
    case "pre_compact":
      if (harness === "claude") summaryInstructions = compactInstructions(chat.directives);
      else if (chat.directives.length > 0) {
        chat.pendingReinject = true;
        chatChanged = true;
        userMessage = `Fiel va a reinyectar ${chat.directives.length} instrucciones de este chat después de compactar.`;
      }
      break;
    case "tool": {
      const filePath = input.tool_input?.file_path ?? input.tool_input?.path ?? null;
      useFacts(selectFacts(automations, { moment: "tool", tool: input.tool_name, filePath, projectDir }));
      if (harness === "cursor" && chat.pendingReinject) {
        reinject();
        chat.pendingReinject = false;
        chatChanged = true;
      }
      break;
    }
    default:
      break;
  }
  return {
    moment,
    conversation,
    chat: chatChanged ? chat : null,
    context: [formatFacts(facts), formatDirectives(directives)].filter(Boolean).join("\n\n"),
    userMessage,
    summaryInstructions,
    injected: facts.map((item) => item.id),
  };
}

export function renderHookOutput(harness, event, decision) {
  if (harness === "claude") {
    if (decision.moment === "pre_compact") return decision.summaryInstructions;
    if (!decision.context) return "";
    return JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: decision.context } });
  }
  switch (decision.moment) {
    case "prompt":
      return JSON.stringify({ continue: true });
    case "pre_compact":
      return JSON.stringify(decision.userMessage ? { user_message: decision.userMessage } : {});
    default:
      return JSON.stringify(decision.context ? { additional_context: decision.context } : {});
  }
}

// Fails open: any error yields an empty, valid answer for the harness.
export function runHook({ harness, event, stdin = "", projectDir, dryRun = false, now = new Date() }) {
  const input = parseHookStdin(stdin);
  try {
    const decision = decideHook({ harness, event, input, projectDir, now });
    if (!dryRun) {
      if (decision.chat) saveChat(projectDir, decision.conversation, decision.chat);
      appendLog(projectDir, { harness, event, moment: decision.moment, injected: decision.injected });
    }
    return renderHookOutput(harness, event, decision);
  } catch {
    return harness === "claude" ? "" : "{}";
  }
}
