import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s/;
const FENCE = /^\s*(```|~~~)/;
const TABLE_ROW = /^\s*\|/;
const RULE_LINE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const CODE_SPAN = /`([^`]+)`/g;

const EDIT_VERBS =
  "edit|edits|modify|change|touch|write|overwrite|delete|remove|editar|edites|edite|modificar|modifiques|modifique|cambiar|cambies|tocar|toques|toque|borrar|borres|escribas|sobrescribas";
const FORBID_BEFORE_VERB = new RegExp(
  `\\b(?:don['’]?t|do not|never|nunca|no)\\s+(?:\\S+\\s+){0,2}?(?:${EDIT_VERBS})\\b`,
  "i",
);
const FORBID_LOCATION = new RegExp(
  `\\b(?:${EDIT_VERBS}|edita|modifica)\\b(?:(?!\\.\\s).)*?\\b(?:never|not|nunca|no)\\s+(?:in|inside|under|en|dentro de)\\b`,
  "i",
);
const FORBID_RUN =
  /\b(?:don['’]?t|do not|never|nunca|no)\s+(?:\S+\s+)?(?:run|execute|call|invoke|corras|ejecutes|lances|correr|ejecutar)\b/i;
const PREFERRED = new RegExp(
  "\\b(?:use|usa|usar|utiliza|prefer|prefiere)\\s+`([^`]+)`\\s*,?\\s*(?:instead of|rather than|not|over|en lugar de|en vez de|y no|no)\\s+`([^`]+)`",
  "i",
);
const ALWAYS_RUN = /\b(?:always|siempre)\s+(?:run|execute|corre|ejecuta|correr|ejecutar)\s+`([^`]+)`/i;
const VERIFY_WORDS = /\b(?:verify|verifies|test|tests|testing|check|checks|verifica|verificar|prueba|pruebas|testea)\b/i;
const SEQUENCE_TRIGGER =
  /\b(?:after|before|each|every|después|antes|tras|cada)\b|\bsmall steps\b|\bpasos pequeños\b/i;
const CHECK_COMMAND = /\b(?:test|tests|check|lint|typecheck|tsc|pytest|vitest|jest|clippy|vet)\b/i;
const AFTER_EDITING_SCOPE =
  /\b(?:after|tras|después de)\s+(?:editing|changing|modifying|editar|modificar|cambiar|tocar)\s+`([^`]+)`/i;

function plain(text) {
  return text.replace(/\*\*|__/g, "");
}

function codeSpans(text) {
  return [...text.matchAll(CODE_SPAN)].map((match) => ({ value: match[1].trim(), index: match.index }));
}

export function isPathLike(value) {
  if (/\s/.test(value) || value.includes("://")) return false;
  return value.includes("/") || value.includes("*") || /^\.[\w-]/.test(value) || /\.[a-z0-9]{1,6}$/i.test(value);
}

function isCommandLike(value) {
  return !value.includes("/") || /\s/.test(value);
}

export function tokenEstimate(text) {
  return Math.ceil(text.length / 4);
}

function forbiddenPaths(text) {
  const match = FORBID_BEFORE_VERB.exec(text) ?? FORBID_LOCATION.exec(text);
  if (!match) return [];
  const negationEnd = match.index + match[0].length;
  return codeSpans(text)
    .filter((span) => span.index >= negationEnd && isPathLike(span.value))
    .map((span) => span.value);
}

function forbiddenCommands(text) {
  const match = FORBID_RUN.exec(text);
  if (!match) return [];
  const negationEnd = match.index + match[0].length;
  return codeSpans(text)
    .filter((span) => span.index >= negationEnd && /\s/.test(span.value) && !span.value.includes("://"))
    .map((span) => span.value.replace(/\s+/g, " "));
}

export function classifyInstruction(rawText) {
  const text = plain(rawText);

  const paths = forbiddenPaths(text);
  if (paths.length > 0) return { type: "forbidden_path", verifiable: true, paths };

  const forbiddenCmds = forbiddenCommands(text);
  if (forbiddenCmds.length > 0) return { type: "forbidden_command", verifiable: true, commands: forbiddenCmds };

  const preferred = PREFERRED.exec(text);
  if (preferred && isCommandLike(preferred[1]) && isCommandLike(preferred[2])) {
    return { type: "preferred_command", verifiable: true, preferred: preferred[1], avoided: preferred[2] };
  }

  if (VERIFY_WORDS.test(text) && SEQUENCE_TRIGGER.test(text)) {
    const commands = codeSpans(text)
      .map((span) => span.value)
      .filter((value) => /\s/.test(value) && CHECK_COMMAND.test(value));
    if (commands.length > 0) {
      const scope = AFTER_EDITING_SCOPE.exec(text)?.[1] ?? null;
      return { type: "required_sequence", verifiable: true, commands, scope };
    }
  }

  const always = ALWAYS_RUN.exec(text);
  if (always && !SEQUENCE_TRIGGER.test(text)) {
    return { type: "required_command", verifiable: true, command: always[1] };
  }

  return { type: "exposure_only", verifiable: false };
}

export function instructionId(sourceFile, text) {
  const normalized = plain(text).toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha1").update(`${sourceFile}\n${normalized}`).digest("hex").slice(0, 10);
}

function splitBlocks(content) {
  const lines = content.split(/\r?\n/);
  const blocks = [];
  let current = null;
  let inFence = false;
  let start = 0;

  if (lines[0]?.trim() === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) start = end + 1;
  }

  const close = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (FENCE.test(line)) {
      inFence = !inFence;
      close();
      continue;
    }
    if (inFence) continue;
    if (!line.trim() || HEADING.test(line) || TABLE_ROW.test(line) || RULE_LINE.test(line)) {
      close();
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      close();
      current = { lineNumber: i + 1, parts: [bullet[1].trim()] };
    } else if (current) {
      current.parts.push(line.replace(/^\s*>\s?/, "").trim());
    } else {
      current = { lineNumber: i + 1, parts: [line.replace(/^\s*>\s?/, "").trim()] };
    }
  }
  close();
  return blocks.map((block) => ({ lineNumber: block.lineNumber, text: block.parts.join(" ").trim() }));
}

export function extractInstructions(content, sourceFile) {
  return splitBlocks(content)
    .filter((block) => /[A-Za-zÁÉÍÓÚáéíóúñÑ]{3}/.test(block.text))
    .map((block) => ({
      id: instructionId(sourceFile, block.text),
      sourceFile,
      lineNumber: block.lineNumber,
      text: block.text,
      tokenEstimate: tokenEstimate(block.text),
      ...classifyInstruction(block.text),
    }));
}

export function writeInstructions(projectDir, instructions, generatedAt = new Date()) {
  const dir = join(projectDir, ".fiel");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "instructions.json");
  const payload = { version: 1, generatedAt: generatedAt.toISOString(), instructions };
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return file;
}
