# Changelog

## 0.3.1 (22 nov 2026)

- Seguridad: tope de stdin en hooks, saneado de `automations.json`, resolución de proyecto multi-root, redacción en `--json` y en evidencia enviada a Jev.
- `fiel report` muestra delta de violaciones vs la última corrida (`.fiel/last-run.json`).
- `fiel sessions`, `fiel analyze --fail-on-violations`, `fiel suggest --save` (ya no escribe propuestas por defecto).
- `fiel doctor` revisa si los hooks están instalados y cierra el loop medir → apply → install.

## 0.3.0 (22 nov 2026)

- **Claude Code**: lector de `~/.claude/projects/*/*.jsonl` (`tool_use` con `file_path`, `tool_result.is_error`, `compact_boundary` e `isCompactSummary`). `analyze` y `analyze --all` combinan sesiones de Cursor y Claude Code por proyecto.
- **Compactación, rehecha**: ya no marca reglas de `AGENTS.md` (se reenvían en cada turno). Ahora revisa las instrucciones que escribiste en el chat contra el resumen de la compactación, tanto en Cursor como en Claude Code.
- **Hooks para los dos harnesses** (`fiel install`, `--cursor` / `--claude`): guardan tus instrucciones del chat, le piden al resumen que las conserve (`PreCompact` de Claude Code) y las reinyectan después de compactar. Los hooks de Cursor ahora usan solo los campos que cada evento acepta.
- **Jev como juez opcional** (`fiel jev gate`, `fiel analyze --judge jev`): 48 casos etiquetados y un umbral elegido en una mitad y medido en la otra. Una tarea se enciende solo con precisión ≥ 0,9 y recall ≥ 0,15. Resultado medido en `docs/jev-gate.json`.
- `fiel demo`: corre todo el flujo sobre `examples/demo-tienda` sin tocar tu historial.
- `fiel doctor` revisa también las sesiones de Claude Code y si Jev responde.
- CLI separada en `src/cli/` (args, comandos, formato) con errores de uso claros.
- Arreglo: `.gitignore` ignoraba cualquier `AGENTS.md`, incluido el del repo de ejemplo, así que un clon limpio de 0.2.0 no pasaba las pruebas.
- CI en GitHub Actions con Node 20 y 22.

## 0.2.0 (22 nov 2026)

- `fiel suggest`, `fiel apply`, `fiel undo` (solo escriben `.fiel/automations.json`).
- Primera detección de compactación de Cursor.
- `fiel install`: hooks de Cursor que inyectan hechos.

## 0.1.0 (21 nov 2026)

- `fiel analyze`, `fiel report` y `fiel doctor`: cumplimiento por regla para cinco tipos verificables, con la versión de las reglas que había en cada sesión (git o mtime).
