import { API_BASE_URL } from "../config";
import { requireValidToken } from "../auth";
import type { EnvMap, TokenFile } from "../types";
import { hhResponseError } from "./errors";

export type HeadHunterClientOptions = {
  env: EnvMap;
  baseUrl?: string;
  fetch?: typeof fetch;
  tokenProvider?: () => Promise<TokenFile>;
};

export type HeadHunterClient = ReturnType<typeof createHeadHunterClient>;

export function createHeadHunterClient(options: HeadHunterClientOptions) {
  const baseUrl = options.baseUrl ?? API_BASE_URL;
  const fetchImpl = options.fetch ?? fetch;
  const tokenProvider =
    options.tokenProvider ?? (() => requireValidToken(options.env));

  return {
    fetch: async (path: string, init: RequestInit = {}): Promise<Response> => {
      const token = await tokenProvider();
      const headers = new Headers(init.headers);

      headers.set("Accept", "application/json");
      headers.set("Authorization", `Bearer ${token.access_token}`);
      headers.set("User-Agent", "firehh/0.1");
      headers.set("HH-User-Agent", "firehh/0.1");

      return fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers,
      });
    },
    json: async <T>(path: string, init: RequestInit = {}): Promise<T> => {
      const response = await createHeadHunterClient({
        ...options,
        baseUrl,
        fetch: fetchImpl,
        tokenProvider,
      }).fetch(path, init);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw hhResponseError(response.status, data);
      }

      return data as T;
    },
  };
}

export async function hhFetch(
  env: EnvMap,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return createHeadHunterClient({ env }).fetch(path, init);
}

export async function hhJson<T>(
  env: EnvMap,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return createHeadHunterClient({ env }).json<T>(path, init);
}
