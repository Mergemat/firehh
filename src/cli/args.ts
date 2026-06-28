export type ParsedArgs = {
  raw: string[];
  command?: string;
  subcommand?: string;
  flags: Map<string, string>;
  positionals: string[];
};

export function parseArgs(args: string[]): ParsedArgs {
  const flags = parseFlags(args);
  const positionals = parsePositionals(args);

  return {
    raw: args,
    command: positionals[0],
    subcommand: positionals[1],
    flags,
    positionals,
  };
}

export function parseFlags(args: string[]): Map<string, string> {
  const flags = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) continue;

    const key = arg.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      flags.set(key, "");
      continue;
    }

    flags.set(key, value);
    index += 1;
  }

  return flags;
}

function parsePositionals(args: string[]): string[] {
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const value = args[index + 1];
    if (value && !value.startsWith("--")) index += 1;
  }

  return positionals;
}
