import { readFileSync } from "node:fs";
import { TASKS } from "./jev.mjs";

// The judge is off unless it earns its place: thresholds are picked on half of
// the labeled cases and the verdict is measured on the other half.
export const MIN_PRECISION = 0.9;
export const MIN_RECALL = 0.15;
const THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95];

export function loadCases() {
  return JSON.parse(readFileSync(new URL("./gate-cases.json", import.meta.url), "utf8")).cases;
}

// Positive = what Fiel would report: a violation, or an instruction lost.
export function positiveScore(task, probability) {
  return task === "preserved" ? 1 - probability : probability;
}

export function isPositive(item) {
  return item.task === "preserved" ? item.label === false : item.label === true;
}

export function metrics(scored, threshold) {
  const counts = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const item of scored) {
    const predicted = item.score >= threshold;
    const actual = isPositive(item);
    if (predicted && actual) counts.tp += 1;
    else if (predicted) counts.fp += 1;
    else if (actual) counts.fn += 1;
    else counts.tn += 1;
  }
  const flagged = counts.tp + counts.fp;
  const positives = counts.tp + counts.fn;
  return {
    ...counts,
    precision: flagged === 0 ? null : counts.tp / flagged,
    recall: positives === 0 ? null : counts.tp / positives,
    accuracy: scored.length === 0 ? null : (counts.tp + counts.tn) / scored.length,
  };
}

export function pickThreshold(calibration) {
  let best = null;
  for (const threshold of THRESHOLDS) {
    const result = metrics(calibration, threshold);
    if (result.precision === null || result.precision < MIN_PRECISION) continue;
    if (!best || result.recall > best.metrics.recall) best = { threshold, metrics: result };
  }
  return best;
}

// Cases come in pairs (same instruction, one positive and one negative); whole
// pairs go to one half so each half has both labels.
const half = (index) => Math.floor(index / 2) % 2;

export function evaluateTask(scored) {
  const calibration = scored.filter((_, index) => half(index) === 0);
  const test = scored.filter((_, index) => half(index) === 1);
  const picked = pickThreshold(calibration);
  if (!picked) {
    return { passed: false, threshold: null, reason: `ningún umbral llega a precisión ${MIN_PRECISION} en calibración`, calibration: metrics(calibration, 0.5), test: metrics(test, 0.5) };
  }
  const result = metrics(test, picked.threshold);
  const passed = (result.precision ?? 0) >= MIN_PRECISION && (result.recall ?? 0) >= MIN_RECALL;
  return {
    passed,
    threshold: picked.threshold,
    reason: passed ? "pasa en la mitad de prueba" : `en prueba: precisión ${fmt(result.precision)}, recall ${fmt(result.recall)}`,
    calibration: picked.metrics,
    test: result,
  };
}

const fmt = (value) => (value === null ? "—" : value.toFixed(2));

export async function runGate(ask, { cases = loadCases(), onProgress = () => {} } = {}) {
  const byTask = {};
  let model = null;
  let done = 0;
  for (const item of cases) {
    const answer = await ask(item.task, item);
    model = answer.model;
    (byTask[item.task] ??= []).push({ ...item, probability: answer.probability, score: positiveScore(item.task, answer.probability) });
    done += 1;
    onProgress(done, cases.length);
  }
  const tasks = {};
  for (const task of Object.keys(TASKS)) tasks[task] = evaluateTask(byTask[task] ?? []);
  return {
    version: 1,
    model,
    measuredAt: new Date().toISOString(),
    minPrecision: MIN_PRECISION,
    minRecall: MIN_RECALL,
    cases: cases.length,
    tasks,
    scored: Object.values(byTask).flat().map(({ task, instruction, label, probability }) => ({ task, instruction, label, probability })),
  };
}
