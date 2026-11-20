import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeSessions, evaluateRule, pathMatcher } from "../src/analyzers/compliance.mjs";
import { extractInstructions } from "../src/analyzers/extractor.mjs";
import { expandCommand, isEquivalent, signatureOf, splitSegments } from "../src/analyzers/scripts.mjs";

const PROJECT = "/proj";
let counter = 0;
const edit = (path, tool = "StrReplace") => ({ kind: "tool_use", family: "edit", tool, path, index: counter++ });
const shell = (command) => ({ kind: "tool_use", family: "shell", tool: "Shell", command, index: counter++ });
const user = (text) => ({ kind: "user_text", text, index: counter++ });

function ctxFor(events, scripts = {}) {
  const withPosition = events.map((event, position) => ({ event, position }));
  return {
    sessionId: "s1",
    scripts,
    edits: withPosition
      .filter(({ event }) => event.family === "edit")
      .map(({ event, position }) => ({ event, position, rel: event.path.replace(`${PROJECT}/`, "") })),
    shells: withPosition.filter(({ event }) => event.family === "shell"),
  };
}

test("pathMatcher: carpeta, glob y archivo anclado a la raíz", () => {
  assert.ok(pathMatcher("app-lib/clients/*")("app-lib/clients/index.ts"));
  assert.ok(pathMatcher("app-lib/clients/*")("app-lib/clients/sub/a.ts"));
  assert.ok(pathMatcher(".claude/skills/")(".claude/skills/x/SKILL.md"));
  assert.ok(pathMatcher("readme.md")("readme.md"));
  assert.ok(!pathMatcher("readme.md")("app/readme.md"));
  assert.ok(!pathMatcher("readme.md")("README.md"));
});

test("splitSegments separa cadenas y quita variables de entorno", () => {
  assert.deepEqual(splitSegments("cd app && CI=1 npm test | tail -5; bun x"), ["cd app", "npm test", "tail -5", "bun x"]);
});

const PYMESOLVE_SCRIPTS = {
  typecheck: ["npm run typecheck --workspace app", "tsc -b"],
  check: ["npm run typecheck && npm run format:check"],
  "format:check": ["prettier --check ."],
};

test("expandCommand sigue alias de scripts hasta los comandos reales", () => {
  assert.deepEqual(expandCommand("npm run typecheck", PYMESOLVE_SCRIPTS), ["tsc -b"]);
  assert.deepEqual(expandCommand("npm run check", PYMESOLVE_SCRIPTS), ["tsc -b", "prettier --check ."]);
  assert.deepEqual(expandCommand("cargo test", PYMESOLVE_SCRIPTS), ["cargo test"]);
});

test("isEquivalent exige misma firma y descarta comandos que modifican", () => {
  assert.equal(signatureOf("npx tsc --noEmit -p tsconfig.app.json"), "tsc");
  assert.equal(signatureOf("cargo test -p pools"), "cargo test");
  assert.ok(isEquivalent("npx tsc --noEmit", "tsc -b"));
  assert.ok(!isEquivalent("cargo build", "cargo test"));
  assert.ok(!isEquivalent("npx prettier --write app/src/a.ts", "prettier --check ."));
  assert.ok(!isEquivalent("node scripts/other.mjs", "node scripts/verify.mjs"));
});

const CHECK_SCRIPTS = {
  check: ["npm run lint && npm test"],
  lint: ["node scripts/lint.mjs"],
  test: ["node --test test/"],
};

test("required_command y required_sequence: npm run check cuenta como lint y test", () => {
  const [lint] = extractInstructions("- Always run `npm run lint`.", "AGENTS.md");
  const [seq] = extractInstructions("- After editing code, verify each change with `npm test`.", "AGENTS.md");
  const ctx = ctxFor([edit("/proj/a.mjs"), shell("npm run gen && npm run check")], CHECK_SCRIPTS);
  const linted = evaluateRule(lint, ctx);
  assert.equal(linted.complied, 1, "lint via check");
  assert.match(linted.equivalences[0].via, /npm run lint/);
  const verified = evaluateRule(seq, ctx);
  assert.equal(verified.complied, 1, "test via check");
  assert.match(verified.equivalences[0].via, /npm test/);
});

test("required_sequence: un equivalente cuenta como cumplimiento, pero queda registrado aparte", () => {
  const [rule] = extractInstructions("- Verify each step with `npm run typecheck`.", "AGENTS.md");
  const result = evaluateRule(rule, ctxFor([edit("/proj/a.ts"), shell("npx tsc --noEmit 2>&1 | head")], PYMESOLVE_SCRIPTS));
  assert.equal(result.complied, 1);
  assert.equal(result.equivalences[0].via, "npm run typecheck → tsc -b");
  const formatted = evaluateRule(rule, ctxFor([edit("/proj/a.ts"), shell("npx prettier --write a.ts")], PYMESOLVE_SCRIPTS));
  assert.equal(formatted.violations.length, 1);
});

test("forbidden_path: evidencia exacta con herramienta y ruta", () => {
  const [rule] = extractInstructions("- Don't edit `app-lib/clients/*`.", "AGENTS.md");
  const result = evaluateRule(rule, ctxFor([edit("/proj/src/a.ts"), edit("/proj/app-lib/clients/x.ts", "Write")]));
  assert.equal(result.applicable, 2);
  assert.equal(result.complied, 1);
  assert.deepEqual(result.violations.map((v) => [v.sessionId, v.tool, v.argument]), [["s1", "Write", "app-lib/clients/x.ts"]]);
});

test("forbidden_command: viola solo si el segmento empieza con el comando prohibido", () => {
  const [rule] = extractInstructions("- Never run `npm audit fix --force`.", "AGENTS.md");
  const result = evaluateRule(rule, ctxFor([shell("npm audit"), shell("cd app && npm  audit fix --force --legacy-peer-deps")]));
  assert.deepEqual([result.applicable, result.complied], [3, 2]);
  assert.equal(result.violations[0].argument, "npm  audit fix --force --legacy-peer-deps");
});

test("preferred_command cuenta solo comandos que usan una de las dos opciones", () => {
  const [rule] = extractInstructions("- Use `bun` instead of `npm`.", "AGENTS.md");
  const result = evaluateRule(rule, ctxFor([shell("bun install"), shell("npm run dev"), shell("ls -la"), shell("npx tsc")]));
  assert.deepEqual([result.applicable, result.complied, result.violations.length], [2, 1, 1]);
  assert.equal(result.violations[0].argument, "npm run dev");
});

test("required_sequence: el test debe venir después de la última edición de código", () => {
  const [rule] = extractInstructions("- Verify each step with `npm test`.", "AGENTS.md");
  const ok = evaluateRule(rule, ctxFor([edit("/proj/a.ts"), shell("npm test")]));
  assert.equal(ok.complied, 1);
  const bad = evaluateRule(rule, ctxFor([shell("npm test"), edit("/proj/b.ts")]));
  assert.equal(bad.violations[0].argument, "b.ts");
  assert.equal(bad.violations[0].missing, "npm test");
  const docsOnly = evaluateRule(rule, ctxFor([edit("/proj/README.md")]));
  assert.equal(docsOnly.applicable, 0);
});

test("required_command no aplica a sesiones sin ediciones", () => {
  const [rule] = extractInstructions("- Always run `npm run lint`.", "AGENTS.md");
  assert.equal(evaluateRule(rule, ctxFor([shell("ls")])).applicable, 0);
  assert.equal(evaluateRule(rule, ctxFor([edit("/proj/a.ts")])).violations.length, 1);
});

test("analyzeSessions: omite sin fecha o exposición desconocida y no juzga sesiones en curso", () => {
  const content = "- Don't edit `gen/`.\n- Verify each step with `npm test`.\n";
  const rules = extractInstructions(content, "AGENTS.md");
  const now = new Date("2026-11-20T12:00:00Z");
  const old = new Date("2026-11-01T00:00:00Z");
  const sessions = [
    { session: "sin-fecha", start: null, modifiedAt: old, events: [] },
    { session: "desconocida", start: new Date("2026-09-01T00:00:00Z"), modifiedAt: old, events: [] },
    { session: "terminada", start: new Date("2026-11-02T00:00:00Z"), modifiedAt: old, events: [user("hola"), user("sigue"), edit("/proj/gen/a.ts")] },
    { session: "en-curso", start: new Date("2026-11-20T11:50:00Z"), modifiedAt: now, events: [user("hola"), edit("/proj/src/a.ts")] },
  ];
  const exposureFor = (date) =>
    date < new Date("2026-10-01T00:00:00Z")
      ? [{ file: "AGENTS.md", status: "unknown", reason: "x" }]
      : [{ file: "AGENTS.md", status: "git", reason: "commit abc", content }];

  const result = analyzeSessions({ projectDir: PROJECT, ruleFiles: ["AGENTS.md"], currentRules: rules, sessions, now, exposureFor });
  assert.deepEqual(result.sessions.map((s) => s.status), ["skipped", "skipped", "analyzed", "analyzed"]);
  const [forbidden, sequence] = result.rules;
  assert.equal(forbidden.exposedSessions, 2);
  assert.deepEqual(forbidden.violations.map((v) => v.sessionId), ["terminada"]);
  assert.equal(forbidden.tokensCumulative, forbidden.tokenEstimate * 3);
  assert.equal(sequence.pendingSessions, 1);
  assert.equal(sequence.violations.length, 1);
});
