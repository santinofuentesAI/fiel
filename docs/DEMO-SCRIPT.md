# Demo Held · 90–120 s · Hyperframes + ElevenLabs

Sin npm. Desde el repo:

```bash
cd "/home/santinofl/Proyectos/Dojo Hackahton AI"
node bin/held.mjs demo
```

La API de ElevenLabs y Hyperframes (Higgsfield) las conectamos cuando las pases. Este es el guion, los zooms y los subtítulos.

## Voz (ElevenLabs)

Tono: claro, cercano, sin marketing hueco. Español de Costa Rica, no apurado.

**VO 1 · 0–12 s**
Le escribís reglas a tu agente. Él te dice que sí. Después el chat se compacta… y hace lo contrario.

**VO 2 · 12–28 s**
AGENTS.md se reenvía. Lo que pediste en el chat, no. Nadie te avisa. Held abre las sesiones que ya tenés en disco y te muestra el comando.

**VO 3 · 28–55 s**
Mirá: acá el agente usó `node --test` en vez de `npm test`. Y esta instrucción —«no toques scripts/db-reset.mjs»— desapareció del resumen cuando Claude compactó. Held la marcó como perdida.

**VO 4 · 55–80 s**
Un comando, `held onboard`, aplica los pins y deja los hooks. La próxima vez que compacte, se la vuelve a poner. No es más memoria. No es un MCP. Es la caja negra.

**VO 5 · 80–100 s**
Correrlo es esto. Local. Cero dependencias. Tu historial no sale de la máquina.

```text
node bin/held.mjs demo
```

## Hyperframes · planos y zoom

| t | Plano | Zoom / recorte | Subtítulo |
|---|---|---|---|
| 0–8 | Terminal + `AGENTS.md` abierto | Wide | Le escribís las reglas. El agente dice que sí. |
| 8–16 | Chat: “no toques scripts/db-reset.mjs” | Zoom al mensaje | Después compacta. |
| 16–28 | Fade / el mensaje se pierde | Zoom al resumen vacío | Tu instrucción desaparece. |
| 28–40 | `node bin/held.mjs demo` | Wide, cursor grande | Held abre las sesiones de tu disco. |
| 40–55 | Bloque Violaciones | Zoom a `node --test` | El comando que rompió la regla. |
| 55–70 | Bloque Compactación | Zoom a «perdidas 1» y la cita | Lo que el resumen olvidó. |
| 70–85 | Texto del hook PreCompact | Zoom a la reinyección | Se la vuelve a poner. |
| 85–100 | `held onboard` | Wide | Un comando. Listo para el día a día. |
| 100–110 | Logo Held | Logo full | Dile adiós al problema de contexto. |

## Subtítulos (burn-in)

Líneas cortas, una a la vez, abajo:

1. El agente te dice que sí.
2. El harness compacta.
3. Tu instrucción desaparece.
4. Held abre el transcript.
5. Te muestra el comando.
6. Te muestra lo que se olvidó.
7. Se lo devuelve al agente.
8. CLI local. Cero dependencias.

## Día a día (si el video llega a 2–3 min)

Después de la demo:

1. En tu repo: `held onboard`
2. Al otro día: `held report` — qué cambió
3. CI: el workflow de `examples/github-action.yml` en un runner self-hosted
4. Held nunca edita `AGENTS.md`
