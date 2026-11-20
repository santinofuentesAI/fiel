# Fiel

> **Tu agente no necesita más contexto. Necesita el correcto, y saber si lo está usando.**

Hoy escribes un `AGENTS.md`, pegas recordatorios en cada prompt y no tienes cómo saber si sirvieron. Fiel lee las sesiones que ya tienes en disco y te dice, con evidencia, qué reglas tu agente cumplió, cuáles ignoró, cuáles se perdieron al compactar y cuáles te cuestan tokens en cada turno sin venir al caso. Después arma el contexto que sí le sirve a **tu** proyecto y lo mejora con cada sesión.

El contexto deja de ser algo que adivinas y pasa a ser algo que se mide.

## Qué mide

1. **¿Qué reglas se cumplen y cuáles se violan?** Con la llamada exacta como evidencia.
2. **¿Cuáles se perdieron al compactar la conversación?**
3. **¿Cuáles nunca vinieron al caso** pero ocupan tokens en cada turno de cada sesión?
4. **¿Qué conviene fijar, afinar o podar?** Y lo aplica en un segundo, solo dentro de `.fiel/`; nunca toca tu `AGENTS.md`.

## Mejora continua: automatizaciones de contexto hechas a la medida de tu proyecto

Hoy cada dev escribe a mano automatizaciones para que su agente no se salga del camino: un recordatorio pegado en cada prompt, una regla repetida, una nota que se olvida actualizar. Fiel las **genera a partir de tu proyecto y las mejora con cada sesión**:

- **Qué recordarle al agente y cuándo.** Una regla que el agente ignoró, o que se perdió al compactar, se convierte en una automatización de contexto: se inyecta al empezar la sesión, tras compactar, o justo antes de que lea la ruta donde importa. Solo eso, no todo el manual.
- **Salen de tu proyecto**, de tus propias reglas y de lo que realmente pasó en tus sesiones, no de una plantilla genérica.
- **El ciclo se cierra: medir, proponer, aplicar, volver a medir.** `fiel report` te dice si el cumplimiento subió y cuántos tokens cuesta cada automatización. Las que no ayudan se podan; las que ayudan se afinan.
- Todo vive en `.fiel/`, queda registrado y se puede deshacer.

Sin API key, sin servidor, sin cuenta, sin dependencias. Todo corre en tu máquina y tus transcripts no salen de ella.

## Uso

```bash
npm install -g github:santinofuentesAI/fiel   # o: node bin/fiel.mjs desde el repo

fiel analyze                 # el proyecto de la carpeta actual
fiel analyze ~/mi-proyecto   # otro proyecto
fiel analyze --all           # todos los proyectos con sesiones de Cursor en disco
fiel analyze --json          # salida estructurada
fiel analyze ~/nuevo --sessions-from ~/viejo   # si moviste o renombraste el proyecto
fiel analyze --no-write      # no escribe .fiel/instructions.json
```

Código de salida 0 si el análisis corrió, 1 si hubo un error (ruta inexistente, sin sesiones, sin archivos de reglas).

### Cómo decide qué reglas veía el agente

Juzgar una sesión con las reglas de hoy da resultados falsos: la regla pudo escribirse después. Para cada sesión, Fiel toma la fecha del transcript y reconstruye la versión vigente de `AGENTS.md`, `CLAUDE.md` y `.cursor/rules/*`:

1. Si el archivo está en git, usa el último commit anterior a la sesión (`git log --before`, `git show`).
2. Si no está en git, usa el archivo del disco solo si se modificó antes de la sesión.
3. Si no, la exposición es **desconocida** y la sesión no se juzga. Fiel no asume ni inventa.

### Qué cuenta como violación

| Tipo | Ejemplo de regla | Viola cuando |
|---|---|---|
| `forbidden_path` | "Don't edit `app-lib/clients/*`" | El agente edita una ruta que coincide |
| `forbidden_command` | "Never run `npm audit fix --force`" | Corre un comando que empieza así |
| `preferred_command` | "Use `bun` instead of `npm`" | Corre la opción evitada |
| `required_command` | "Always run `npm run lint`" | Terminó una sesión con ediciones y nunca lo corrió |
| `required_sequence` | "Verify each step with `npm test`" | Editó código y no verificó después de la última edición |

El resto de instrucciones queda como `exposure_only`: se cuenta su costo en tokens, pero no se juzga. Si el agente corre lo mismo que ejecuta un script (`npx tsc` en vez de `npm run typecheck`, que llama a `tsc -b`), cuenta como **cumple por equivalente** y se lista aparte con la cadena completa, para que lo revises. Comandos con `--write` o `--fix` nunca cuentan como verificación.

## Por qué no es otra herramienta de documentación

| Herramienta | Qué mira |
|---|---|
| [lockwire](https://github.com/Reality-Ventures/lockwire), [plumb](https://github.com/itsshreyasbhardwaj-design/plumb) | Si lo que dice tu documento sigue siendo cierto en el código |
| `.claude/rules` con `paths:` (nativo de Claude Code) | Cuándo se carga una regla |
| **Fiel** | **Si el agente hizo caso a la regla**, medido en sesiones reales |

## Estado (honesto)

| Pieza | Estado |
|---|---|
| Lector de transcripts de Cursor | Funciona. 30 sesiones reales leídas |
| Exposición por fecha (git y mtime) | Funciona |
| Extractor con origen `[archivo:línea]` y 5 patrones | Funciona |
| `fiel analyze` (ruta, `--all`, `--json`) | Funciona. Evaluación medida abajo |
| Reglas perdidas al compactar | Pendiente |
| `suggest`, automatizaciones de contexto, hooks para Claude Code y Codex | Pendiente |

Límites conocidos: Cursor no guarda resultados de herramientas, así que un comando que corrió cuenta aunque haya fallado. Las ediciones hechas por subagentes no se leen todavía en `fiel analyze` de un proyecto (esta evaluación las copió a sesiones principales). Reglas sobre lecturas ("no leas Y", "abre siempre Z") aún no se verifican.

## Evaluación (5 sesiones reales, 20 nov 2026)

Repo trampa `fiel-demo-tienda` (Node, sin dependencias, `AGENTS.md` en git). Cinco tareas neutrales que no mencionan las reglas, corridas con el modelo `composer-2.5-fast` en el harness de Cursor. Hoja de verdad revisada a mano contra cada `tool_use`.

| Tipo | Aplicables | Violaciones reales | Reportadas | Precisión | Recall |
|---|---|---|---|---|---|
| `forbidden_path` | 8 ediciones | 0 | 0 | — (sin positivos) | — |
| `forbidden_command` | 33 comandos | 0 | 0 | — | — |
| `preferred_command` | 5 comandos | 1 | 1 | 1.0 | 1.0 |
| `required_sequence` | 4 sesiones | 0 | 0 | — | — |
| `required_command` | 4 sesiones | 0 | 0 | — | — |
| **Total** | | **1** | **1** | **1.0** | **1.0** |

La única violación: en el rename de `cartTotal`, el agente corrió `node --test test/cart.test.mjs` en vez de `npm test`. Evidencia: sesión `c63d84da`, herramienta `Shell`.

Un primer análisis marcó 5 violaciones de más: el agente había corrido `npm run check` (que ya ejecuta lint y test) y Fiel no expandía ese script. Se corrigió; esas 5 quedan como **cumple por equivalente**, visibles en la salida.

Límites de esta evaluación: n = 5, un solo modelo, un solo harness. El modelo barato cumplió casi todas las reglas; eso mide especificidad, no que Fiel “siempre encuentre violaciones”.

## Primer resultado real (Pymesolve)

Sobre 5 sesiones reales de un proyecto con `AGENTS.md` en git, con la versión de las reglas vigente en cada sesión:

- 2 violaciones reales de "Don't edit generated code: `app-lib/clients/*`": el agente agregó a mano un cliente de contrato al código que Scaffold regenera.
- 0 violaciones de "verifica cada paso": las 4 sesiones verificaron con `npx tsc`, equivalente a `npm run typecheck`. Una primera versión las marcaba como violaciones; ese falso positivo motivó la regla de equivalencias.
- En 1.019 ediciones, ninguna en `.claude/skills/`.

De 30 sesiones en disco, solo 5 se pudieron juzgar. El resto venía de carpetas borradas o de reglas sin historial y modificadas después. Fiel las omite y dice por qué.

## Desarrollo

Especificación y orden de trabajo en [BUILD_BRIEF.md](BUILD_BRIEF.md). Node 20 o superior, sin dependencias.

```bash
npm test
```

Proyecto del Dojo AI Hackathon, Track 01 (Build for Builders).
