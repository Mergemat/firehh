import type { CliContext } from "./types";
import { isCliError, type CliErrorPayload } from "../cli-error";

export type ErrorCode = "AUTH_ERROR" | "HH_ERROR" | "INPUT_ERROR";

export function writeData(context: CliContext, data: unknown): void {
  context.io.stdout(`${JSON.stringify({ ok: true, data })}\n`);
}

export function writeError(
  context: CliContext,
  code: ErrorCode,
  error: unknown,
): void {
  context.io.stderr(
    `${JSON.stringify({
      ok: false,
      error: errorPayload(code, error),
    })}\n`,
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorPayload(code: ErrorCode, error: unknown): CliErrorPayload {
  if (isCliError(error)) return error.payload;

  return {
    code,
    message: errorMessage(error),
  };
}
