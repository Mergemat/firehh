import { CliError } from "../cli-error";

type HhErrorBody = {
  error?: unknown;
  error_description?: unknown;
  message?: unknown;
  type?: unknown;
  captcha_url?: unknown;
  errors?: unknown;
};

type HhErrorItem = {
  value?: unknown;
  message?: unknown;
  type?: unknown;
  captcha_url?: unknown;
};

export function hhResponseError(status: number, data: unknown): CliError {
  const body = asObject(data) as HhErrorBody | null;
  const item = firstHhError(body?.errors);
  const captchaUrl = firstString(item?.captcha_url, body?.captcha_url);
  const kind = firstString(item?.type, item?.value, body?.type, body?.error);

  if (captchaUrl || kind === "captcha_required") {
    return new CliError({
      code: "captcha",
      message: "open captcha_url solve retry",
      ...(captchaUrl ? { captcha_url: captchaUrl } : {}),
    });
  }

  return new CliError({
    code: `hh_${status}`,
    message:
      firstString(
        item?.message,
        item?.value,
        body?.error_description,
        body?.message,
        body?.error,
        kind,
      ) ?? "error",
  });
}

export function directResponseError(url: string | null): CliError {
  return new CliError({
    code: "direct_response",
    message: "open url apply manually",
    ...(url ? { url } : {}),
  });
}

function firstHhError(errors: unknown): HhErrorItem | null {
  if (!Array.isArray(errors)) return null;
  return (asObject(errors[0]) as HhErrorItem | null) ?? null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim().replace(/\s+/g, " ");
    if (normalized) return normalized.slice(0, 160);
  }

  return null;
}
