const MAX_LENGTH = 600;

const CORRECTION_PATTERNS = [
  /\bte dije\b/,
  /\bte ped[ií]\b/,
  /\botra vez\b/,
  /\bde nuevo\b/,
  /\bborra (eso|esto|lo)\b/,
  /\brevierte\b/,
  /\bdeshaz\b/,
  /\bno (hagas|quiero|era)\b/,
  /\beso no\b/,
  /\bno es (eso|lo que)\b/,
  /\bno me est[aá]s entendiendo\b/,
  /\bal lado equivocado\b/,
  /\bno (puedes|debes|deber[ií]as) (mezclar|hacer|tocar)\b/,
  /\bi told you\b/,
  /\bthat'?s not what i\b/,
  /\brevert (that|this|it)\b/,
  /\bundo (that|this|it)\b/,
  /\bno, i said\b/,
  /\bdon'?t do\b/,
];

const CONFUSION_PATTERNS = [/\bno entiendo\b/, /\bno comprendo\b/, /\bi don'?t understand\b/];

export function classifyUserText(text) {
  const lower = text.toLowerCase();
  if (lower.length > MAX_LENGTH) return null;
  for (const pattern of CORRECTION_PATTERNS) {
    if (pattern.test(lower)) return { category: "correction", pattern: pattern.source };
  }
  for (const pattern of CONFUSION_PATTERNS) {
    if (pattern.test(lower)) return { category: "confusion", pattern: pattern.source };
  }
  return null;
}

export function findFriction(events) {
  const incidents = [];
  let seenFirstUser = false;
  let lastAssistantActed = false;
  let lastAssistantEvents = [];
  for (const event of events) {
    if (event.kind === "user_text") {
      if (seenFirstUser && lastAssistantActed) {
        const hit = classifyUserText(event.text);
        if (hit) {
          incidents.push({
            session: event.session,
            index: event.index,
            category: hit.category,
            pattern: hit.pattern,
            text: event.text,
            previousTools: lastAssistantEvents
              .filter((e) => e.kind === "tool_use")
              .slice(-3)
              .map((e) => ({ tool: e.tool, path: e.path, command: e.command })),
          });
        }
      }
      seenFirstUser = true;
      lastAssistantActed = false;
      lastAssistantEvents = [];
    } else {
      lastAssistantEvents.push(event);
      if (event.kind === "tool_use") lastAssistantActed = true;
    }
  }
  return incidents;
}
