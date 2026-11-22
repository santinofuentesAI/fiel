import { test } from "node:test";
import assert from "node:assert/strict";
import { pinEffects } from "../src/effects.mjs";

const session = (sessionId, start) => ({ sessionId, start, status: "analyzed" });

test("pinEffects compara violaciones de la regla antes y después de aplicar el pin", () => {
  const project = {
    sessions: [session("a", "2026-11-20T10:00:00Z"), session("b", "2026-11-20T11:00:00Z"), session("c", "2026-11-22T10:00:00Z")],
    rules: [{ id: "r1", sourceFile: "AGENTS.md", lineNumber: 15, violations: [{ sessionId: "a" }, { sessionId: "b" }] }],
  };
  const automations = [
    { id: "p1", kind: "pin", status: "applied", ruleId: "r1", appliedAt: "2026-11-21T00:00:00Z" },
    { id: "p2", kind: "pin", status: "proposed", ruleId: "r1" },
    { id: "p3", kind: "pin", status: "applied", ruleId: "chat-lost", appliedAt: "2026-11-21T00:00:00Z" },
  ];
  assert.deepEqual(pinEffects(project, automations), [
    {
      id: "p1",
      ruleId: "r1",
      ref: "AGENTS.md:15",
      appliedAt: "2026-11-21T00:00:00Z",
      sessionsBefore: 2,
      violationsBefore: 2,
      sessionsAfter: 1,
      violationsAfter: 0,
    },
  ]);
});
