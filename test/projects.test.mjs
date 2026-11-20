import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeProjectKey, resolveProjectKey } from "../src/readers/projects.mjs";
import { parseCursorTimestamp, sessionStart } from "../src/readers/cursor.mjs";

test("encodeProjectKey reproduce las claves de Cursor", () => {
  assert.equal(encodeProjectKey("/home/u/Proyectos/Dojo Hackahton AI"), "home-u-Proyectos-Dojo-Hackahton-AI");
});

test("resolveProjectKey desambigua guiones y espacios contra el disco", () => {
  const base = mkdtempSync(join(tmpdir(), "fiel-projects-"));
  const target = join(base, "mi proyecto", "app-web");
  mkdirSync(target, { recursive: true });
  mkdirSync(join(base, "mi"), { recursive: true });
  assert.equal(resolveProjectKey(encodeProjectKey(target)), target);
  assert.equal(resolveProjectKey(`${encodeProjectKey(base)}-no-existe`), null);
});

test("parseCursorTimestamp convierte la hora local con su zona a UTC", () => {
  const date = parseCursorTimestamp("<timestamp>Thursday, Oct 15, 2026, 5:14 PM (UTC-6)</timestamp>");
  assert.equal(date.toISOString(), "2026-10-15T23:14:00.000Z");
  assert.equal(parseCursorTimestamp("<timestamp>Friday, Nov 20, 2026, 12:05 AM (UTC+0)</timestamp>").toISOString(), "2026-11-20T00:05:00.000Z");
  assert.equal(parseCursorTimestamp("sin fecha"), null);
});

test("sessionStart toma la primera fecha de un mensaje del usuario", () => {
  const first = new Date("2026-11-01T00:00:00Z");
  assert.equal(sessionStart([{ kind: "tool_use" }, { kind: "user_text", timestamp: first }, { kind: "user_text", timestamp: new Date() }]), first);
});
