import {
  exchangeCodeForToken,
  getAuthUrl,
  readToken,
} from "../../auth";
import { clientCredentials, tokenFilePath } from "../../config";
import { errorMessage, writeData, writeError } from "../output";
import type { CommandSpec } from "./types";
import { legacy, scoped } from "./shared";

export const authLoginCommand: CommandSpec = {
  id: "auth.login",
  usage: "auth login [--code <code-or-redirect-url>]",
  help: {
    summary: "Open HH OAuth and save a local token",
    description:
      "Prints the HH OAuth URL, prompts for the redirect URL or code, exchanges it, and stores the token.",
    options: [
      {
        name: "--code",
        value: "<code-or-redirect-url>",
        summary: "Skip the prompt and exchange this code immediately",
      },
    ],
    aliases: ["auth-url", "auth-code <code-or-redirect-url>"],
    examples: [
      { command: "firehh auth login", summary: "Interactive browser flow" },
      {
        command: "firehh auth login --code 'hhandroid://oauthresponse?code=...'",
        summary: "Exchange a copied redirect URL directly",
      },
    ],
  },
  matches: (parsed) => scoped(parsed, "auth", "login"),
  run: async ({ parsed, context }) => {
    try {
      const authUrl = getAuthUrl(context.env);
      const credentials = clientCredentials(context.env);
      const codeOrUrl =
        parsed.flags.get("code") ||
        (await promptForCode(context, authUrl, credentials.source));
      const token = await exchangeCodeForToken(context.env, codeOrUrl);

      writeData(context, {
        token_file: tokenFilePath(context.env),
        expires_at: token.expires_at
          ? new Date(token.expires_at).toISOString()
          : null,
        credential_source: credentials.source,
      });
      return 0;
    } catch (error) {
      writeError(context, "AUTH_ERROR", errorMessage(error));
      return 2;
    }
  },
};

export const authUrlCommand: CommandSpec = {
  id: "auth.url",
  usage: "auth url",
  help: {
    summary: "Print the HH OAuth URL",
    description:
      "Returns the authorization URL using built-in Android credentials unless env credentials override them.",
    aliases: ["auth-url"],
    examples: [{ command: "firehh auth url" }],
  },
  matches: (parsed) => scoped(parsed, "auth", "url") || legacy(parsed, "auth-url"),
  run: async ({ context }) => {
    try {
      const credentials = clientCredentials(context.env);
      writeData(context, {
        url: getAuthUrl(context.env),
        redirect_uri: credentials.redirectUri,
        credential_source: credentials.source,
      });
      return 0;
    } catch (error) {
      writeError(context, "AUTH_ERROR", errorMessage(error));
      return 2;
    }
  },
};

export const authCodeCommand: CommandSpec = {
  id: "auth.code",
  usage: "auth code <code-or-redirect-url>",
  help: {
    summary: "Exchange an HH OAuth code for a stored token",
    description:
      "Accepts either a raw code or the full hhandroid:// redirect URL from HH.",
    aliases: ["auth-code <code-or-redirect-url>"],
    examples: [
      {
        command: "firehh auth code 'hhandroid://oauthresponse?code=...'",
      },
    ],
  },
  matches: (parsed) => scoped(parsed, "auth", "code") || legacy(parsed, "auth-code"),
  run: async ({ parsed, context }) => {
    const codeOrUrl =
      parsed.command === "auth-code" ? parsed.positionals[1] : parsed.positionals[2];
    if (!codeOrUrl) {
      writeError(context, "INPUT_ERROR", "Usage: firehh auth code <code-or-url>");
      return 1;
    }

    try {
      const token = await exchangeCodeForToken(context.env, codeOrUrl);
      writeData(context, {
        token_file: tokenFilePath(context.env),
        expires_at: token.expires_at
          ? new Date(token.expires_at).toISOString()
          : null,
      });
      return 0;
    } catch (error) {
      writeError(context, "AUTH_ERROR", errorMessage(error));
      return 2;
    }
  },
};

export const authStatusCommand: CommandSpec = {
  id: "auth.status",
  usage: "auth status",
  help: {
    summary: "Show local HH token status",
    description:
      "Checks the configured token file or token env var without printing secret token values.",
    aliases: ["token"],
    examples: [{ command: "firehh auth status" }],
  },
  matches: (parsed) => scoped(parsed, "auth", "status") || legacy(parsed, "token"),
  run: async ({ context }) => {
    try {
      const token = await readToken(context.env);
      writeData(context, {
        token_file: tokenFilePath(context.env),
        access_token: token?.access_token ? "present" : "missing",
        refresh_token: token?.refresh_token ? "present" : "missing",
        expires_at: token?.expires_at
          ? new Date(token.expires_at).toISOString()
          : null,
      });
      return 0;
    } catch (error) {
      writeError(context, "AUTH_ERROR", errorMessage(error));
      return 2;
    }
  },
};

async function promptForCode(
  context: Parameters<CommandSpec["run"]>[0]["context"],
  authUrl: string,
  credentialSource: "env" | "android",
): Promise<string> {
  context.io.stderr(
    [
      "HH OAuth login",
      `Credential source: ${credentialSource}`,
      "",
      "1. Open this URL:",
      authUrl,
      "",
      "2. Approve access in HH.",
      "3. Paste the final redirect URL or just the code below.",
      "",
    ].join("\n"),
  );

  return context.io.question("HH code or redirect URL: ");
}
