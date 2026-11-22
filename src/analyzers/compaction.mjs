import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

function segmentFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^segment_\d+\.md$/.test(name))
    .sort();
}

export function needleFor(instruction) {
  const path = instruction.paths?.[0] ?? instruction.scope ?? null;
  if (path && path.length >= 4) return path.toLowerCase();
  const text = instruction.text.replace(/[`*_]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  return text.slice(0, 48);
}

export function compactionDir(transcriptFile) {
  return join(dirname(transcriptFile), "compaction");
}

export function lostAtCompact({ transcriptFile, transcriptText = "", instructions }) {
  const dir = compactionDir(transcriptFile);
  const files = segmentFiles(dir);
  if (files.length === 0) return [];
  const last = readFileSync(join(dir, files.at(-1)), "utf8").toLowerCase();
  const history = `${transcriptText}\n${files.map((name) => readFileSync(join(dir, name), "utf8")).join("\n")}`.toLowerCase();
  const lost = [];
  for (const instruction of instructions) {
    const needle = needleFor(instruction);
    if (!needle || needle.length < 8) continue;
    if (history.includes(needle) && !last.includes(needle)) {
      lost.push({
        id: instruction.id,
        sourceFile: instruction.sourceFile,
        lineNumber: instruction.lineNumber,
        text: instruction.text,
        needle,
      });
    }
  }
  return lost;
}
