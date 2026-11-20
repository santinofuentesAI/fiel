# Fiel

> **Tu `AGENTS.md` es un acto de fe.** Fiel lo convierte en un número.

Escribiste "nunca toques X", "corre los tests antes de terminar", "usa bun, no npm". ¿Cuántas veces las cumplió tu agente la semana pasada? No lo sabes. Hoy las reglas se escriben, se esperan y se olvidan.

Fiel lee las sesiones que ya tienes en disco y responde cuatro preguntas:

1. **¿Qué reglas se cumplen y cuáles se violan?** Con la llamada exacta como evidencia.
2. **¿Cuáles se perdieron al compactar la conversación?**
3. **¿Cuáles nunca vinieron al caso** pero ocupan tokens en cada turno de cada sesión?
4. **¿Qué conviene fijar, endurecer o podar?** Y lo aplica en un segundo, solo dentro de `.fiel/`; nunca toca tu `AGENTS.md`.

Sin API key, sin servidor, sin cuenta. Corre en tu máquina y tus transcripts no salen de ella.

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
| `fiel analyze`, `report`, `suggest`, `apply` | En construcción |
| Hooks para Claude Code y Codex | En construcción |
| Juez opcional con un modelo tipo Jev | Opcional; solo se activa si pasa una compuerta de calidad medida |

## Primer hallazgo

Detectar "el usuario corrige al agente" con patrones de texto en español informal no alcanza. Sobre esas 30 sesiones el prototipo marcó 14 correcciones; revisé las 14 a mano y solo 2 o 3 lo eran de verdad (el resto eran peticiones como "no hagas nada aún" o "lo que te pedí"). Además se le escapan las faltas de ortografía. Conclusión de diseño: lo verificable (rutas, comandos, secuencias) va con patrones determinísticos y lo blando necesita un juez.

## Construcción

Especificación, formatos de datos verificados, algoritmos y orden de trabajo en [BUILD_BRIEF.md](BUILD_BRIEF.md).

```bash
node --test test/          # pruebas
node scripts/stats.mjs     # estadísticas sobre tus transcripts de Cursor
```

Proyecto del Dojo AI Hackathon, Track 01 (Build for Builders).
