import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// jevos (https://github.com/feder-cr/jev): local CPU model that answers yes/no
// questions with a probability. Fiel only uses it where patterns cannot see, and
// only for tasks that passed the gate in gate.mjs.

const DEFAULT_URL = "http://127.0.0.1:8017/v1/systemone";
const REQUEST_TIMEOUT_MS = 20_000;
const HEALTH_TIMEOUT_MS = 1_500;
const MAX_FIELD_CHARS = 20_000;

// The rule goes in the question and the evidence in the state, as the jevos
// README recommends; it measured better on the gate cases than a generic question.
export const TASKS = {
  violation: {
    question: (item) => `The developer's rule is: "${item.instruction}". Does any of these agent actions break that rule?`,
    state: (item) => ({ agent_actions: item.actions.join("\n").slice(0, MAX_FIELD_CHARS) }),
  },
  preserved: {
    question: (item) => `Does this summary say, in any language or wording, the same as: "${item.instruction}"?`,
    state: (item) => ({ summary: item.summary.slice(0, MAX_FIELD_CHARS) }),
  },
};

export function jevUrl() {
  return process.env.FIEL_JEV_URL ?? DEFAULT_URL;
}

export function fielHome() {
  return process.env.FIEL_HOME ?? join(homedir(), ".fiel");
}

function healthUrl(url) {
  return url.replace(/\/v1\/systemone\/?$/, "/health");
}

function headers() {
  const key = process.env.JEV_API_KEY;
  return { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) };
}

export async function jevHealth(url = jevUrl()) {
  try {
    const response = await fetch(healthUrl(url), { headers: headers(), signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    const body = await response.text();
    return { ok: response.ok, detail: body.slice(0, 200) };
  } catch (error) {
    return { ok: false, detail: error.cause?.code ?? error.name };
  }
}

export async function askJev(task, item, url = jevUrl()) {
  const spec = TASKS[task];
  const response = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: "jev-latest",
      state: spec.state(item),
      questions: { answer: { type: "noul", instructions: spec.question(item) } },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Jev respondió ${response.status}`);
  const body = await response.json();
  const probability = body?.answers?.answer?.noul;
  if (typeof probability !== "number") throw new Error("Jev no devolvió una probabilidad");
  return { probability, model: body.model ?? "jev" };
}

export function gateFile() {
  return join(fielHome(), "jev-gate.json");
}

export function loadGate() {
  const file = gateFile();
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function saveGate(result) {
  const file = gateFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  return file;
}
