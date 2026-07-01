import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  AUTH_URL,
  TOKEN_URL,
  clientCredentials,
  fromEnv,
  tokenFilePath,
} from "./config";
import type { EnvMap, TokenFile } from "./types";
import { hhResponseError } from "./hh/errors";

export type TokenSource = "env" | "file";
export type OAuthCredentials = ReturnType<typeof clientCredentials>;

export type TokenReadResult = {
  token: TokenFile;
  source: TokenSource;
  path: string | null;
};

export type TokenStore = {
  path: string;
  read: () => Promise<TokenReadResult | null>;
  save: (token: TokenFile) => Promise<TokenFile>;
};

export type TokenStoreDeps = {
  now?: () => number;
  readFile?: typeof readFile;
  writeFile?: typeof writeFile;
  mkdir?: typeof mkdir;
};

export type AuthSessionDeps = {
  authUrl?: string;
  credentials?: OAuthCredentials;
  fetch?: typeof fetch;
  now?: () => number;
  tokenStore?: TokenStore;
  tokenUrl?: string;
};

export type AuthSession = ReturnType<typeof createAuthSession>;

export function createTokenStore(
  env: EnvMap,
  deps: TokenStoreDeps = {},
): TokenStore {
  const now = deps.now ?? Date.now;
  const readFileImpl = deps.readFile ?? readFile;
  const writeFileImpl = deps.writeFile ?? writeFile;
  const mkdirImpl = deps.mkdir ?? mkdir;
  const path = tokenFilePath(env);

  return {
    path,
    read: async () => {
      const rawToken =
        fromEnv(env, "HH_ACCESS_TOKEN") || fromEnv(env, "HH_TOKEN") || null;

      if (rawToken) {
        try {
          return {
            token: JSON.parse(rawToken) as TokenFile,
            source: "env",
            path: null,
          };
        } catch {
          return { token: { access_token: rawToken }, source: "env", path: null };
        }
      }

      try {
        return {
          token: JSON.parse(await readFileImpl(path, "utf8")) as TokenFile,
          source: "file",
          path,
        };
      } catch {
        return null;
      }
    },
    save: async (token) => {
      const expiresIn = token.expires_in ?? 0;
      const tokenWithExpiry: TokenFile = {
        ...token,
        expires_at: token.expires_at ?? now() + expiresIn * 1000,
      };

      await mkdirImpl(dirname(path), { recursive: true });
      await writeFileImpl(path, `${JSON.stringify(tokenWithExpiry, null, 2)}\n`, {
        mode: 0o600,
      });

      return tokenWithExpiry;
    },
  };
}

export function createAuthSession(
  env: EnvMap,
  deps: AuthSessionDeps = {},
) {
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const tokenStore = deps.tokenStore ?? createTokenStore(env, { now });
  const credentials = deps.credentials ?? clientCredentials(env);
  const authUrl = deps.authUrl ?? AUTH_URL;
  const tokenUrl = deps.tokenUrl ?? TOKEN_URL;

  return {
    tokenStore,
    getAuthUrl: () => authUrlForCredentials(credentials, authUrl),
    readTokenWithSource: () => tokenStore.read(),
    readToken: async () => (await tokenStore.read())?.token ?? null,
    saveToken: (token: TokenFile) => tokenStore.save(token),
    exchangeCodeForToken: async (codeOrUrl: string) => {
      const { clientId, clientSecret, redirectUri } = credentials;
      return postTokenForm({
        fetchImpl,
        tokenStore,
        tokenUrl,
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          code: extractCode(codeOrUrl),
          redirect_uri: redirectUri,
        }),
      });
    },
    refreshToken: async (token: TokenFile) => {
      if (!token.refresh_token) {
        throw new Error("Token is expired and has no refresh_token.");
      }

      const { clientId, clientSecret } = credentials;
      return postTokenForm({
        fetchImpl,
        tokenStore,
        tokenUrl,
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: token.refresh_token,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
    },
    getValidToken: async () => {
      const token = (await tokenStore.read())?.token ?? null;
      if (!token?.access_token) return null;

      if (!token.expires_at || now() < token.expires_at - 5 * 60 * 1000) {
        return token;
      }

      return createAuthSession(env, {
        ...deps,
        tokenStore,
        fetch: fetchImpl,
        now,
        authUrl,
        credentials,
        tokenUrl,
      }).refreshToken(token);
    },
    requireValidToken: async () => {
      const token = await createAuthSession(env, {
        ...deps,
        tokenStore,
        fetch: fetchImpl,
        now,
        authUrl,
        credentials,
        tokenUrl,
      }).getValidToken();

      if (!token?.access_token) {
        throw new Error(
          [
            "No HH OAuth token found.",
            "Run: firehh auth login",
          ].join("\n"),
        );
      }

      return token;
    },
  };
}

export function getAuthUrl(env: EnvMap): string {
  return authUrlForCredentials(clientCredentials(env), AUTH_URL);
}

function authUrlForCredentials(
  credentials: Pick<OAuthCredentials, "clientId" | "redirectUri">,
  authUrl: string,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: credentials.clientId,
    redirect_uri: credentials.redirectUri,
  });

  return `${authUrl}?${params.toString()}`;
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

export async function readTokenWithSource(
  env: EnvMap,
): Promise<TokenReadResult | null> {
  return createAuthSession(env).readTokenWithSource();
}

export async function readToken(env: EnvMap): Promise<TokenFile | null> {
  return createAuthSession(env).readToken();
}

export async function saveToken(
  env: EnvMap,
  token: TokenFile,
): Promise<TokenFile> {
  return createAuthSession(env).saveToken(token);
}

export async function exchangeCodeForToken(
  env: EnvMap,
  codeOrUrl: string,
): Promise<TokenFile> {
  return createAuthSession(env).exchangeCodeForToken(codeOrUrl);
}

export async function refreshToken(
  env: EnvMap,
  token: TokenFile,
): Promise<TokenFile> {
  return createAuthSession(env).refreshToken(token);
}

export async function getValidToken(env: EnvMap): Promise<TokenFile | null> {
  return createAuthSession(env).getValidToken();
}

export async function requireValidToken(env: EnvMap): Promise<TokenFile> {
  return createAuthSession(env).requireValidToken();
}

async function postTokenForm(options: {
  fetchImpl: typeof fetch;
  tokenStore: TokenStore;
  tokenUrl: string;
  body: URLSearchParams;
}): Promise<TokenFile> {
  const response = await options.fetchImpl(options.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: options.body,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw hhResponseError(response.status, data);
  }

  return options.tokenStore.save(data as TokenFile);
}
