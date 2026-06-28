import type { CliContext } from "./types";

export type ErrorCode = "AUTH_ERROR" | "HH_ERROR" | "INPUT_ERROR";

export function writeData(context: CliContext, data: unknown): void {
  context.io.stdout(`${JSON.stringify({ ok: true, data })}\n`);
}

export function writeError(
  context: CliContext,
  code: ErrorCode,
  message: string,
): void {
  context.io.stderr(
    `${JSON.stringify({
      ok: false,
      error: {
        code,
        message,
      },
    })}\n`,
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
