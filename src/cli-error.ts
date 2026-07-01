export type CliErrorPayload = {
  code: string;
  message: string;
  [key: string]: string | number | boolean | null;
};

export class CliError extends Error {
  readonly payload: CliErrorPayload;

  constructor(payload: CliErrorPayload) {
    super(payload.message);
    this.name = "CliError";
    this.payload = payload;
  }
}

export function isCliError(error: unknown): error is CliError {
  return error instanceof CliError;
}
