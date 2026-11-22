import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lostAtCompact, needleFor } from "../src/analyzers/compaction.mjs";

test("marca una instrucción presente en un segmento anterior y ausente del último", () => {
  const dir = mkdtempSync(join(tmpdir(), "fiel-compact-"));
  const compaction = join(dir, "compaction");
  mkdirSync(compaction);
  writeFileSync(
    join(compaction, "segment_000.md"),
    "## Summary\n\nDon't edit src/generated/*; regenerate with npm run gen.\n",
  );
  writeFileSync(join(compaction, "segment_001.md"), "## Summary\n\nThe agent renamed a function and ran tests.\n");
  const transcript = join(dir, "abc.jsonl");
  writeFileSync(transcript, "");

  const instructions = [
    {
      id: "gen1",
      sourceFile: "AGENTS.md",
      lineNumber: 7,
      text: "Don't edit `src/generated/*`; regenerate with `npm run gen`.",
      paths: ["src/generated/*"],
    },
  ];
  assert.equal(needleFor(instructions[0]), "src/generated/*");
  const lost = lostAtCompact({ transcriptFile: transcript, instructions });
  assert.equal(lost.length, 1);
  assert.equal(lost[0].id, "gen1");
});

test("no marca si la instrucción sigue en el último segmento", () => {
  const dir = mkdtempSync(join(tmpdir(), "fiel-compact-keep-"));
  const compaction = join(dir, "compaction");
  mkdirSync(compaction);
  writeFileSync(join(compaction, "segment_000.md"), "Don't edit src/generated/*\n");
  writeFileSync(join(compaction, "segment_001.md"), "Still: src/generated/* must not be edited by hand.\n");
  const transcript = join(dir, "abc.jsonl");
  writeFileSync(transcript, "");
  const lost = lostAtCompact({
    transcriptFile: transcript,
    instructions: [
      {
        id: "gen1",
        sourceFile: "AGENTS.md",
        lineNumber: 7,
        text: "Don't edit src/generated/*",
        paths: ["src/generated/*"],
      },
    ],
  });
  assert.equal(lost.length, 0);
});
