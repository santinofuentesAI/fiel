import { homedir } from "node:os";
import { defaultCursorRoot, findCursorTranscripts } from "./readers/cursor.mjs";
import { defaultClaudeRoot, findClaudeTranscripts } from "./readers/claude.mjs";
import { findRuleFiles, isGitRepo } from "./analyzers/exposure.mjs";
import { harnessHookStatus } from "./install-status.mjs";
import { isEphemeralInstall } from "./install.mjs";
import { jevHealth, jevUrl, loadGate } from "./judges/jev.mjs";
import { loadAutomations } from "./store.mjs";
import { dim } from "./cli/format.mjs";

function nodeMajor(version = process.versions.node) {
  return Number(version.split(".")[0]);
}

export async function doctor({
  cwd = process.cwd(),
  nodeVersion = process.versions.node,
  cursorRoot = defaultCursorRoot(),
  claudeRoot = defaultClaudeRoot(),
  health = jevHealth,
} = {}) {
  const checks = [];
  const major = nodeMajor(nodeVersion);
  checks.push({
    name: "node",
    required: true,
    ok: major >= 20,
    detail: major >= 20 ? `v${nodeVersion}` : `v${nodeVersion}; se necesita Node 20 o superior`,
  });

  const cursor = findCursorTranscripts(cursorRoot).length;
  const claude = findClaudeTranscripts(claudeRoot).length;
  checks.push({
    name: "sesiones",
    required: true,
    ok: cursor + claude > 0,
    detail:
      cursor + claude > 0
        ? `${cursor} de Cursor (${cursorRoot}), ${claude} de Claude Code (${claudeRoot})`
        : `no hay transcripts en ${cursorRoot} ni en ${claudeRoot}`,
  });

  const ruleFiles = findRuleFiles(cwd);
  checks.push({
    name: "reglas",
    required: false,
    ok: ruleFiles.length > 0,
    detail:
      ruleFiles.length > 0
        ? `${ruleFiles.join(", ")} en ${cwd}`
        : `no hay AGENTS.md, CLAUDE.md ni .cursor/rules/ en ${cwd}`,
  });

  checks.push({
    name: "git",
    required: false,
    ok: isGitRepo(cwd),
    detail: isGitRepo(cwd)
      ? "repo git: Held puede reconstruir la versión de las reglas por fecha"
      : "sin git: solo se juzgan sesiones posteriores al mtime del archivo de reglas",
  });

  const hooks = harnessHookStatus(cwd);
  const appliedPins = loadAutomations(cwd).automations.filter((item) => item.status === "applied" && item.kind === "pin").length;
  const hookDetail = hooks.any
    ? `Cursor ${hooks.cursor.installed ? hooks.cursor.events.join(", ") : "—"}; Claude ${hooks.claude.installed ? hooks.claude.events.join(", ") : "—"}`
    : appliedPins > 0
      ? `${appliedPins} hechos aplicados en .held/ pero sin hooks: corre \`held install\` para que lleguen al chat`
      : "sin hooks (después de \`held apply\`, corre \`held install\`)";
  checks.push({
    name: "hooks",
    required: false,
    ok: (hooks.any || appliedPins === 0) && hooks.broken.length === 0,
    detail:
      hooks.broken.length > 0
        ? `ROTOS: apuntan a ${hooks.broken.join(", ")}, que ya no existe. Corre \`held install\` otra vez desde una instalación estable.`
        : hookDetail,
  });
  if (isEphemeralInstall()) {
    checks.push({
      name: "instalación",
      required: false,
      ok: false,
      detail: "Held corre desde la caché de npx: si instalas hooks así, se rompen cuando npm limpie la caché. Usa `npm i -g --allow-git=all github:santinofuentesAI/held`.",
    });
  }

  const jev = await health();
  const gate = loadGate();
  const passed = gate ? Object.entries(gate.tasks).filter(([, task]) => task.passed).map(([name]) => name) : [];
  checks.push({
    name: "jev",
    required: false,
    ok: jev.ok && passed.length > 0,
    detail: !jev.ok
      ? `opcional, no responde en ${jevUrl()} (el análisis determinístico no lo necesita)`
      : gate
        ? `responde; compuerta: ${passed.length > 0 ? `encendido para ${passed.join(", ")}` : "apagado en todas las tareas"}`
        : "responde, pero falta medirlo: corre `held jev gate`",
  });

  return {
    ok: checks.filter((check) => check.required).every((check) => check.ok),
    home: homedir(),
    cursorRoot,
    claudeRoot,
    cwd,
    checks,
  };
}

export function formatDoctor(report) {
  const lines = ["held doctor", ""];
  for (const check of report.checks) {
    lines.push(`${check.ok ? "ok" : check.required ? "!!" : ".."}  ${check.name}: ${check.detail}`);
  }
  lines.push("");
  const hooksCheck = report.checks.find((check) => check.name === "hooks");
  lines.push(report.ok ? "Listo para `held analyze`, `held report` o `held onboard`." : "Falta algo marcado con !!. El resto son avisos.");
  if (hooksCheck && !hooksCheck.ok) {
    lines.push("Siguiente paso: `held onboard` (mide + pins + hooks) o `held install` si ya aplicaste pins.");
  } else if (report.ok) {
    lines.push(dim("Tras sesiones largas o compactación: `held report` y, si hay pérdidas, `held onboard`."));
  }
  return lines.join("\n");
}
