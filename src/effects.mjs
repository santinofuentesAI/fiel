const time = (value) => (value ? new Date(value).getTime() : null);

// Before/after per applied pin: did the rule stop being violated once Held
// started injecting the fact? Only pins tied to a rule in AGENTS.md/CLAUDE.md.
export function pinEffects(project, automations) {
  const starts = new Map(project.sessions.map((session) => [session.sessionId, time(session.start)]));
  const analyzed = project.sessions.filter((session) => session.status === "analyzed" && session.start);
  const effects = [];
  for (const pin of automations) {
    if (pin.status !== "applied" || pin.kind !== "pin" || !pin.appliedAt) continue;
    const rule = project.rules.find((item) => item.id === pin.ruleId);
    if (!rule) continue;
    const at = time(pin.appliedAt);
    const sessionsAfter = analyzed.filter((session) => time(session.start) >= at).length;
    const violationsAfter = rule.violations.filter((violation) => (starts.get(violation.sessionId) ?? 0) >= at).length;
    effects.push({
      id: pin.id,
      ruleId: rule.id,
      ref: `${rule.sourceFile}:${rule.lineNumber}`,
      appliedAt: pin.appliedAt,
      sessionsBefore: analyzed.length - sessionsAfter,
      violationsBefore: rule.violations.length - violationsAfter,
      sessionsAfter,
      violationsAfter,
    });
  }
  return effects;
}
