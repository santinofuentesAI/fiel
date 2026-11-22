import { createHash } from "node:crypto";

function suggestionId(ruleId, kind, trigger) {
  return createHash("sha1").update(`${ruleId}:${kind}:${trigger}`).digest("hex").slice(0, 10);
}

function factFor(rule) {
  const origin = `[${rule.sourceFile}:${rule.lineNumber}]`;
  switch (rule.type) {
    case "forbidden_path":
      return `${origin} En sesiones medidas el agente editó ${rule.paths.join(", ")}, que la regla pide no tocar.`;
    case "forbidden_command":
      return `${origin} En sesiones medidas el agente corrió ${rule.commands.join(" / ")}, que la regla prohíbe.`;
    case "preferred_command":
      return `${origin} En sesiones medidas el agente usó "${rule.avoided}" en vez de "${rule.preferred}".`;
    case "required_command":
      return `${origin} En sesiones medidas faltó correr "${rule.command}" después de editar.`;
    case "required_sequence":
      return `${origin} En sesiones medidas faltó verificar con ${rule.commands.join(" | ")} después de editar.`;
    case "exposure_only":
      return `${origin} Esta instrucción ocupa ~${rule.tokensCumulative} tokens y no tuvo eventos aplicables.`;
    default: {
      const unhandled = rule.type;
      throw new Error(`Tipo sin propuesta: ${unhandled}`);
    }
  }
}

function triggerFor(rule) {
  if (rule.type === "forbidden_path" && rule.paths?.[0]) {
    return { trigger: "before_read", glob: rule.paths[0] };
  }
  return { trigger: "session_start", glob: null };
}

function suggestionRecord(rule, { kind, trigger, glob, fact, evidence, now }) {
  return {
    id: suggestionId(rule.id, kind, trigger),
    kind,
    trigger,
    glob,
    fact,
    ruleId: rule.id,
    sourceFile: rule.sourceFile,
    lineNumber: rule.lineNumber,
    evidence,
    tokenEstimate: Math.ceil(fact.length / 4),
    createdAt: now.toISOString(),
  };
}

export function suggestFromAnalysis(project, { now = new Date() } = {}) {
  const suggestions = [];
  const seen = new Set();
  for (const rule of project.rules) {
    if (rule.violations.length > 0) {
      const { trigger, glob } = triggerFor(rule);
      const item = suggestionRecord(rule, {
        kind: "pin",
        trigger,
        glob,
        fact: factFor(rule),
        evidence: rule.violations.slice(0, 3),
        now,
      });
      suggestions.push(item);
      seen.add(item.id);
    }
    if (rule.exposedSessions >= 2 && rule.applicable === 0 && rule.tokensCumulative >= 80) {
      suggestions.push(
        suggestionRecord(rule, {
          kind: "prune",
          trigger: "session_start",
          glob: null,
          fact: factFor({ ...rule, type: "exposure_only" }),
          evidence: [],
          now,
        }),
      );
    }
  }
  for (const lost of project.compaction?.lost ?? []) {
    const source = { id: lost.id, sourceFile: `chat:${lost.harness}`, lineNumber: lost.sessionId.slice(0, 8) };
    const item = suggestionRecord(source, {
      kind: "pin",
      trigger: "after_compact",
      glob: null,
      fact: `En una sesión anterior el usuario pidió «${lost.text.slice(0, 160)}» y el resumen de la compactación lo perdió.`,
      evidence: [{ sessionId: lost.sessionId, tool: "compaction", argument: lost.anchors.join(", ") }],
      now,
    });
    if (!seen.has(item.id)) {
      suggestions.push(item);
      seen.add(item.id);
    }
  }
  for (const item of project.compaction?.unanchored ?? []) {
    const source = { id: `compact-unanchored-${item.id}`, sourceFile: `chat:${item.harness}`, lineNumber: item.sessionId.slice(0, 8) };
    const pin = suggestionRecord(source, {
      kind: "pin",
      trigger: "after_compact",
      glob: null,
      fact: `Instrucción del chat sin ancla verificable (Held no pudo medir si el resumen la conservó): «${item.text.slice(0, 160)}».`,
      evidence: [{ sessionId: item.sessionId, tool: "compaction", argument: "(sin ancla)" }],
      now,
    });
    if (!seen.has(pin.id)) {
      suggestions.push({ ...pin, review: true });
      seen.add(pin.id);
    }
  }
  return suggestions;
}

export function mergeSuggestions(store, suggestions) {
  for (const suggestion of suggestions) {
    const existing = store.automations.find((item) => item.id === suggestion.id);
    if (!existing) store.automations.push({ ...suggestion, status: "proposed" });
  }
  return store;
}

export function findAutomation(store, id) {
  if (!id) return null;
  const exact = store.automations.find((item) => item.id === id);
  if (exact) return exact;
  const matches = store.automations.filter((item) => item.id.startsWith(id));
  return matches.length === 1 ? matches[0] : null;
}

export function applySuggestion(store, suggestion, { now = new Date() } = {}) {
  const existing = store.automations.find((item) => item.id === suggestion.id);
  if (existing) {
    existing.status = "applied";
    existing.appliedAt = now.toISOString();
    existing.undoneAt = null;
    return existing;
  }
  const applied = { ...suggestion, status: "applied", appliedAt: now.toISOString(), undoneAt: null };
  store.automations.push(applied);
  return applied;
}

export function undoAutomation(store, id, { now = new Date() } = {}) {
  const item = store.automations.find((automation) => automation.id === id);
  if (!item) return null;
  item.status = "undone";
  item.undoneAt = now.toISOString();
  return item;
}
