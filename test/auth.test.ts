import { describe, expect, test } from "bun:test";
import {
  createAuthSession,
  createTokenStore,
  extractCode,
  type TokenStore,
} from "../src/auth";
import type { TokenFile } from "../src/types";

describe("auth session", () => {
  test("refreshes expired tokens through injected fetch and token store", async () => {
    const now = 10_000_000;
    let storedToken: TokenFile = {
      access_token: "old-token",
      refresh_token: "refresh-token",
      expires_at: now - 1,
    };
    const savedTokens: TokenFile[] = [];
    let requestedBody: string | null = null;

    const tokenStore: TokenStore = {
      path: "/tmp/firehh-token.json",
      read: async () => ({
        token: storedToken,
        source: "file",
        path: "/tmp/firehh-token.json",
      }),
      save: async (token) => {
        const saved = {
          ...token,
          expires_at: token.expires_at ?? now + (token.expires_in ?? 0) * 1000,
        };
        savedTokens.push(saved);
        storedToken = saved;
        return saved;
      },
    };

    const session = createAuthSession(
      {
        HH_CLIENT_ID: "client-id",
        HH_CLIENT_SECRET: "client-secret",
      },
      {
        credentials: {
          clientId: "client-id",
          clientSecret: "client-secret",
          redirectUri: "hhandroid://oauthresponse",
          source: "env",
        },
        now: () => now,
        tokenUrl: "https://hh.test/oauth/token",
        tokenStore,
        fetch: async (_input, init) => {
          requestedBody = String(init?.body);
          return new Response(
            JSON.stringify({
              access_token: "new-token",
              refresh_token: "new-refresh",
              expires_in: 3600,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        },
      },
    );

    const token = await session.getValidToken();

    expect(token?.access_token).toBe("new-token");
    expect(savedTokens).toHaveLength(1);
    expect(savedTokens[0]).toMatchObject({
      access_token: "new-token",
      refresh_token: "new-refresh",
      expires_at: now + 3600 * 1000,
    });
    expect([...new URLSearchParams(requestedBody ?? "").entries()]).toEqual([
      ["grant_type", "refresh_token"],
      ["refresh_token", "refresh-token"],
      ["client_id", "client-id"],
      ["client_secret", "client-secret"],
    ]);
  });

  test("token store reads env tokens before file tokens", async () => {
    const store = createTokenStore(
      {
        HH_TOKEN_FILE: "/tmp/ignored-firehh-token.json",
        HH_ACCESS_TOKEN: JSON.stringify({ access_token: "env-token" }),
      },
      {
        readFile: async () => {
          throw new Error("file should not be read");
        },
      },
    );

    await expect(store.read()).resolves.toEqual({
      token: { access_token: "env-token" },
      source: "env",
      path: null,
    });
  });

  test("token store adds expiry when saving file tokens", async () => {
    let writtenPath = "";
    let writtenBody = "";
    let writtenMode: number | undefined;

    const store = createTokenStore(
      { HH_TOKEN_FILE: "/tmp/firehh-token.json" },
      {
        now: () => 1000,
        mkdir: async () => undefined,
        writeFile: async (path, body, options) => {
          writtenPath = String(path);
          writtenBody = String(body);
          writtenMode =
            typeof options === "object" && options !== null
              ? options.mode
              : undefined;
        },
      },
    );

    const token = await store.save({
      access_token: "saved-token",
      expires_in: 2,
    });

    expect(token.expires_at).toBe(3000);
    expect(writtenPath).toBe("/tmp/firehh-token.json");
    expect(JSON.parse(writtenBody)).toEqual(token);
    expect(writtenMode).toBe(0o600);
  });

  test("extracts OAuth code from raw code or redirect URL", () => {
    expect(extractCode("plain-code")).toBe("plain-code");
    expect(extractCode("hhandroid://oauthresponse?code=url-code")).toBe(
      "url-code",
    );
  });
});
