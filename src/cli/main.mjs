import { readFileSync } from "node:fs";
import { FielError } from "../analyze.mjs";
import { parseArgs, UsageError } from "./args.mjs";
import {
  analyzeCommand,
  applyCommand,
  demoCommand,
  doctorCommand,
  hookCommand,
  installCommand,
  jevCommand,
  sessionsCommand,
  suggestCommand,
  undoCommand,
} from "./commands.mjs";

const { version } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

const HELP = `fiel ${version}: mide si tu agente (Cursor o Claude Code) cumple tus instrucciones y conserva las que le das en el chat.

Empieza aquí:
  fiel demo                      Corre todo sobre un repo de ejemplo incluido (no necesita tu historial)
  fiel doctor                    Revisa Node, sesiones de Cursor y Claude Code, reglas, git y Jev

Medir:
  fiel analyze [ruta]            Cumplimiento por regla de AGENTS.md, CLAUDE.md y .cursor/rules, con evidencia
  fiel analyze --all             Todos los proyectos con sesiones en disco
  fiel report [ruta]             analyze + delta desde la última corrida + automatizaciones
  fiel sessions [ruta]           Lista sesiones en disco con harness, fecha y violaciones

Actuar (solo escribe en .fiel/):
  fiel suggest [ruta]            Propone hechos para reinyectar (usa --save para escribir en disco)
  fiel apply <id> [ruta]         Aplica una propuesta
  fiel undo <id> [ruta]          La deshace
  fiel install [ruta]            Hooks de Cursor y Claude Code que inyectan esos hechos
                                 y conservan tus instrucciones del chat al compactar
  fiel uninstall [ruta]          Quita solo los hooks de Fiel

Juez opcional (Jev, modelo local en CPU):
  fiel jev status                ¿Responde? ¿Qué tareas pasaron la compuerta?
  fiel jev gate                  Mide Jev con 48 casos etiquetados y enciende solo lo que pasa
  fiel analyze --judge jev       Agrega hallazgos probabilísticos, separados de los determinísticos

Opciones:
  --json                         Salida estructurada
  --fail-on-violations           sale con código 1 si hay violaciones (útil en CI)
  --no-write                     No escribe nada en .fiel/
  --save                         suggest: guarda propuestas en .fiel/automations.json
  --dry-run                      install/uninstall: muestra el JSON sin escribir
  --cursor, --claude             install/uninstall: solo ese harness (por defecto, los dos)
  --sessions-from <ruta>         Usa las sesiones de otra ruta (si moviste el proyecto)
  -h, --help / -v, --version

Nunca modifica AGENTS.md, CLAUDE.md ni .cursor/rules/.`;

const COMMANDS = {
  analyze: analyzeCommand,
  report: analyzeCommand,
  suggest: suggestCommand,
  apply: applyCommand,
  undo: undoCommand,
  install: installCommand,
  uninstall: installCommand,
  hook: hookCommand,
  jev: jevCommand,
  doctor: doctorCommand,
  demo: demoCommand,
  sessions: sessionsCommand,
};

export async function main(argv) {
  try {
    const options = parseArgs(argv);
    if (options.version) return console.log(version);
    if (options.help || !options.command) return console.log(HELP);
    await COMMANDS[options.command](options, { version });
  } catch (error) {
    const known = error instanceof FielError || error instanceof UsageError;
    const detail = known ? error.message : process.env.FIEL_DEBUG ? error.stack ?? error : error.message;
    console.error(`fiel: ${known ? detail : `error inesperado: ${detail}`}`);
    process.exitCode = 1;
  }
}
