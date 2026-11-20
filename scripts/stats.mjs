import { findCursorTranscripts, readTranscript } from "../src/readers/cursor.mjs";
import { findFriction } from "../src/analyzers/friction.mjs";

const sampleSize = Number(process.argv[2] ?? 0);
const transcripts = findCursorTranscripts();

let totalEvents = 0;
let userTurns = 0;
let toolUses = 0;
let sessionsWithTools = 0;
const incidents = [];
const perProject = new Map();

for (const { file, project, session } of transcripts) {
  const events = readTranscript(file, session);
  totalEvents += events.length;
  const users = events.filter((e) => e.kind === "user_text").length;
  const tools = events.filter((e) => e.kind === "tool_use").length;
  userTurns += users;
  toolUses += tools;
  if (tools > 0) sessionsWithTools += 1;
  const found = findFriction(events).map((i) => ({ ...i, project }));
  incidents.push(...found);
  const row = perProject.get(project) ?? { sessions: 0, users: 0, corrections: 0 };
  row.sessions += 1;
  row.users += users;
  row.corrections += found.filter((i) => i.category === "correction").length;
  perProject.set(project, row);
}

const corrections = incidents.filter((i) => i.category === "correction");
const confusions = incidents.filter((i) => i.category === "confusion");

console.log(`sesiones: ${transcripts.length} (${sessionsWithTools} con herramientas)`);
console.log(`eventos: ${totalEvents} | turnos del usuario: ${userTurns} | tool_use: ${toolUses}`);
console.log(`correcciones detectadas: ${corrections.length} | confusiones: ${confusions.length}`);
console.log(`tasa: ${((corrections.length / Math.max(userTurns, 1)) * 100).toFixed(1)}% de los turnos del usuario`);
for (const [project, row] of [...perProject].sort((a, b) => b[1].corrections - a[1].corrections)) {
  console.log(`  ${String(row.corrections).padStart(3)} corr / ${String(row.users).padStart(4)} turnos / ${row.sessions} ses  ${project}`);
}

if (sampleSize > 0) {
  const step = Math.max(1, Math.floor(corrections.length / sampleSize));
  console.log("\nMUESTRA (revisar a mano):");
  for (let i = 0, n = 0; i < corrections.length && n < sampleSize; i += step, n += 1) {
    const c = corrections[i];
    const tools = c.previousTools.map((t) => t.tool).join(",");
    console.log(`#${n + 1} [${c.pattern}] (tools previos: ${tools}) :: ${c.text.replace(/\s+/g, " ").slice(0, 140)}`);
  }
}
