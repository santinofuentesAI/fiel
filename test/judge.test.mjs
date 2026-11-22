import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzePath } from "../src/analyze.mjs";
import { prepareDemo } from "../src/demo.mjs";
import { evaluateTask, isPositive, loadCases, metrics, runGate } from "../src/judges/gate.mjs";
import { judgeProject } from "../src/judges/judge.mjs";
import { TASKS } from "../src/judges/jev.mjs";

const oracle = async (task, item) => {
  const positive = isPositive({ task, label: item.label });
  const reported = positive ? 0.97 : 0.03;
  return { probability: task === "preserved" ? 1 - reported : reported, model: "fake" };
};

test("los casos de la compuerta vienen en pares balanceados por tarea", () => {
  const cases = loadCases();
  assert.equal(cases.length, 48);
  for (const task of Object.keys(TASKS)) {
    const items = cases.filter((item) => item.task === task);
    for (let index = 0; index < items.length; index += 2) {
      assert.equal(items[index].instruction, items[index + 1].instruction);
      assert.notEqual(items[index].label, items[index + 1].label);
    }
  }
});

test("la pregunta a Jev lleva la regla y el estado solo la evidencia", () => {
  const item = { instruction: "No instales dependencias", actions: ["Shell: npm install lodash"], summary: "x" };
  assert.match(TASKS.violation.question(item), /"No instales dependencias"/);
  assert.deepEqual(Object.keys(TASKS.violation.state(item)), ["agent_actions"]);
  assert.deepEqual(Object.keys(TASKS.preserved.state(item)), ["summary"]);
});

test("runGate: un juez perfecto pasa y uno que siempre duda queda apagado", async () => {
  const perfect = await runGate(oracle);
  assert.equal(perfect.model, "fake");
  assert.equal(perfect.tasks.violation.passed, true);
  assert.equal(perfect.tasks.preserved.passed, true);
  assert.equal(perfect.tasks.violation.test.precision, 1);

  const unsure = await runGate(async () => ({ probability: 0.5, model: "fake" }));
  assert.equal(unsure.tasks.violation.passed, false);
  assert.equal(unsure.tasks.violation.threshold, null);
});

test("metrics cuenta tp/fp/fn/tn y evaluateTask usa mitades distintas", () => {
  const scored = [
    { task: "violation", label: true, score: 0.95 },
    { task: "violation", label: false, score: 0.2 },
    { task: "violation", label: true, score: 0.4 },
    { task: "violation", label: false, score: 0.92 },
  ];
  assert.deepEqual(
    { ...metrics(scored, 0.9) },
    { tp: 1, fp: 1, fn: 1, tn: 1, precision: 0.5, recall: 0.5, accuracy: 0.5 },
  );
  const result = evaluateTask(scored);
  assert.equal(result.threshold, 0.5, "con empate en recall gana el umbral más bajo de calibración");
  assert.equal(result.calibration.tp, 1);
  assert.equal(result.calibration.fp, 0);
  assert.equal(result.test.fp, 1);
  assert.equal(result.passed, false);
});

test("judgeProject solo juzga reglas no verificables expuestas y respeta la compuerta", async () => {
  const demo = prepareDemo();
  const [project] = analyzePath(demo.projectDir, {
    cursorRoot: demo.cursorRoot,
    claudeRoot: demo.claudeRoot,
    now: new Date("2026-11-22T00:00:00Z"),
  }).projects;
  const calls = [];
  const ask = async (task, item) => {
    calls.push(task);
    return { probability: 0.99, model: "fake" };
  };
  const gate = { model: "fake", tasks: { violation: { passed: true, threshold: 0.9 }, preserved: { passed: false } } };
  const findings = await judgeProject(project, { ask, gate });

  assert.deepEqual(findings.skipped, ["preserved"]);
  assert.ok(calls.every((task) => task === "violation"));
  const verifiable = new Set(project.rules.filter((rule) => rule.verifiable).map((rule) => rule.id));
  assert.ok(findings.violations.every((item) => !verifiable.has(item.ruleId)));

  const quiet = await judgeProject(project, { ask: async () => ({ probability: 0.1 }), gate });
  assert.equal(quiet.violations.length, 0);
});
