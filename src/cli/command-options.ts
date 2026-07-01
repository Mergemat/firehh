import { CliError, isCliError } from "../cli-error";
import type { CommandOption } from "./commands/types";

type NumberFlagRange = {
  min?: number;
  max?: number;
};

export function inputError(message: string): CliError {
  return new CliError({ code: "INPUT_ERROR", message });
}

export function isInputError(error: unknown): boolean {
  return isCliError(error) && error.payload.code === "INPUT_ERROR";
}

export function assertKnownFlags(
  flags: Map<string, string>,
  options: readonly CommandOption[] | undefined,
  commandLabel: string,
  extraAllowedFlags: readonly string[] = [],
): void {
  const allowed = new Set(["help", "version", ...extraAllowedFlags]);

  for (const option of options ?? []) {
    allowed.add(flagKey(option.name));
  }

  for (const flag of flags.keys()) {
    if (!allowed.has(flag)) {
      throw inputError(`Unsupported flag for ${commandLabel}: --${flag}`);
    }
  }
}

export function optionalStringFlag(
  flags: Map<string, string>,
  key: string,
): string | undefined {
  const value = flags.get(key);
  return value === undefined || value === "" ? undefined : value;
}

export function requiredStringFlag(
  flags: Map<string, string>,
  key: string,
  message: string,
): string {
  const value = optionalStringFlag(flags, key);
  if (!value) throw inputError(message);
  return value;
}

export function booleanFlag(flags: Map<string, string>, key: string): boolean {
  if (!flags.has(key)) return false;

  const value = flags.get(key);
  return value !== "false" && value !== "0";
}

export function numberFlag(
  flags: Map<string, string>,
  key: string,
  fallback: number,
  range: NumberFlagRange = {},
): number {
  const value = flags.get(key);
  if (value === undefined || value === "") return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < (range.min ?? 0)) {
    throw inputError(`Invalid number for --${key}: ${value}`);
  }

  if (range.max !== undefined && parsed > range.max) {
    throw inputError(`Invalid number for --${key}: ${value}`);
  }

  return parsed;
}

export function optionalNumberFlag(
  flags: Map<string, string>,
  key: string,
): number | undefined {
  const value = flags.get(key);
  if (value === undefined || value === "") return undefined;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw inputError(`Invalid number for --${key}: ${value}`);
  }

  return parsed;
}

export function positiveSecondsFlag(
  flags: Map<string, string>,
  key: string,
  fallbackSeconds: number,
): number {
  const value = flags.get(key);
  if (!value) return fallbackSeconds * 1000;

  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw inputError(`--${key} must be a positive number of seconds.`);
  }

  return seconds * 1000;
}

export function regexFlag(
  flags: Map<string, string>,
  key: string,
): RegExp | undefined {
  const value = optionalStringFlag(flags, key);
  if (!value) return undefined;

  try {
    return new RegExp(value, "iu");
  } catch {
    throw inputError(`Invalid regex for --${key}: ${value}`);
  }
}

export function oneOfFlag<const Values extends readonly string[]>(
  flags: Map<string, string>,
  key: string,
  values: Values,
  fallback: Values[number],
): Values[number] {
  const value = flags.get(key) || fallback;
  if ((values as readonly string[]).includes(value)) return value;

  throw inputError(`Unsupported --${key}: ${value}`);
}

function flagKey(name: string): string {
  return name.startsWith("--") ? name.slice(2) : name;
}
