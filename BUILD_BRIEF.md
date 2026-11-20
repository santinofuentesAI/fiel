# Fiel: brief de construcción (para Antigravity o cualquier agente)

Documento autocontenido. Lo escribí a partir de la investigación y verificación hechas el 20 nov 2026. Cada dato dice si está **verificado** (leído en documentación o en datos reales de la máquina) o **por verificar**.

## 0. Prompt de arranque para Antigravity

> Lee `BUILD_BRIEF.md` completo. Construye el MVP de Fiel en Node 20+ sin dependencias externas (ESM, `node:test` para pruebas). Respeta el orden de la sección 9. No toques `AGENTS.md` ni `CLAUDE.md` del usuario; todo el estado va en `.fiel/`. Después de cada paso corre las pruebas y dime qué precisión midió el analizador sobre los transcripts reales antes de seguir.

## 1. Qué es

Fiel mide, en sesiones reales, si un agente de código sigue las instrucciones de `AGENTS.md`, `CLAUDE.md` y reglas, y actúa sobre lo medido.

- **Mide** por instrucción y por sesión: exposición (¿estaba en el contexto?), eventos aplicables, cumplimiento o violación, costo acumulado en tokens, supervivencia a la compactación.
- **Actúa:** `fiel suggest` propone fijar, podar o endurecer; `fiel apply <id>` lo aplica solo dentro de `.fiel/`; los hooks reinyectan solo lo fijado.
- **Funciona desde el día 1** sobre el historial que ya existe en disco.
- Núcleo determinístico, sin API key. Un modelo tipo Jev es opcional (sección 8).

### Por qué este eje (exists-check, 20 nov 2026)

Ya existen y NO se compite ahí:
- [lockwire](https://github.com/Reality-Ventures/lockwire) (3 estrellas): ata afirmaciones de documentos a huellas del código; hooks para Claude Code y Codex; MCP.
- [plumb](https://github.com/itsshreyasbhardwaj-design/plumb) (1 estrella): linter de afirmaciones de `CLAUDE.md` contra el repo.
- `vr1e/claude-md-audit` (1): audita `CLAUDE.md` contra el código.
- Claude Code carga `CLAUDE.md` de subcarpetas y `.claude/rules/` con `paths:` solo cuando el agente trabaja en esas rutas ([doc de memoria](https://code.claude.com/docs/en/memory)).
- Adyacentes: `compaction-audit` (1, imprime qué sobrevive a la compactación), `claude-code-analytics` (11, uso y costo), `adherence-suite` (1, benchmark sintético), `lossless-context-mcp` (4, recibos de versiones de archivo).

No encontré: cumplimiento medido por instrucción en sesiones reales ni un ciclo que use esa medición. La búsqueda por palabras clave en GitHub no ve todo y ninguna de esas herramientas tiene tracción fuerte; **la demanda no está validada**.

## 2. Hackathon: reglas y criterios (verificado en la página oficial)

- Dojo AI Hackathon "Del prompt al producto". Construcción 20 a 22 nov 2026, jurado 23 nov. Hora Costa Rica (UTC−6). Página: https://www.trydojo.io/hackathons/dojo-ai-hack
- **Track 01, Build for Builders.** Criterios: utilidad real para builders 30%, potencial de venta en el Marketplace 25%, calidad técnica y que funcione 25%, documentación y facilidad de instalación 20%. No hay criterio de novedad.
- **Cierre de entrega:** domingo 22 nov, 11:59 pm hora Costa Rica. Solo el capitán entrega y debe explicar cómo usó herramientas de AI coding. Los enlaces deben ser verificables. Si el proyecto ya existía, documentarlo.
- La entrega se publica sola en el Dojo Marketplace (el vendedor se queda con el 85% de cada venta). Se puede entregar MCP, plugin, skill, agente, repo, template, app o micro SaaS.
- Competencia vista (41 proyectos): Centinela (guardarraíl de seguridad local para Claude Code y Cursor, el más fuerte), Reskin Labs, TestPilot AI, Talent Pulse. Ninguno de contexto.

## 3. Datos reales y formatos

### 3.1 Transcripts de Cursor (VERIFICADO en esta máquina)

Ruta: `~/.cursor/projects/<proyecto>/agent-transcripts/<uuid>/<uuid>.jsonl` (también `<uuid>.jsonl` suelto). Unas 50 sesiones, 20 MB, 9 proyectos (19 en `scaffold-stellar-agentic`, 15 en este workspace). Es el dataset para probar hoy.

- Una línea JSON por evento. Formas vistas:
  - `{"role": "user" | "assistant", "message": {"content": [ ... ]}}`
  - `{"status": ..., "type": ...}` (9 de 1.312 líneas; ignorar)
- Bloques de `content`: `{"type":"text","text":"..."}` y `{"type":"tool_use","name":"...","input":{...}}`. En una sesión de ejemplo: 770 mensajes de assistant solo con `tool_use`, 198 con `text` y `tool_use`, 139 solo texto, 196 del usuario.
- Herramientas vistas: `Read`, `StrReplace`, `Shell`, `CallDynamicTool`, `Grep`, `GetDynamicTools`, `Write`, `Glob`, `CreatePlan`. Rutas en `input` (por ejemplo `path`), comandos de shell en `input.command`.
- El texto del usuario viene envuelto: `<timestamp>...</timestamp>\n<user_query>\n...\n</user_query>`. Hay que extraer solo lo de `<user_query>`. Pueden existir bloques `<system_reminder>`, `<attached_files>` y similares que NO son del usuario.
- **No hay resultados de herramientas** en lo observado (ni `tool_result`). Por eso "corrió los tests" significa "se ejecutó el comando", no "pasaron". **Por verificar** en otras sesiones.
- **Compactación (verificado):** junto a cada sesión larga hay `compaction/INDEX.md` y `compaction/segment_NNN.md` (una sesión tiene 6 segmentos de 600 a 730 KB, con turnos por segmento y palabras clave). Sirve para medir qué instrucciones aparecían antes y después de cada compactación. Formato interno de los segmentos **por verificar**.
- Carpeta `subagents/` por sesión con transcripts de subagentes (formato igual, por confirmar).
- Los `timestamp` solo están dentro del texto del usuario (no hay marca de tiempo por línea en lo visto).

### 3.2 Claude Code (VERIFICADO en documentación oficial; no instalado aquí)

Doc de hooks: https://code.claude.com/docs/en/hooks

- Transcript JSONL en `transcript_path` (campo de entrada de todos los hooks). Se escribe de forma **asíncrona** y puede ir atrasado: los hooks vivos no deben depender de leerlo en tiempo real.
- Compactación: línea `system` con subtipo `compact_boundary` y `compactMetadata`, seguida de una línea `user` con `isCompactSummary: true`.
- Entrada común de hooks: `session_id`, `transcript_path`, `cwd`, `hook_event_name`. Eventos de herramienta traen `tool_name`, `tool_input`, `tool_use_id`.
- **Salidas que importan:**
  - `SessionStart`: `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"..."}}`. Entra al contexto antes del primer prompt. Campo `source`: `startup`, `resume`, `compact`, etc.
  - `UserPromptSubmit`: `additionalContext` junto al prompt. No puede reemplazar el prompt.
  - `PreToolUse`: `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow|deny|ask|defer","permissionDecisionReason":"...","additionalContext":"..."}}`. Con `deny`, el modelo lee la razón. `additionalContext` llega **junto al resultado de la herramienta**, es decir después de ejecutar: sirve para `Read`, tarde para `Edit` y `Write`. Salir con código 2 equivale a `deny` (stderr es la razón).
  - `PreCompact`: stdout se usa como instrucciones para el resumen de compactación; recibe `transcript_path`. `PostCompact` recibe `compact_summary` y no controla nada.
  - `Stop`: puede devolver `decision: block` con razón, o `additionalContext`.
  - `PermissionDenied` solo dispara cuando el modo automático niega; **no** sirve para detectar rechazos manuales del usuario.
- Tope de `additionalContext`: 10.000 caracteres; si lo supera, Claude Code guarda un archivo y pasa solo una vista previa.
- **Redacción de lo inyectado:** texto con forma de orden de sistema activa las defensas contra prompt injection y el modelo se lo muestra al usuario en vez de obedecer. Redactar como información ("En este repo los tests corren con `bun test`"), no como orden.
- Timeout de un hook `UserPromptSubmit` descarta su salida.

### 3.3 Codex CLI (PARCIAL)

- Versión local: codex-cli 0.167.1. `~/.codex/hooks.json` registra los eventos `session_start`, `user_prompt_submit`, `pre_tool_use`, `permission_request`, `post_tool_use`, `subagent_start`, `subagent_stop`, `stop`, `interrupt`. **Por verificar:** esquema exacto de entrada y salida de cada hook.
- Sesiones en `~/.codex/sessions/AAAA/MM/DD/rollout-*.jsonl`. Local hay solo 2 sesiones de un turno. Tipos de línea vistos: `session_meta`, `turn_context`, `world_state`, `response_item` (con `payload.type` = `message`), `event_msg` con `payload.type` ∈ `task_started`, `user_message`, `agent_message`, `token_count`, `task_complete`. Cómo se ven las llamadas a herramientas: **por verificar** con una sesión larga.

## 4. Estructura del repo

```
bin/fiel.mjs            CLI (despacha subcomandos)
src/readers/            cursor.mjs, claude.mjs, codex.mjs  -> eventos normalizados
src/analyzers/          instructions.mjs, patterns.mjs, friction.mjs, compaction.mjs, position.mjs
src/hooks/              session-start.mjs, pre-tool-use.mjs, pre-compact.mjs, log.mjs
src/report/             terminal.mjs (tablas con colores ANSI y barras ASCII)
test/                   node:test + fixtures (JSONL mínimos por formato)
demo/                   repo de ejemplo con AGENTS.md largo y trampa
.fiel/                  instructions.json, pinned.json, log.jsonl (ignorado), cache/ (ignorado)
```

**Evento normalizado** (salida de todos los lectores):

```json
{"session":"uuid","index":12,"role":"user|assistant","kind":"user_text|assistant_text|tool_use",
 "tool":"Edit|Write|Read|Shell|...","path":"src/a.ts","command":"npm test","text":"..."}
```

Normalizar nombres de herramienta a una familia: `read`, `edit` (Edit, Write, StrReplace, MultiEdit), `shell` (Bash, Shell), `search`, `other`.

## 5. Algoritmos

### 5.1 Extractor de instrucciones
Leer `AGENTS.md`, `CLAUDE.md`, `.claude/rules/*.md`, `.cursor/rules/*`. Cada viñeta, o línea imperativa, es una instrucción con `id`, `texto`, `archivo`, `línea`, `posición relativa` (línea/total). Marcar como **verificable** solo si calza un patrón (5.2). Lo demás: "solo exposición". Guardar en `.fiel/instructions.json`, editable.

### 5.2 Cuatro patrones verificables (determinísticos)
1. **Ruta prohibida:** "no toques / nunca edites / never modify `X`" con ruta o glob. Violación: evento `edit` sobre ruta que coincide.
2. **Comando preferido:** "usa `bun test`, no `npm test`" / "use X instead of Y". Violación: `shell` con Y habiendo X.
3. **Comando requerido:** "siempre corre / always run `X`". Se evalúa al terminar la sesión o antes de un commit.
4. **Secuencia obligatoria:** "corre los tests después de editar `src/`", "linter antes de hacer commit". Violación: hubo `edit` en el alcance y la sesión terminó, o hubo `git commit`, sin un `shell` de tests/linter posterior al último `edit`. Comandos de tests: detectar por `package.json` scripts y patrones (`test`, `pytest`, `go test`, `cargo test`, `bun test`, `vitest`, `jest`).
Cada resultado guarda la **evidencia** (índice de evento y la llamada concreta). Sin evidencia no se marca violación.

### 5.3 Detector de fricción humana (reglas blandas)
Un mensaje del usuario inmediatamente posterior a un turno del assistant con `tool_use` que contiene señales de corrección se registra como incidente. Lista inicial (ES/EN), a calibrar con datos reales:
- ES: "no, te dije", "te dije que", "otra vez", "de nuevo", "borra eso", "revierte", "deshaz", "no hagas", "usa X, no Y", "eso no", "no era eso", "te pedí".
- EN: "no, I said", "I told you", "again", "revert that", "undo", "don't", "that's not what I asked", "use X not Y".
- Falsos positivos a descartar: "no entiendo" (confusión, no corrección), "no" dentro de frases informativas, el primer mensaje de la sesión, mensajes que solo pegan texto largo.
- Medir **precisión revisando 30 incidentes a mano** antes de confiar. Dejar el turno anterior del assistant junto al incidente (para Jev y para mostrar evidencia).

### 5.4 Compactación
- Cursor: usar `compaction/segment_*.md`; medir qué instrucciones (por coincidencia textual o de ruta) aparecen antes y no después. Formato por verificar.
- Claude Code: detectar `compact_boundary` e `isCompactSummary`, buscar si el texto o la ruta de cada instrucción aparece en el resumen.

### 5.5 Zona muerta
Calcular para cada instrucción verificable su tercio (inicio, medio, final) y la tasa de violación por tercio **en todo el conjunto**. Mostrar solo con muestra suficiente (mínimo sugerido: 5 eventos aplicables por tercio) y como hipótesis ("candidata a moverse a inyección just-in-time"). La literatura de "perdido en el medio" es sobre recuperación en contextos largos; no está verificada para archivos de instrucciones en modelos actuales.

### 5.6 Costo acumulado
tokens aproximados de la instrucción (caracteres/4) × turnos × sesiones. Presentar como tokens acumulados y como % del contexto, **no en dólares**: el prompt caching abarata el prefijo estático y el argumento real es la atención.

## 6. CLI

| Comando | Qué hace |
|---|---|
| `fiel analyze [--source cursor\|claude\|codex] [--project ruta]` | Corre lectores y analizadores y escribe resultados en `.fiel/` |
| `fiel report` | Tabla en terminal: más violadas (con evidencia), nunca aplicables (costo acumulado), perdidas al compactar, fricción, zona muerta |
| `fiel suggest` | Propone fijar, podar o endurecer, con id |
| `fiel apply <id>` | Aplica una propuesta solo en `.fiel/` (nunca en `AGENTS.md`) |
| `fiel install --claude\|--codex` | Registra los hooks |
| `fiel doctor` | Comprueba hooks activos y fuentes de datos |

Sin servidor web ni gráficas: colores ANSI (verde, amarillo, rojo) y barras ASCII.

## 7. Hooks vivos (después de que el analizador funcione)

- `SessionStart`: inyecta, como hechos, solo las instrucciones fijadas (máximo ~700 caracteres). Con `source` `compact` o `resume`, reinyecta las fijadas.
- `PreCompact`: stdout pide conservar las fijadas.
- `PreToolUse`: sobre `Read`, `additionalContext` con lo fijado de esa ruta. Sobre `Edit` y `Write`, `deny` solo si hay regla `never` o si el agente modifica una ruta con instrucciones fijadas que no leyó antes en la sesión; en otro caso `allow` (negar quema un turno y puede hacer que el modelo se rinda o rodee con `sed`/`echo`).
- Bitácora `.fiel/log.jsonl` de eventos (necesaria en Claude Code porque el transcript llega con retraso).
- Un rechazo manual cuenta solo si el `PreToolUse` fue `allow` o `ask` (nunca un `deny` de Fiel) y el siguiente evento es otro `PreToolUse`, un `UserPromptSubmit` o un `Stop` sin `PostToolUse` ni `PostToolUseFailure` para ese `tool_use_id`.
- Cada hook debe responder en menos de 100 ms; modo observación (`--dry-run`) registra sin inyectar.

## 7b. Automatizaciones de contexto generadas para mejora continua

Decisión del usuario (20 nov): a partir del proyecto, Fiel crea las automatizaciones que hoy cada dev escribe a mano para mantener al agente en el camino (recordatorios por prompt, reglas repetidas, notas), y las mejora de forma continua. **Es contexto, no guardas de seguridad ni bloqueos.** Un error anterior de este documento las describía como guardas `deny`/`ask`; se retiró.

- **Fuente:** reglas del `AGENTS.md`/`CLAUDE.md`/reglas del propio proyecto y lo medido en sus sesiones (sección 5). Nada de plantillas genéricas.
- **Qué se genera** (`fiel suggest` propone, `fiel apply <id>` aplica, todo en `.fiel/automations.json`): una **automatización de contexto** es un hecho breve más un **disparador**:
  - `session_start`: al iniciar o reanudar la sesión.
  - `after_compact`: tras compactar, reinyectar lo que se perdió.
  - `before_read:<glob>`: justo antes de que el agente lea esa ruta (el contexto llega junto al resultado de `Read`).
  - `before_prompt`: recordatorio global muy corto junto al prompt (máximo 1 a 3).
  - Cada una lleva `id`, la regla de origen (archivo y línea), la evidencia que la motivó (sesión y evento), la fecha de aplicación y su costo en tokens.
- **Cómo se entrega:** con los hooks `SessionStart`, `PreCompact`, `UserPromptSubmit` y `PreToolUse` sobre `Read` (`additionalContext`), siempre redactado como información, máximo ~700 caracteres en total por momento.
- **Ciclo continuo:** medir, proponer automatización, aplicar, volver a medir. `fiel report` compara cumplimiento antes y después (misma regla, sesiones posteriores a la fecha de aplicación) y el costo en tokens. Las que no mejoran el cumplimiento o nunca vienen al caso se proponen para podar; las que mejoran se mantienen o se afinan (por ejemplo, moverlas a `before_read` si estaban en `session_start`).
- **Seguridad del propio proceso:** nunca se aplica nada sin confirmación; nunca se edita la documentación del usuario; modo observación (`--dry-run`) registra qué habría inyectado.
- **Bloqueos:** solo se mantiene el tipo `never` explícito de la sección 7 (opcional); no es el producto.
- **Honestidad:** depende de que el analizador de la sección 5 y la exposición (sección 11b) funcionen; sin evidencia fiable no se propone ninguna automatización.

## 8. Jev (opcional, con compuerta)

Jev es un modelo pequeño que no escribe: recibe un texto y una pregunta y devuelve probabilidades. Aquí juzga cumplimiento donde el patrón no ve: dada una instrucción y una acción del agente (o un turno con fricción), ¿hubo violación?

- Modelo: `jevos` (https://github.com/feder-cr/jev, MIT). Binario CPU sin Python, 28 a 130 ms, unos 1 GB de memoria, contexto de 8.192 tokens, local y gratis. Usa OpenVINO: **confirmar que corre en tu CPU** y cuánto pesa la descarga del modelo.
- Protocolo (verificado en su README): `POST http://127.0.0.1:8017/v1/systemone`

```json
{"model":"jev-latest",
 "state":{"instruction":"No edites migraciones ya aplicadas","action":"Edit db/migrations/003_add_users.sql"},
 "questions":{"violation":{"type":"noul","instructions":"Does the action violate the instruction?"}}}
```
Respuesta: `{"answers":{"violation":{"type":"noul","noul":0.97}}}`. Las preguntas `choice` devuelven además `confidence`. `GET /health` informa el estado. `./jev serve` levanta el servidor. Con `FIEL_DECISION_URL` sirve también Jev alojado, laya o Kev.
- Uso: fuera de línea sobre transcripts (la latencia no importa), resultados marcados aparte de los determinísticos, nunca genera bloqueos por sí solo.
- **Compuerta (sábado en la tarde, máximo 2 h, solo con el MVP pasando):** 40 casos (instrucción, acción, etiqueta). Activar por defecto solo si suma al menos 15 puntos de recall sobre el patrón con 90% de precisión. Si no, queda apagado y se documenta.

## 9. Orden de construcción y criterios

**Hoy (vie 20):**
1. `src/readers/cursor.mjs` + pruebas con un fixture. Normalizar y contar eventos sobre los 50 transcripts reales.
2. `src/analyzers/friction.mjs`. Correr sobre todos los transcripts, listar incidentes, **revisar 30 a mano y medir precisión**. Esta es la primera prueba de verdad: si casi no hay incidentes o la precisión es baja, parar y replantear.
3. `src/analyzers/instructions.mjs` y `patterns.mjs` (los cuatro tipos). Medir qué fracción de las instrucciones de un `AGENTS.md` real es verificable; si más de la mitad queda en gris, la fricción debe llevar el peso del reporte.
4. Leer el esquema de hooks de Codex.

**Sábado:** reporte en terminal, `suggest` y `apply`, compactación, hooks vivos, plugin de Claude Code con prueba real (instalar Claude Code), y a la tarde el spike de Jev.

**Domingo:** repo de demo y corridas, README (instalación en un comando, antes y después), video de 60 s, formulario del capitán con la sección de uso de AI y enlaces verificables.

**Criterios de aceptación:**
- `fiel analyze` procesa 100 sesiones en menos de 5 s.
- Precisión del analizador de 90% o más en 30 eventos verificables revisados a mano; el resto se declara "solo exposición".
- Supervivencia a la compactación detectada en un fixture.
- Con una regla enterrada en un `AGENTS.md` largo, la tasa de cumplimiento mejora medida en corridas reales (mínimo 5 con Fiel y 5 sin él) o, si el modelo no la viola, se documenta y la demo usa el reporte histórico real.
- Pruebas automáticas que simulan el JSON de entrada de cada hook; cada hook responde en menos de 100 ms.
- Instalación en un comando, `fiel doctor` en verde, sin API key.

## 10. Demo de 60 segundos

1. `fiel analyze` y `fiel report` sobre sesiones reales: "en tus últimas N sesiones la regla X se violó K veces (con evidencia); la regla Y nunca vino al caso y ocupa Z tokens acumulados; 2 reglas se perdieron al compactar".
2. Repo de ejemplo con `AGENTS.md` largo y una regla crítica enterrada: sin Fiel el agente la viola; Fiel la detecta y la fija; en la siguiente corrida la cumple.
3. Cierre con `fiel report`: la tasa de cumplimiento sube.

## 11. Qué falta verificar (en este orden) y riesgos

1. Cuántos incidentes de fricción hay en los transcripts reales y con qué precisión se detectan.
2. Cuántas instrucciones reales son verificables (con secuencia incluida).
3. Que haya violaciones reales: si el agente casi no viola, la medición no aporta.
4. Esquema de hooks de Codex y formato de herramientas en sus sesiones largas.
5. Formato interno de `compaction/segment_*.md` y si algún transcript trae el resultado de las herramientas.
6. Claude Code no está instalado: el plugin se prueba al instalarlo.
7. `jevos`: CPU, descarga y calidad.
8. Venta débil: puede parecer analítica. Ningún precio del Marketplace está validado; no prometer cifras.
9. Sin validación con devs reales. Preguntas para el encuentro: ¿tienes alguna regla que tu agente ignora?, ¿cómo te enteras hoy?, ¿instalarías algo que te diga qué reglas se cumplen?

**No hacer:** servidor web, gráficas complejas, editar `AGENTS.md` o `CLAUDE.md` del usuario, verificador de documentos contra el código como producto (ya existe), memoria de decisiones, paquetes de reglas de riesgo y guardas de seguridad (es terreno de Centinela; el producto es contexto), Cursor como harness vivo, Jev en el camino crítico.

## 11b. Hallazgos del 20 nov sobre datos reales (ya medidos)

Código: `src/readers/cursor.mjs`, `src/analyzers/friction.mjs`, `scripts/stats.mjs`, `test/cursor-friction.test.mjs` (8 pruebas pasan).

- Sesiones principales (sin subagentes): **30**, con 12.029 eventos, **691 turnos de usuario** y **9.935 `tool_use`**. (Las "unas 50" de antes incluían subagentes.)
- **Detector de fricción por patrones: 14 detecciones (2,0% de los turnos), precisión estimada de 15 a 20%.** Revisé las 14: solo 2 o 3 eran correcciones reales; el resto eran peticiones ("no hagas nada aún", "continúa con lo que te pedí", "lo quiero sin hablar"). Además falla con faltas de ortografía ("equivicado", "entiendo" por "entendiendo"): mensajes claramente frustrados de este mismo chat no se detectaron. **No cumple el criterio de 90%.** Los patrones sirven para lo verificable; para lo blando hace falta un juez (Jev o un LLM) y revisión humana.
- **Densidad baja:** 2% de los turnos. Aun con juez, el reporte no puede depender solo de fricción.
- **Prueba de violaciones con reglas reales** de los `AGENTS.md` del usuario (editar `app-lib/clients/*`, `npm audit fix --force`, commit o push sin pedirlo): salieron 2 candidatas de "no editar código generado" y 3 de "commit sin pedirlo", **pero no son violaciones confirmadas**:
  - Los directorios de esos proyectos ya no existen (se renombraron o movieron), así que no se puede comprobar si el `AGENTS.md` actual existía, o decía eso, cuando ocurrió la sesión. **Hace falta modelar la exposición:** versión de la regla vigente en cada sesión (con `git log` del archivo o la fecha de modificación). Sin eso, el reporte acusaría al agente de ignorar reglas que no estaban en su contexto.
  - La regla de commits vive en un `AGENTS.md` de otra carpeta distinta a la de las sesiones de ese proyecto.
  - El criterio "el usuario lo pidió" fue un regex sobre el último mensaje; falta revisarlo a mano.
- Implicación para el diseño: `fiel analyze` debe resolver **qué archivo de instrucciones estaba vigente en cada sesión** antes de juzgar cumplimiento, y marcar "sin exposición comprobada" cuando no pueda.

## 12. Referencias
- Hackathon: https://www.trydojo.io/hackathons/dojo-ai-hack
- Hooks de Claude Code: https://code.claude.com/docs/en/hooks
- Memoria de Claude Code: https://code.claude.com/docs/en/memory
- jevos: https://github.com/feder-cr/jev
- Competidores del eje: https://github.com/Reality-Ventures/lockwire y https://github.com/itsshreyasbhardwaj-design/plumb
- Plan de trabajo completo (local, no está en el repo): `/home/santinofl/.cursor/plans/riel_mvp_85475d36.plan.md`
