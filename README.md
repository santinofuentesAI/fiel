# Fiel

> **Tu agente piensa. Fiel decide qué tiene que recordar.**

Hoy le pegas el mismo recordatorio a cada prompt y rezas para que el agente lo respete. Fiel pone al lado de tu agente un segundo cerebro, pequeño y rápido: un **modelo de decisión** (tipo [Jev](https://github.com/feder-cr/jev)) que no escribe texto. Solo contesta preguntas con probabilidades, sin gastar tokens de tu LLM, y puede correr en la CPU de tu laptop (sus autores reportan entre 28 y 130 ms).

El contexto de tu agente deja de ser algo que **escribes** y pasa a ser algo que se **decide**, con evidencia, a partir de tu proyecto.

## Tres decisiones que Fiel toma por ti

| Momento | La pregunta | Tipo de respuesta |
|---|---|---|
| Justo antes de que el agente toque algo | De todas las reglas de este proyecto, ¿cuáles importan **ahora**? | elección entre opciones |
| Después de cada acción | ¿Esta acción rompió una regla que sí estaba en su contexto? | probabilidad de sí o no |
| Después de cada semana | ¿Esta línea de contexto todavía merece ocupar sitio en cada turno? | puntaje |

Así se le pregunta al modelo de decisión (formato real del protocolo `POST /v1/systemone` de Jev; la respuesta mostrada es la forma del resultado, no una medición):

```json
{"state": {"instruction": "No edites el código generado en app-lib/clients/",
           "action": "StrReplace app-lib/clients/index.ts"},
 "questions": {"violation": {"type": "noul",
               "instructions": "Does the action violate the instruction?"}}}
```
```json
{"answers": {"violation": {"type": "noul", "noul": 0.97}}}
```

**Si no hay modelo, no pasa nada.** El núcleo de Fiel es determinístico (rutas, comandos, secuencias) y corre sin API key y sin servidor. El modelo de decisión es una pieza opcional que solo se activa si supera una compuerta de calidad medida sobre casos reales; si no la supera, queda apagado. Habla el protocolo de Jev, así que sirve con Jev alojado, con `jevos` local, con laya o con Kev.

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
- Todo vive en `.fiel/` y nada se aplica sin tu confirmación.

Sin API key, sin servidor, sin cuenta. Todo corre en tu máquina y tus transcripts no salen de ella, tampoco hacia el modelo de decisión si lo corres en local.

## Por qué no es otra herramienta de documentación

| Herramienta | Qué mira |
|---|---|
| [lockwire](https://github.com/Reality-Ventures/lockwire), [plumb](https://github.com/itsshreyasbhardwaj-design/plumb) | Si lo que dice tu documento sigue siendo cierto en el código |
| `.claude/rules` con `paths:` (nativo de Claude Code) | Cuándo se carga una regla |
| **Fiel** | **Si el agente hizo caso a la regla**, medido en sesiones reales |

## Estado (honesto)

| Pieza | Estado |
|---|---|
| Lector de transcripts de Cursor | Funciona. Probado con 30 sesiones reales: 12.029 eventos, 9.935 llamadas a herramientas, 691 turnos. 8 de 8 pruebas pasan |
| Detector de fricción humana | Prototipo con precisión baja (ver abajo) |
| Extractor de reglas y cuatro patrones verificables | En construcción |
| Automatizaciones de contexto generadas desde tu proyecto y mejora continua | En construcción |
| `fiel analyze`, `report`, `suggest`, `apply` | En construcción |
| Hooks para Claude Code y Codex | En construcción |
| Modelo de decisión (Jev o compatible) para elegir contexto y juzgar cumplimiento | Opcional; solo se activa si pasa una compuerta de calidad medida |

## Primer hallazgo

Detectar "el usuario corrige al agente" con patrones de texto en español informal no alcanza. Sobre esas 30 sesiones el prototipo marcó 14 correcciones; revisé las 14 a mano y solo 2 o 3 lo eran de verdad (el resto eran peticiones como "no hagas nada aún" o "lo que te pedí"). Además se le escapan las faltas de ortografía. Conclusión de diseño: lo verificable (rutas, comandos, secuencias) va con patrones determinísticos y lo blando necesita un juez.

## Construcción

Especificación, formatos de datos verificados, algoritmos y orden de trabajo en [BUILD_BRIEF.md](BUILD_BRIEF.md).

```bash
node --test test/          # pruebas
node scripts/stats.mjs     # estadísticas sobre tus transcripts de Cursor
```

Proyecto del Dojo AI Hackathon, Track 01 (Build for Builders).
