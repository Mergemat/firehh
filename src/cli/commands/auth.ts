import { captureAuthRedirectWithBrowser } from "../../browser-auth";
import { exchangeCodeForToken, readTokenWithSource } from "../../auth";
import { clientCredentials, tokenFilePath } from "../../config";
import {
  assertKnownFlags,
  isInputError,
  positiveSecondsFlag,
} from "../command-options";
import { writeData, writeError } from "../output";
import type { CommandSpec } from "./types";
import { legacy, scoped } from "./shared";

export const authLoginCommand: CommandSpec = {
  id: "auth.login",
  usage: "auth login [--timeout <seconds>] [--browser <path>]",
  help: {
    summary: "Authorize HH OAuth in Chromium and save a global token",
    description:
      "Starts Chrome or Chromium, captures the hhandroid:// OAuth redirect through DevTools, exchanges it, and stores the token.",
    options: [
      {
        name: "--browser",
        value: "<path>",
        summary: "Chrome or Chromium executable path",
      },
      {
        name: "--timeout",
        value: "<seconds>",
        summary: "Browser redirect capture timeout",
        defaultValue: "180",
      },
    ],
    examples: [
      {
        command: "firehh auth login",
        summary: "Browser-assisted OAuth capture",
      },
    ],
  },
  matches: (parsed) => scoped(parsed, "auth", "login"),
  run: async ({ parsed, context }) => {
    try {
      assertKnownFlags(parsed.flags, authLoginCommand.help.options, "auth login");
      const credentials = clientCredentials(context.env);
      context.io.stderr(
        [
          "HH OAuth login",
          `Credential source: ${credentials.source}`,
          `Redirect URI: ${credentials.redirectUri}`,
          "",
        ].join("\n"),
      );
      const redirectUrl = await captureAuthRedirectWithBrowser({
        env: context.env,
        timeoutMs: positiveSecondsFlag(parsed.flags, "timeout", 180),
        browserPath: parsed.flags.get("browser") || undefined,
        onStatus: (message) => context.io.stderr(`${message}\n`),
      });
      const token = await exchangeCodeForToken(context.env, redirectUrl);

      writeData(context, {
        token_file: tokenFilePath(context.env),
        expires_at: token.expires_at
          ? new Date(token.expires_at).toISOString()
          : null,
        credential_source: credentials.source,
        auth_flow: "browser",
      });
      return 0;
    } catch (error) {
      const input = isInputError(error);
      writeError(context, input ? "INPUT_ERROR" : "AUTH_ERROR", error);
      return input ? 1 : 2;
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
  run: async ({ parsed, context }) => {
    try {
      assertKnownFlags(parsed.flags, authStatusCommand.help.options, "auth status");
      const result = await readTokenWithSource(context.env);
      const token = result?.token ?? null;
      writeData(context, {
        token_file: tokenFilePath(context.env),
        token_source: result?.source ?? "missing",
        token_source_file: result?.path ?? null,
        access_token: token?.access_token ? "present" : "missing",
        refresh_token: token?.refresh_token ? "present" : "missing",
        expires_at: token?.expires_at
          ? new Date(token.expires_at).toISOString()
          : null,
      });
      return 0;
    } catch (error) {
      const input = isInputError(error);
      writeError(context, input ? "INPUT_ERROR" : "AUTH_ERROR", error);
      return input ? 1 : 2;
    }
  },
};
