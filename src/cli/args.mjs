export class UsageError extends Error {}

const BOOLEAN_FLAGS = {
  "--all": ["all", true],
  "--json": ["json", true],
  "--no-write": ["write", false],
  "--save": ["save", true],
  "--dry-run": ["dryRun", true],
  "--fail-on-violations": ["failOnViolations", true],
  "--cursor": ["cursor", true],
  "--claude": ["claude", true],
  "-h": ["help", true],
  "--help": ["help", true],
  "-v": ["version", true],
  "--version": ["version", true],
};
const VALUE_FLAGS = { "--sessions-from": "sessionsFrom", "--judge": "judge" };

// Positional arguments each command accepts, in order.
export const POSITIONALS = {
  analyze: ["path"],
  report: ["path"],
  sessions: ["path"],
  suggest: ["path"],
  apply: ["id", "path"],
  undo: ["id", "path"],
  install: ["path"],
  uninstall: ["path"],
  hook: ["harness", "event"],
  jev: ["action"],
  demo: [],
  doctor: [],
};

export function parseArgs(argv) {
  const options = {
    command: null,
    all: false,
    json: false,
    write: true,
    dryRun: false,
    cursor: false,
    claude: false,
    help: false,
    version: false,
    sessionsFrom: null,
    judge: null,
    save: false,
    failOnViolations: false,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (BOOLEAN_FLAGS[arg]) {
      const [key, value] = BOOLEAN_FLAGS[arg];
      options[key] = value;
    } else if (VALUE_FLAGS[arg]) {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) throw new UsageError(`${arg} necesita un valor.`);
      options[VALUE_FLAGS[arg]] = value;
      i += 1;
    } else if (arg.startsWith("-")) {
      throw new UsageError(`Opción desconocida: ${arg}`);
    } else if (!options.command) {
      options.command = arg;
    } else {
      rest.push(arg);
    }
  }
  if (!options.command) return options;
  const names = POSITIONALS[options.command];
  if (!names) throw new UsageError(`Comando desconocido: ${options.command}. Usa "held --help".`);
  if (rest.length > names.length) throw new UsageError(`Argumento de más: ${rest[names.length]}`);
  names.forEach((name, index) => {
    options[name] = rest[index] ?? null;
  });
  if (options.judge && options.judge !== "jev") throw new UsageError(`Juez desconocido: ${options.judge}. El único es "jev".`);
  return options;
}
