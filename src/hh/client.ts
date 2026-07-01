import { API_BASE_URL } from "../config";
import { requireValidToken } from "../auth";
import type { EnvMap } from "../types";
import { hhResponseError } from "./errors";

export async function hhFetch(
  env: EnvMap,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await requireValidToken(env);
  const headers = new Headers(init.headers);

  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token.access_token}`);
  headers.set("User-Agent", "firehh/0.1");
  headers.set("HH-User-Agent", "firehh/0.1");

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
}

export async function hhJson<T>(
  env: EnvMap,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await hhFetch(env, path, init);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw hhResponseError(response.status, data);
  }

  return data as T;
}
