import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AUTH_URL, TOKEN_URL, clientCredentials, fromEnv, tokenFilePath } from "./config";
import type { EnvMap, TokenFile } from "./types";

export async function readToken(env: EnvMap): Promise<TokenFile | null> {
  const rawToken =
    fromEnv(env, "HH_ACCESS_TOKEN") || fromEnv(env, "HH_TOKEN") || null;

  if (rawToken) {
    try {
      return JSON.parse(rawToken) as TokenFile;
    } catch {
      return { access_token: rawToken };
    }
  }

  try {
    return JSON.parse(await readFile(tokenFilePath(env), "utf8")) as TokenFile;
  } catch {
    return null;
  }
}

export async function saveToken(
  env: EnvMap,
  token: TokenFile,
): Promise<TokenFile> {
  const expiresIn = token.expires_in ?? 0;
  const tokenWithExpiry: TokenFile = {
    ...token,
    expires_at: token.expires_at ?? Date.now() + expiresIn * 1000,
  };

  const path = tokenFilePath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(tokenWithExpiry, null, 2)}\n`, {
    mode: 0o600,
  });

  return tokenWithExpiry;
}

export function getAuthUrl(env: EnvMap): string {
  const { clientId, redirectUri } = clientCredentials(env);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
  });

  return `${AUTH_URL}?${params.toString()}`;
}

export function extractCode(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.includes("://") && !trimmed.includes("?")) {
    return trimmed;
  }

  const url = new URL(trimmed);
  const code = url.searchParams.get("code");

  if (!code) {
    throw new Error("Redirect URL does not contain ?code=...");
  }

  return code;
}

export async function exchangeCodeForToken(
  env: EnvMap,
  codeOrUrl: string,
): Promise<TokenFile> {
  const { clientId, clientSecret, redirectUri } = clientCredentials(env);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code: extractCode(codeOrUrl),
      redirect_uri: redirectUri,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `HH token exchange error ${response.status}: ${JSON.stringify(data ?? {})}`,
    );
  }

  return saveToken(env, data as TokenFile);
}

export async function refreshToken(
  env: EnvMap,
  token: TokenFile,
): Promise<TokenFile> {
  if (!token.refresh_token) {
    throw new Error("Token is expired and has no refresh_token.");
  }

  const { clientId, clientSecret } = clientCredentials(env);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `HH token refresh error ${response.status}: ${JSON.stringify(data ?? {})}`,
    );
  }

  return saveToken(env, data as TokenFile);
}

export async function getValidToken(env: EnvMap): Promise<TokenFile | null> {
  const token = await readToken(env);
  if (!token?.access_token) return null;

  if (!token.expires_at || Date.now() < token.expires_at - 5 * 60 * 1000) {
    return token;
  }

  return refreshToken(env, token);
}

export async function requireValidToken(env: EnvMap): Promise<TokenFile> {
  const token = await getValidToken(env);

  if (!token?.access_token) {
    throw new Error(
      [
        "No HH OAuth token found.",
        "Run: firehh auth login",
        "Or use: firehh auth url, then firehh auth code '<code-or-redirect-url>'",
      ].join("\n"),
    );
  }

  return token;
}
