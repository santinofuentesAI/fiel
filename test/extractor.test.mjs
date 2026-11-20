import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyInstruction, extractInstructions, instructionId, writeInstructions } from "../src/analyzers/extractor.mjs";

const AGENTS = `---
description: frontmatter que se ignora
---
# Reglas

1. Don't edit generated code: \`app-lib/clients/*\` (Scaffold regenerates it)
   and \`.agents/skills/vendor/\` (vendored).
2. Work in small steps and verify each one (\`cargo test\`, \`npm run typecheck\`).

- Use \`bun\` instead of \`npm\`.
- Always run \`npm run lint\`.
- Responde siempre en español.

\`\`\`bash
- never edit \`dentro/de/codigo\`
\`\`\`

| tabla | ignorada |
`;

test("extrae instrucciones con archivo de origen y línea real", () => {
  const instructions = extractInstructions(AGENTS, "AGENTS.md");
  assert.deepEqual(
    instructions.map((item) => [item.lineNumber, item.type]),
    [
      [6, "forbidden_path"],
      [8, "required_sequence"],
      [10, "preferred_command"],
      [11, "required_command"],
      [12, "exposure_only"],
    ],
  );
  const [first] = instructions;
  assert.equal(first.sourceFile, "AGENTS.md");
  assert.match(first.text, /vendored/);
  assert.deepEqual(first.paths, ["app-lib/clients/*", ".agents/skills/vendor/"]);
  assert.equal(first.tokenEstimate, Math.ceil(first.text.length / 4));
  assert.equal(instructions.at(-1).verifiable, false);
});

test("forbidden_path solo toma rutas después de la negación", () => {
  const rule = classifyInstruction("Edit skills only in `.agents/skills/` (then `npm run agents:sync`), never in `.claude/skills/`.");
  assert.equal(rule.type, "forbidden_path");
  assert.deepEqual(rule.paths, [".claude/skills/"]);
});

test("forbidden_path en español", () => {
  const rule = classifyInstruction("No edites `db/migrations/` a mano.");
  assert.deepEqual(rule.paths, ["db/migrations/"]);
});

test("no confunde 'nunca hagas commit' con rutas prohibidas", () => {
  assert.equal(
    classifyInstruction("`app/.env` is different: you may read and edit it, but never commit it.").type,
    "exposure_only",
  );
  assert.equal(classifyInstruction("Do not commit `AGENTS.md`, `.cursor/`, or `node_modules`.").type, "exposure_only");
});

test("forbidden_command toma solo comandos con argumentos después de 'never run'", () => {
  const rule = classifyInstruction(
    "Ignore `npm audit` warnings and **never** run `npm audit fix --force`: it upgrades pinned SDKs (`@trustless-work/escrow`).",
  );
  assert.equal(rule.type, "forbidden_command");
  assert.deepEqual(rule.commands, ["npm audit fix --force"]);
  assert.deepEqual(classifyInstruction("Nunca corras `git push --force` en main.").commands, ["git push --force"]);
  assert.equal(classifyInstruction("Never use `any` in TypeScript.").type, "exposure_only");
});

test("required_sequence toma el alcance de 'después de editar'", () => {
  const rule = classifyInstruction("Después de editar `src/db/`, verifica con `npm run test:db`.");
  assert.equal(rule.type, "required_sequence");
  assert.equal(rule.scope, "src/db/");
  assert.deepEqual(rule.commands, ["npm run test:db"]);
});

test("verificar sin comando concreto no se adivina: queda solo exposición", () => {
  assert.equal(classifyInstruction("Always verify your changes after each step.").type, "exposure_only");
});

test("el id es estable aunque cambie la línea o el formato", () => {
  assert.equal(instructionId("AGENTS.md", "Use **bun**  always"), instructionId("AGENTS.md", "use bun always"));
  assert.notEqual(instructionId("AGENTS.md", "x regla"), instructionId("CLAUDE.md", "x regla"));
});

test("writeInstructions escribe solo en .fiel/instructions.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "fiel-extractor-"));
  const file = writeInstructions(dir, extractInstructions(AGENTS, "AGENTS.md"), new Date("2026-11-20T00:00:00Z"));
  assert.equal(file, join(dir, ".fiel", "instructions.json"));
  const payload = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(payload.version, 1);
  assert.equal(payload.instructions.length, 5);
});
