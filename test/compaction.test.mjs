import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { anchorInSummary, chatDirectivesAtCompact } from "../src/analyzers/compaction.mjs";
import { anchorsOf, extractDirectives } from "../src/analyzers/directives.mjs";

const user = (index, text) => ({ index, kind: "user_text", text, timestamp: null });

test("extractDirectives toma frases con nunca/no toques/don't/instead of y saca anclas", () => {
  const found = extractDirectives(
    "Arreglá el bug. Ojo: no toques `scripts/db-reset.mjs`.\nUsá pnpm en vez de npm.\nGracias!",
  );
  assert.deepEqual(
    found.map((item) => item.text),
    ["Ojo: no toques `scripts/db-reset.mjs`.", "Usá pnpm en vez de npm."],
  );
  assert.deepEqual(found[0].anchors, ["scripts/db-reset.mjs"]);
  assert.deepEqual(found[1].anchors, []);
});

test("extractDirectives ignora las plantillas que Cursor mete en el mensaje", () => {
  assert.deepEqual(extractDirectives("Implement the plan. Do NOT edit the plan file itself."), []);
  assert.deepEqual(anchorsOf("corré `npm run check` con --watch"), ["npm run check", "--watch"]);
});

test("Claude Code: la instrucción anclada que no está en el último resumen cuenta como perdida", () => {
  const session = {
    session: "s1",
    harness: "claude",
    events: [
      user(0, "Ojo: no toques `scripts/db-reset.mjs`. Nunca uses `--force`."),
      { index: 3, kind: "compact_summary", text: "Summary: never use --force when pushing." },
      user(4, "no toques `src/late.mjs`"),
    ],
  };
  const result = chatDirectivesAtCompact(session);
  assert.equal(result.compactions, 1);
  assert.deepEqual(result.lost.map((item) => item.anchors), [["scripts/db-reset.mjs"]]);
  assert.deepEqual(result.kept.map((item) => item.anchors), [["--force"]]);
});

test("Cursor: usa el resumen del último segment_*.md y solo los mensajes compactados", () => {
  const dir = mkdtempSync(join(tmpdir(), "fiel-compact-"));
  mkdirSync(join(dir, "compaction"));
  const early = "No toques `src/generated/api.ts` por nada.";
  writeFileSync(
    join(dir, "compaction", "segment_000.md"),
    `## Summary (curated by compaction step)\nAll good.\n## Verbatim turns\nUser: ${early}\n`,
  );
  writeFileSync(
    join(dir, "compaction", "segment_001.md"),
    "## Summary (curated by compaction step)\nThe user wants small functions.\n## Verbatim turns\nsrc/generated/api.ts was read\n",
  );
  const session = {
    session: "c1",
    harness: "cursor",
    file: join(dir, "c1.jsonl"),
    events: [user(0, early), user(9, "Nunca corras `rm -rf data`.")],
  };
  const result = chatDirectivesAtCompact(session);
  assert.equal(result.compactions, 2);
  assert.deepEqual(result.lost.map((item) => item.text), [early]);
});

test("ancla por basename en resumen cuenta como conservada", () => {
  const session = {
    session: "s2",
    harness: "claude",
    events: [
      user(0, "Ojo: no toques `scripts/db-reset.mjs`."),
      { index: 3, kind: "compact_summary", text: "Summary: do not edit db-reset.mjs under scripts." },
    ],
  };
  const result = chatDirectivesAtCompact(session);
  assert.equal(result.lost.length, 0);
  assert.equal(result.kept.length, 1);
});

test("anchorInSummary acepta ruta completa o solo archivo", () => {
  assert.ok(anchorInSummary("scripts/db-reset.mjs", "User asked not to touch db-reset.mjs"));
  assert.ok(anchorInSummary("npm run check", "Run npm run check before merge"));
  assert.equal(anchorInSummary("src/foo", "bar"), false);
});

test("sin compactación devuelve null", () => {
  assert.equal(chatDirectivesAtCompact({ session: "x", harness: "claude", events: [user(0, "no toques `a.js`")] }), null);
});
