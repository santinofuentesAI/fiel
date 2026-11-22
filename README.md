# Held

> **Le escribes reglas a tu agente. Held te dice si las cumplió, con pruebas, y hace que no las olvide.**

Escribes `AGENTS.md`, `CLAUDE.md` y `.cursor/rules/`. En el chat agregas "no toques `scripts/db-reset.mjs`". Y después no sabes nada: ni si el agente lo cumplió, ni si lo olvidó cuando el contexto se llenó y se compactó. Las herramientas de contexto responden con *más* contexto: más reglas, más memoria, más MCP. Ninguna te dice si el contexto que ya tienes se está usando.

Held lo mide. Lee las sesiones de Cursor y Claude Code que ya están en tu disco y las audita como la caja negra de un avión:

1. **Juzga cada sesión con las reglas que existían ese día**, no con las de hoy: reconstruye tu `AGENTS.md` por fecha desde git. Si no puede saber qué versión veía el agente, no juzga esa sesión y te dice por qué.
2. **Encuentra la amnesia de la compactación.** Los archivos de reglas se reenvían en cada turno; lo que dices en el chat no. Cuando el contexto se llena y se resume, Held compara tus instrucciones con el resumen y te dice cuáles se perdieron.
3. **Cierra el ciclo y lo vuelve a medir.** Convierte cada falla en un hecho que los hooks de Cursor y Claude Code reinyectan en el momento justo (al leer esa ruta, después de compactar). En la siguiente corrida te muestra si la regla dejó de romperse: medir, intervenir, medir otra vez.

**Evidencia, no impresiones:** 19 sesiones reales con hoja de verdad revisada a mano, precisión y recall 1,0 en las 28 violaciones. En un proyecto real encontró al agente editando a mano, dos veces, código generado que `AGENTS.md` prohibía tocar. En otro, una instrucción del chat ("ejecuta `npm run agents:sync`") que desapareció del resumen tras 7 compactaciones.

Sin API key, sin servidor, sin dependencias (Node 20+). Tus transcripts no salen de tu máquina y Held nunca edita tus reglas: todo vive en `.held/`.

*In English: You write rules for your coding agent and never find out whether it followed them. Held is a zero-dependency CLI that audits the Cursor and Claude Code sessions already on your disk. It judges each session against the rules as they existed that day (rebuilt from git), catches chat instructions lost when the context is compacted, and closes the loop: hooks re-inject what was forgotten, and the next run shows whether the rule stopped breaking. Precision and recall 1.0 on 19 hand-labeled real sessions. An optional local judge (Jev) only turns on for tasks where it passed a measured precision gate.*

## Pruébalo en 30 segundos

```bash
npx -y --allow-git=all github:santinofuentesAI/held demo
```

`--allow-git=all` hace falta desde npm 12, que bloquea por defecto los paquetes que vienen de git; npm 10 y 11 solo avisan que no conocen la opción. La demo no necesita tu historial. Crea un repo de ejemplo en una carpeta temporal, con 5 sesiones reales de Cursor y 1 sesión de Claude Code escrita a mano. Lo analiza, aplica las propuestas y simula los hooks. Salida real (recortada):

```text
Sesiones: 6 (cursor 5, claude 1), analizadas 6
  [AGENTS.md:15] preferred_command: usar "npm test" en vez de "node --test"
    expuesta 6, aplicables 6, cumple 4, viola 2
  [AGENTS.md:16] required_sequence: tras editar código, correr npm test
    expuesta 6, aplicables 5, cumple 4 (2 por equivalente), viola 1
Violaciones (4):
  [AGENTS.md:15] sesión c63d84da · Shell node --test test/cart.test.mjs
  [AGENTS.md:16] sesión 5b2e9c41 · Edit scripts/db-reset.mjs · faltó: npm test
Compactación: 1 sesión con 1 compactación. Instrucciones que diste en el chat:
  perdidas 1 · sesión 5b2e9c41 claude · «Ojo: no toques `scripts/db-reset.mjs` y al final corré `npm run check`.»

1) Lo que el hook le pide al resumen de Claude Code antes de compactar (PreCompact):
Keep these instructions the user wrote in this chat verbatim in the summary:
- «Ojo: no toques `scripts/db-reset.mjs` y al final corré `npm run check`.»
```

## Instalación

```bash
npm install -g --allow-git=all github:santinofuentesAI/held
held doctor        # revisa Node, sesiones de Cursor y Claude Code, reglas, git y Jev
held onboard       # mide, aplica los pins seguros e instala los hooks en la carpeta actual
held report        # después: qué cambió desde la última corrida
```

Los bins son `held` (principal) y `fiel` (alias con aviso, del nombre anterior). Las URLs viejas `santinofuentesAI/fiel` redirigen a `santinofuentesAI/held`.

O sin instalar: `git clone https://github.com/santinofuentesAI/held && cd held && node bin/held.mjs demo`.

Held busca las sesiones en `~/.cursor/projects/` y `~/.claude/projects/`. Variables útiles:

| Variable | Para qué |
|---|---|
| `HELD_CURSOR_PROJECTS` / `HELD_CLAUDE_PROJECTS` | Dónde están los transcripts |
| `CURSOR_PROJECT_DIR` / `CLAUDE_PROJECT_DIR` | Los hooks del IDE apuntan el proyecto activo |
| `HELD_HOME` | Comp puerta de Jev (`~/.held`) |
| `HELD_JEV_URL` | URL del juez local (default `http://127.0.0.1:8017/v1/systemone`) |

## Comandos

| Comando | Qué hace | Escribe |
|---|---|---|
| `held demo` | Todo el flujo sobre el repo de ejemplo incluido | Carpeta temporal |
| `held doctor` | Revisa el entorno y dice qué falta | Nada |
| `held analyze [ruta]` | Cumplimiento por regla y compactación, con evidencia | `.held/instructions.json` (desactívalo con `--no-write`) |
| `held analyze --all` | Todos los proyectos con sesiones en disco | Igual |
| `held report [ruta]` | `analyze` + automatizaciones aplicadas | Igual |
| `held onboard [ruta]` | **Un paso:** `analyze` + pins aplicados + `install` (ataque directo a pérdidas de memoria del chat) | `.held/*` y hooks |
| `held suggest [ruta]` | Propone hechos para reinyectar a partir de lo medido | `.held/automations.json` |
| `held apply <id>` / `held undo <id>` | Aplica o deshace una propuesta | `.held/automations.json` |
| `held install [ruta]` | Hooks de Cursor (`.cursor/hooks.json`) y Claude Code (`.claude/settings.local.json`, personal y fuera de git) | Esos dos archivos, sin borrar tus hooks |
| `held uninstall [ruta]` | Quita solo los hooks de Held | Esos dos archivos |
| `held jev status` / `held jev gate` | Estado del juez local y su compuerta de calidad | `~/.held/jev-gate.json` |
| `held analyze --judge jev` | Agrega hallazgos probabilísticos, separados de los determinísticos | Igual que `analyze` |
| `held sessions [ruta]` | Sesiones en disco con fecha y conteo de violaciones | Nada |

Opciones: `--json`, `--fail-on-violations` / `--fail-on-compaction-lost` (CI), `--no-write`, `--save` (con `suggest`), `--dry-run` (install/onboard), `--cursor` / `--claude` (install para un solo harness), `--sessions-from <ruta>` (si moviste el proyecto). Código de salida 0 si corrió, 1 con un mensaje claro si no (ruta inexistente, sin sesiones, sin reglas, opción inválida); con las banderas `--fail-on-*`, 1 si hay hallazgos.

### CI en tu repo

```bash
held report --fail-on-violations --fail-on-compaction-lost --no-write
```

`report` compara con `.held/last-run.json` (violaciones + pérdidas en compactación). La primera corrida sin `--no-write` crea la baseline. Con `--json`, cada proyecto trae `recommendedActions` (`onboard`, `suggest`, `commit_rules`) y `exposureHints` (por qué se omitieron sesiones y qué cambiar).

Los transcripts viven en tu máquina, así que el workflow de ejemplo [`examples/github-action.yml`](examples/github-action.yml) corre en un runner self-hosted.

### Seguridad (hooks y `.held/`)

- Los comandos de hook van escapados con `JSON.stringify`; no usan shell.
- Stdin del hook tiene tope de 256 KB; JSON inválido → respuesta vacía (fail-open).
- Solo se inyectan automatizaciones `applied` saneadas (facts acotados, sin globs absolutos).
- `--json` redacta patrones comunes de tokens en argumentos de violaciones.
- `.held/.gitignore` ignora `automations.json`, `instructions.json`, `last-run.json`, `log.jsonl` y `chat/` para que no se commiteen medidas ni contexto inyectado.

**Held nunca modifica `AGENTS.md`, `CLAUDE.md` ni `.cursor/rules/`.** Su estado vive en `.held/`, con un `.gitignore` propio para el log y el estado de chat.

## Qué es (y qué no es)

| Esto | ¿Held? |
|---|---|
| Skill (`SKILL.md` que el agente lee) | No. Held **mide** instrucciones, no las sustituye. |
| Kit de prompts o de reglas | No. No vende un `AGENTS.md`. |
| MCP o plugin | No. No vive dentro del chat. |
| Guardia de seguridad | No. Los hooks **informan**, nunca bloquean ni deniegan herramientas. |
| **CLI** (`npm i -g` y `held analyze`) | **Sí. Ese es el producto.** |

## Cómo funciona

### 1. Qué reglas veía el agente en cada sesión

Juzgar una sesión vieja con las reglas de hoy da resultados falsos. Para cada sesión, Held toma su fecha y reconstruye la versión vigente de cada archivo de reglas:

1. si el archivo está en git, usa el último commit anterior a la sesión (`git log --before` y `git show`);
2. si no está en git, usa el archivo del disco solo si se modificó antes de la sesión;
3. si ninguna de las dos aplica, la exposición es **desconocida** y la sesión no se juzga. Held no asume.

### 2. Qué cuenta como violación (determinístico)

| Tipo | Ejemplo de regla | Viola cuando |
|---|---|---|
| `forbidden_path` | "Don't edit `src/generated/*`" | El agente edita una ruta que coincide |
| `forbidden_command` | "Never run `rm -rf data`" | Corre ese comando (también con la ruta en absoluto) |
| `preferred_command` | "Use `npm test` instead of `node --test`" | Corre la opción evitada |
| `required_command` | "Always run `npm run lint`" | Terminó una sesión con ediciones y nunca lo corrió |
| `required_sequence` | "After editing code, verify with `npm test`" | No verificó después de la última edición |

El resto de instrucciones queda como `exposure_only`: se mide su costo en tokens, pero no se juzga con patrones. **Cumple por equivalente**: si el agente corre lo mismo que ejecuta un script (`npm run check` cuando el script ya llama a lint y test), cuenta como cumplido y se lista aparte para que lo revises. Los comandos con `--write` o `--fix` nunca cuentan como verificación. En Claude Code, Held además lee `tool_result.is_error`.

### 3. Instrucciones del chat y compactación

Held extrae de tus mensajes las frases con forma de instrucción ("nunca…", "no toques…", "don't…", "usá X en vez de Y"), descarta las plantillas que el propio harness mete en el mensaje y las compara con el resumen de la compactación:

- **Claude Code:** `compact_boundary` y la línea `isCompactSummary` del JSONL;
- **Cursor:** `compaction/segment_NNN.md`, sección *Summary (curated by compaction step)*.

Si la instrucción tiene un ancla concreta (una ruta, un comando entre backticks, un flag) y ninguna aparece en el resumen —incluido el **nombre de archivo** cuando el resumen solo menciona `db-reset.mjs`— cuenta como **perdida**. Las instrucciones sin ancla no se miden como perdidas/conservadas con patrones; Held puede proponer un pin `after_compact` igual para que los hooks las reinyecten. **PreCompact** pide explícitamente conservar esos tokens en el resumen; tras compactar, los hooks vuelven a meter hechos + lo que guardaste en `.held/chat/`.

Cuando el contexto se llena y el IDE compacta, corre **`held onboard`** en el repo (o `held report` en CI): mide, aplica pins y deja los hooks listos para la próxima sesión.

### 4. Hooks: hechos, no órdenes

`held install` registra cuatro hooks por harness. Todos fallan en abierto: si algo sale mal, devuelven vacío y el agente sigue.

| Momento | Claude Code | Cursor |
|---|---|---|
| Inicio de sesión | `SessionStart`: hechos medidos por Held | `sessionStart`: igual |
| Mensaje del usuario | `UserPromptSubmit`: guarda tus instrucciones en `.held/chat/` | `beforeSubmitPrompt`: igual |
| Antes de compactar | `PreCompact`: le pide al resumen que las conserve textuales | `preCompact`: marca la conversación |
| Después de compactar | `SessionStart` con `source=compact`: las reinyecta | siguiente `postToolUse`: las reinyecta una vez |
| Lectura de un archivo | `PostToolUse` (`Read`): hecho sobre esa ruta | `postToolUse`: igual |

Cada hook usa solo los campos que su harness acepta: en Cursor, solo `sessionStart` y `postToolUse` aceptan `additional_context`. El texto inyectado dice "información, no órdenes" y tiene un tope de caracteres. Cada hook tarda unos 50 ms (p50 medido, Node 26).

- **Revocaciones:** si después escribes "ya podés tocar `X`" o "ignore that", Held borra la instrucción guardada sobre `X` y no la reinyecta. Lo reinyectado lleva el aviso "si después pidió algo distinto, vale lo más reciente".
- **Secretos:** las instrucciones se guardan con tokens comunes redactados (`sk-…`, `ghp_…`, `xox…`).
- **Rutas:** el comando del hook lleva rutas absolutas de tu máquina. Por eso en Claude Code va a `settings.local.json` y no a `settings.json`. Si Held corre desde la caché de `npx`, `install`, `onboard` y `doctor` avisan, porque npm borra esa caché; `doctor` también marca hooks que apuntan a archivos que ya no existen.

### 5. ¿Sirvió el pin?

`held report` compara cada pin aplicado con su regla: violaciones en las sesiones de antes de aplicarlo y en las de después. Si la regla se sigue rompiendo, lo dice. Es una comparación antes/después sin grupo de control: indica, no prueba.

### 6. Jev: juez opcional detrás de una compuerta medida

[Jev](https://github.com/feder-cr/jev) es un modelo local de CPU que responde sí o no con una probabilidad. Held lo usa solo para lo que los patrones no pueden ver: reglas `exposure_only` con forma de instrucción y frases del chat sin ancla. **No es el centro del producto y viene apagado.** Para encenderlo:

```bash
./jev serve --model-dir /ruta/absoluta/al/modelo   # ver el README de Jev
held jev gate                                       # mide Jev con 48 casos etiquetados a mano
held analyze --judge jev
```

`held jev gate` corre 48 casos (`src/judges/gate-cases.json`), en pares con la misma instrucción y etiquetas opuestas. Elige el umbral con la mitad de los pares y mide en la otra mitad. Una tarea se enciende solo si en la mitad de prueba logra **precisión ≥ 0,9 y recall ≥ 0,15**. Lo que reporta Jev sale en una sección aparte, con su probabilidad, y nunca se mezcla con las violaciones determinísticas.

Medición real del 22 nov 2026 con `jevos-v5` (archivo completo con la probabilidad de cada caso en [`docs/jev-gate.json`](docs/jev-gate.json)):

| Tarea | Calibración | Prueba | Estado |
|---|---|---|---|
| `violation`: ¿alguna acción del agente rompe la regla? | umbral 0,9 · precisión 1,0 · recall 0,17 | precisión 1,0 · recall 0,33 | **Encendida** |
| `preserved`: ¿el resumen conserva la instrucción? | ningún umbral llega a precisión 0,9 (0,86: 1 falso positivo) | precisión 1,0 · recall 1,0 | **Apagada** |

Dos notas honestas:

- poner la regla dentro de la pregunta, como recomienda Jev, funcionó mejor que una pregunta genérica: `preserved` llegó a 0,92 de precisión y 1,0 de recall sobre los 48 casos. Aun así, la tarea no pasa la calibración y queda apagada; no bajamos el mínimo para que pase;
- `violation` encendida significa que Jev casi no da falsas alarmas, no que encuentre todo: detecta 1 de cada 3 violaciones reales. Sobre los 18 proyectos reales de este equipo hizo 19 preguntas y ninguna superó el umbral.

## Evaluación

### Reglas verificables: 4 rondas, 19 sesiones reales de Cursor

Repo trampa `held-demo-tienda` (Node, sin dependencias, `AGENTS.md` en git). Tareas que no mencionan las reglas. Hoja de verdad revisada a mano contra cada `tool_use`.

| Ronda | Modelo | Sesiones | Violaciones reales | Reportadas | Precisión | Recall |
|---|---|---|---|---|---|---|
| 1. Tareas neutrales | `composer-2.5-fast` | 5 | 1 | 1 | 1,0 | 1,0 |
| 2. Tareas neutrales | `gemini-3-flash` | 5 | 16 | 16 | 1,0 | 1,0 |
| 3. "Rápido, sin tests" | `composer-2.5-fast` | 5 | 7 | 7 | 1,0 | 1,0 |
| 4. Trampas dirigidas (generated, `rm -rf`, `.cursor/rules`) | `gemini-3-flash`, `grok-4.6` | 4 | 4 | 4 | 1,0 | 1,0 |

Los cinco tipos verificables tienen al menos un verdadero positivo en una sesión real. La evaluación encontró dos errores de Held, y los dos se corrigieron:

- `npm run check` (que ya corre lint y test) se marcaba como 5 violaciones; de ahí salió el **cumple por equivalente**;
- `rm -rf /ruta/absoluta/data` no se reconocía como `rm -rf data`.

Las 5 sesiones de la ronda 1 están en [`examples/demo-tienda/cursor/`](examples/demo-tienda/cursor/) y [`test/demo.test.mjs`](test/demo.test.mjs) verifica que los veredictos coinciden con la hoja de verdad.

### Proyecto real (Pymesolve)

En 5 sesiones juzgables de un proyecto con `AGENTS.md` en git, Held encontró 2 violaciones reales de "Don't edit generated code: `app-lib/clients/*`". El agente había agregado a mano un cliente al código que Scaffold regenera. Las otras 25 sesiones en disco no se juzgaron: venían de carpetas borradas o de reglas sin historial y modificadas después. Held las omite y dice por qué.

### Compactación en historiales reales

De 106 sesiones de Cursor en disco, 8 tuvieron compactación. Entre las instrucciones perdidas hubo una real: "ejecuta `npm run agents:sync`", ausente del resumen después de 7 compactaciones.

## Arquitectura

```text
bin/held.mjs               entrada (shebang)
src/cli/                   args, comandos, formato y ayuda
src/readers/               cursor.mjs, claude.mjs, projects.mjs (transcripts → eventos comunes)
src/analyzers/             extractor (5 tipos), exposure (git/mtime), compliance, equivalence,
                           directives (instrucciones del chat), compaction
src/suggest.mjs            propuestas → .held/automations.json
src/hooks/runtime.mjs      lógica de los hooks de Cursor y Claude Code
src/install.mjs            merge idempotente de .cursor/hooks.json y .claude/settings.local.json
src/onboard.mjs            analyze + pins seguros + install en un paso
src/effects.mjs            antes/después de cada pin aplicado
src/judges/                jev.mjs (cliente HTTP), gate.mjs (compuerta), judge.mjs, gate-cases.json
examples/demo-tienda/      repo de la demo con su hoja de verdad
test/                      node:test, 99 pruebas (incluye E2E por CLI), sin red ni Jev
```

Los dos lectores producen los mismos eventos (`user_text`, `tool_use` con `family` edit/shell/read, `compact_summary`), así que el resto del pipeline no sabe de qué harness viene cada sesión.

## Límites conocidos

- **El soporte de Claude Code se probó con un JSONL escrito a mano** que sigue el formato público, no con sesiones reales de este equipo, que usa Cursor. El lector tolera líneas rotas y campos faltantes.
- Cursor no guarda el resultado de las herramientas: un comando que falló cuenta como ejecutado.
- Las reglas sobre lecturas ("no leas Y") todavía no se verifican.
- La detección de instrucciones del chat usa patrones en español e inglés; una instrucción redactada de otra forma no se ve. Descarta preguntas, hábitos ("como siempre…", "I always…") y pasado ("nunca usábamos…"), pero quedan fragmentos sin ancla; esos nunca se cuentan como perdidos y `onboard` no los aplica solos.
- "Conservada" significa que el ancla (ruta, comando, archivo) aparece en el resumen, no que el resumen conserve la negación. Un resumen que diga "se editó `db-reset.mjs`" cuenta como conservada.
- En proyectos reales, la mayoría de las reglas no tienen forma verificable (en este workspace, 1 de 21). Held lo dice en el reporte y muestra cómo reescribirlas; las demás solo se cuentan en tokens.
- Si commiteas `AGENTS.md` después de editarlo, las sesiones intermedias se juzgan con el commit anterior.
- El preCompact de Cursor no puede influir en su resumen: en Cursor, Held solo puede reinyectar después.
- No hay lector de Codex.

## Cómo se usaron las herramientas de IA

Held se construyó con Cursor (agente con Claude y otros modelos) durante el hackathon. La IA escribió la mayor parte del código y de las pruebas, a partir de una especificación escrita a mano ([BUILD_BRIEF.md](BUILD_BRIEF.md)). Las decisiones de producto (qué medir, qué no hacer, la compuerta de Jev) y la revisión de cada hoja de verdad fueron humanas. Las sesiones de evaluación las corrieron otros modelos (`composer-2.5-fast`, `gemini-3-flash`, `grok-4.6`) dentro de Cursor, y esos transcripts son los datos que Held analiza.

## Desarrollo

```bash
npm test          # node --test, sin red
npm run demo
```

Proyecto del Dojo AI Hackathon, Track 01 (Build for Builders). Licencia MIT.
