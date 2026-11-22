# demo-tienda

Repo trampa que usa `held demo`. Las reglas están en `AGENTS.md`.

- `cursor/`: 5 sesiones reales de Cursor (`composer-2.5-fast`, 20 nov 2026) sobre este repo. `__ROOT__` se reemplaza por la carpeta temporal de la demo. La hoja de verdad está en `truth.json`.
- `claude/`: 1 sesión **escrita a mano** con el formato JSONL de Claude Code (`tool_use`, `tool_result`, `compact_boundary`, `isCompactSummary`). Sirve para mostrar el lector de Claude Code y una instrucción del chat que se pierde al compactar. No es una corrida real.
