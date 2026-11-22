# Changelog

## 0.6.1 (22 nov 2026)

- **Experimento controlado**: mismas 5 tareas y modelo; control del mismo día 13 violaciones (4 de 5 sesiones), con los 3 hechos de Held 2 (1 de 5). Transcripts en `examples/pin-experiment/`, reproducido por `test/experiment.test.mjs`.
- Pitch del README reescrito: auditoría con las reglas de ese día, amnesia de compactación y ciclo medido.
- Hero e icono (caja negra / flight recorder) y paquete npm `held-cli` (el nombre `held` está tomado; el comando sigue siendo `held`).

## 0.6.0 (22 nov 2026)

Antítesis de todo el funcionamiento y lo que se corrigió:

- **Hooks con rutas frágiles**: Claude Code ahora va a `.claude/settings.local.json` (personal, fuera de git); se migran los hooks de Held de `settings.json`. `install`, `onboard` y `doctor` avisan si Held corre desde la caché de `npx`; `doctor` marca hooks que apuntan a archivos inexistentes.
- **Falsos positivos del chat**: se descartan preguntas, hábitos ("como siempre…", "I always…") y pasado ("nunca usábamos…").
- **Revocaciones**: "ya podés tocar `X`" / "ignore that" borra la instrucción guardada y ya no cuenta como perdida; lo reinyectado avisa que vale lo más reciente.
- **Secretos** redactados en instrucciones guardadas y reportadas.
- **¿Sirvió el pin?** `held report` muestra antes/después por pin aplicado (`pinEffects` en JSON).
- **Cobertura**: si menos de la mitad de las reglas son verificables, el reporte muestra cómo reescribirlas.
- `onboard` instala hooks solo para los harnesses con sesiones en el proyecto y dice qué hace cada uno (Cursor no puede influir en su resumen).
- E2E por CLI (onboard → report → hooks con revocación → doctor → uninstall). 99 pruebas.

## 0.5.0 (22 nov 2026)

Probado contra sesiones reales de Cursor (37 sesiones del workspace del hackathon y el repo trampa):

- **Diagnóstico de exposición**: si se omiten sesiones porque no se sabe qué versión de las reglas veían, Held dice por qué y qué cambiar (p. ej. `AGENTS.md` está en `.gitignore`). En texto, JSON (`exposureHints`) y `onboard`.
- **`recommendedActions`** en `--json` (`onboard`, `suggest`, `commit_rules`) para CI y agentes.
- Las instrucciones del chat sin ancla (fragmentos como "Fuentes que no uses como cifra") quedan como propuesta **a revisar**: `onboard` y `demo` ya no las aplican solas, para no meter ruido tras cada compactación.
- La lista de sesiones en `analyze`/`report` muestra las 10 más recientes; el resto en `held sessions`.
- `onboard --dry-run` dice "Pins que aplicaría".
- Workflow de ejemplo `examples/github-action.yml`; URLs apuntan a `santinofuentesAI/held`.

## 0.4.2 (22 nov 2026)

- `held report`: delta de memoria del chat (pérdidas en compactación) junto al delta de violaciones.
- Línea **Acción recomendada** en el reporte (`onboard` / `suggest`).
- `--fail-on-compaction-lost` para CI cuando importa conservar instrucciones del chat.
- Doctor apunta a `held onboard` como siguiente paso.

## 0.4.1 (22 nov 2026)

- `held onboard`: analyze → suggest → aplica pins → `install` en un paso (memoria del chat tras compactar).
- Compactación: anclas por basename en el resumen; PreCompact pide tokens exactos; pins para instrucciones sin ancla.
- `last-run.json` v2 guarda conteo de instrucciones perdidas/conservadas en compactación.
- Más pruebas e2e (onboard, delta report).

## 0.4.0 (22 nov 2026)

- **Rebrand a Held** (`held` CLI, estado en `.held/`). El binario `fiel` sigue como alias con aviso de deprecación; los hooks usan `held.mjs`. Variables `HELD_*` con fallback `FIEL_*`; lectura de `.fiel/` legado si no existe `.held/`.

## 0.3.1 (22 nov 2026)

- Seguridad: tope de stdin en hooks, saneado de `automations.json`, resolución de proyecto multi-root, redacción en `--json` y en evidencia enviada a Jev.
- `held report` muestra delta de violaciones vs la última corrida (`.held/last-run.json`).
- `held sessions`, `held analyze --fail-on-violations`, `held suggest --save` (ya no escribe propuestas por defecto).
- `held doctor` revisa si los hooks están instalados y cierra el loop medir → apply → install.

## 0.3.0 (22 nov 2026)

- **Claude Code**: lector de `~/.claude/projects/*/*.jsonl` (`tool_use` con `file_path`, `tool_result.is_error`, `compact_boundary` e `isCompactSummary`). `analyze` y `analyze --all` combinan sesiones de Cursor y Claude Code por proyecto.
- **Compactación, rehecha**: ya no marca reglas de `AGENTS.md` (se reenvían en cada turno). Ahora revisa las instrucciones que escribiste en el chat contra el resumen de la compactación, tanto en Cursor como en Claude Code.
- **Hooks para los dos harnesses** (`held install`, `--cursor` / `--claude`): guardan tus instrucciones del chat, le piden al resumen que las conserve (`PreCompact` de Claude Code) y las reinyectan después de compactar. Los hooks de Cursor ahora usan solo los campos que cada evento acepta.
- **Jev como juez opcional** (`held jev gate`, `held analyze --judge jev`): 48 casos etiquetados y un umbral elegido en una mitad y medido en la otra. Una tarea se enciende solo con precisión ≥ 0,9 y recall ≥ 0,15. Resultado medido en `docs/jev-gate.json`.
- `held demo`: corre todo el flujo sobre `examples/demo-tienda` sin tocar tu historial.
- `held doctor` revisa también las sesiones de Claude Code y si Jev responde.
- CLI separada en `src/cli/` (args, comandos, formato) con errores de uso claros.
- Arreglo: `.gitignore` ignoraba cualquier `AGENTS.md`, incluido el del repo de ejemplo, así que un clon limpio de 0.2.0 no pasaba las pruebas.
- CI en GitHub Actions con Node 20 y 22.

## 0.2.0 (22 nov 2026)

- `held suggest`, `held apply`, `held undo` (solo escriben `.held/automations.json`).
- Primera detección de compactación de Cursor.
- `held install`: hooks de Cursor que inyectan hechos.

## 0.1.0 (21 nov 2026)

- `held analyze`, `held report` y `held doctor`: cumplimiento por regla para cinco tipos verificables, con la versión de las reglas que había en cada sesión (git o mtime).
