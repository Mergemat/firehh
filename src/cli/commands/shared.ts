import type { ParsedArgs } from "../args";

export function scoped(
  parsed: ParsedArgs,
  scope: string,
  subcommand: string,
): boolean {
  return parsed.command === scope && parsed.subcommand === subcommand;
}

export function legacy(parsed: ParsedArgs, command: string): boolean {
  return parsed.command === command;
}

export function positionalAfter(
  parsed: ParsedArgs,
  scopedOffset: number,
  legacyOffset: number,
): string | undefined {
  return parsed.positionals[scopedOffset] ?? parsed.positionals[legacyOffset];
}
