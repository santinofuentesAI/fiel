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
- Todo vive en `.fiel/`, queda registrado y se puede deshacer. Cuánto aplica solo y cuánto te pregunta lo decide el dial de rigor (más abajo).

Sin API key, sin servidor, sin cuenta. Todo corre en tu máquina y tus transcripts no salen de ella, tampoco hacia el modelo de decisión si lo corres en local.

## Por qué no es otra herramienta de documentación

| Herramienta | Qué mira |
|---|---|
| [lockwire](https://github.com/Reality-Ventures/lockwire), [plumb](https://github.com/itsshreyasbhardwaj-design/plumb) | Si lo que dice tu documento sigue siendo cierto en el código |
| `.claude/rules` con `paths:` (nativo de Claude Code) | Cuándo se carga una regla |
| **Fiel** | **Si el agente hizo caso a la regla**, medido en sesiones reales |

## Complemento: un modelo de decisión y el dial de rigor

Las reglas con patrón (rutas, comandos, secuencias) se verifican de forma determinística. Para todo lo demás, Fiel se apoya en un modelo de decisión pequeño como [Jev](https://github.com/feder-cr/jev) o uno compatible, que responde preguntas de sí, no o elección con probabilidades: ¿qué contexto importa ahora?, ¿esta acción rompió la regla?, ¿esta automatización sigue sirviendo? Es lo que hace que Fiel se automatice en vez de pedirte revisión para cada cosa.

Como la temperatura en un modelo de lenguaje, hay **un dial de rigor** que decide cuánta libertad toma Fiel:

| Rigor | Qué hace |
|---|---|
| `estricto` | Solo actúa con evidencia fuerte. Inyecta pocas cosas. Propone y nunca aplica solo. |
| `equilibrado` (por defecto) | Aplica solo lo de alta confianza y reversible; lo demás lo propone. |
| `libre` | Más automático y más inventivo: inyecta más contexto, aplica y poda con menos evidencia. Todo queda registrado y se puede deshacer. |

Qué controla el dial: cuánta probabilidad exige el modelo para inyectar o aplicar algo, cuántas cosas entran en cada momento, y cuántas sesiones de evidencia se piden antes de podar. Si no hay modelo, el dial sigue funcionando sobre los umbrales determinísticos. En cualquier nivel, Fiel nunca edita tu `AGENTS.md`, no pasa de unos 700 caracteres por momento y las automatizaciones que aplica pueden deshacerse. Los valores por defecto son provisionales hasta calibrarlos con casos reales, y el modelo solo se activa por defecto si supera una compuerta de calidad medida.

## Estado (honesto)

| Pieza | Estado |
|---|---|
| Lector de transcripts de Cursor | Funciona. Probado con 30 sesiones reales: 12.029 eventos, 9.935 llamadas a herramientas, 691 turnos. 8 de 8 pruebas pasan |
| Detector de fricción humana | Prototipo con precisión baja (ver abajo) |
| Extractor de reglas y cuatro patrones verificables | En construcción |
| Automatizaciones de contexto generadas desde tu proyecto y mejora continua | En construcción |
| `fiel analyze`, `report`, `suggest`, `apply` | En construcción |
| Hooks para Claude Code y Codex | En construcción |
| Modelo de decisión complementario (Jev o compatible) y dial de rigor | En construcción; el modelo solo se activa por defecto si pasa una compuerta de calidad medida |

## Primer hallazgo

Detectar "el usuario corrige al agente" con patrones de texto en español informal no alcanza. Sobre esas 30 sesiones el prototipo marcó 14 correcciones; revisé las 14 a mano y solo 2 o 3 lo eran de verdad (el resto eran peticiones como "no hagas nada aún" o "lo que te pedí"). Además se le escapan las faltas de ortografía. Conclusión de diseño: lo verificable (rutas, comandos, secuencias) va con patrones determinísticos y lo blando necesita un juez.

## Construcción

Especificación, formatos de datos verificados, algoritmos y orden de trabajo en [BUILD_BRIEF.md](BUILD_BRIEF.md).

```bash
node --test test/          # pruebas
node scripts/stats.mjs     # estadísticas sobre tus transcripts de Cursor
```

Proyecto del Dojo AI Hackathon, Track 01 (Build for Builders).
