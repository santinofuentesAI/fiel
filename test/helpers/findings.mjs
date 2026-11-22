export function projectWithFindings() {
  return {
    rules: [
      {
        id: "rule-gen",
        type: "forbidden_path",
        sourceFile: "AGENTS.md",
        lineNumber: 7,
        paths: ["src/generated/*"],
        violations: [{ sessionId: "abc12345", tool: "Write", argument: "src/generated/api.ts" }],
        exposedSessions: 1,
        applicable: 1,
        tokensCumulative: 40,
      },
    ],
    compaction: {
      lost: [
        {
          id: "chat-1",
          sessionId: "abc12345",
          harness: "claude",
          text: "Ojo: no toques `scripts/db-reset.mjs`.",
          anchors: ["scripts/db-reset.mjs"],
        },
      ],
    },
  };
}
