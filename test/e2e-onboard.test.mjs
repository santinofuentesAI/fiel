import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { prepareDemo } from "../src/demo.mjs";
import { runOnboard } from "../src/onboard.mjs";
import { loadAutomations } from "../src/store.mjs";

test("onboard escribe instrucciones, aplica pins y deja hooks listos", () => {
  const demo = prepareDemo();
  try {
    const result = runOnboard(demo.projectDir, {
      cursorRoot: demo.cursorRoot,
      claudeRoot: demo.claudeRoot,
      install: false,
    });
    assert.ok(result.writtenFile);
    assert.ok(existsSync(join(demo.projectDir, ".held", "automations.json")));
    const store = loadAutomations(demo.projectDir);
    const applied = store.automations.filter((item) => item.status === "applied");
    assert.ok(applied.length >= result.applied.length);
    assert.ok(result.violations >= 0);
  } finally {
    rmSync(demo.base, { recursive: true, force: true });
  }
});

test("onboard dry-run no escribe automations ni pins", () => {
  const demo = prepareDemo();
  try {
    runOnboard(demo.projectDir, {
      cursorRoot: demo.cursorRoot,
      claudeRoot: demo.claudeRoot,
      dryRun: true,
      install: false,
    });
    assert.equal(existsSync(join(demo.projectDir, ".held", "automations.json")), false);
  } finally {
    rmSync(demo.base, { recursive: true, force: true });
  }
});
test("onboard no aplica sola una propuesta marcada para revisar", () => {
  const demo = prepareDemo();
  try {
    const result = runOnboard(demo.projectDir, { cursorRoot: demo.cursorRoot, claudeRoot: demo.claudeRoot, install: false });
    assert.ok(result.applied.every((item) => !item.review));
    const store = loadAutomations(demo.projectDir);
    for (const item of store.automations.filter((automation) => automation.review)) assert.equal(item.status, "proposed");
  } finally {
    rmSync(demo.base, { recursive: true, force: true });
  }
});
