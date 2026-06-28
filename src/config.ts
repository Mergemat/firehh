import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { EnvMap } from "./types";

export const API_BASE_URL = "https://api.hh.ru";
export const AUTH_URL = "https://hh.ru/oauth/authorize";
export const TOKEN_URL = "https://hh.ru/oauth/token";
export const DEFAULT_REDIRECT_URI = "hhandroid://oauthresponse";
export const DEFAULT_TOKEN_FILE = join(process.cwd(), ".hh-token.json");
export const DEFAULT_SUITABLE_TEXT = "Frontend OR React OR Next.js";
export const DEVELOPER_PROFESSIONAL_ROLE_ID = "96";
export const CLI_NAME = "firehh";

const ANDROID_CLIENT_ID =
  "HIOMIAS39CA9DICTA7JIO64LQKQJF5AGIK74G9ITJKLNEDAOH5FHS5G1JI7FOEGD";
const ANDROID_CLIENT_SECRET =
  "V9M870DE342BGHFRUJ5FTCGCUA1482AN0DI8C5TFI9ULMA89H10N60NOP8I4JMVS";

export function parseEnv(content: string): EnvMap {
  const env: EnvMap = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

export async function loadLocalEnv(): Promise<EnvMap> {
  const env: EnvMap = {};

  for (const path of [".env", ".env.local"]) {
    if (!existsSync(path)) continue;
    Object.assign(env, parseEnv(await readFile(path, "utf8")));
  }

  return env;
}

export function fromEnv(env: EnvMap, key: string): string | undefined {
  return process.env[key] || env[key];
}

export function tokenFilePath(env: EnvMap): string {
  return fromEnv(env, "HH_TOKEN_FILE") || DEFAULT_TOKEN_FILE;
}

export function clientCredentials(env: EnvMap): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  source: "env" | "android";
} {
  const envClientId = fromEnv(env, "HH_CLIENT_ID");
  const envClientSecret = fromEnv(env, "HH_CLIENT_SECRET");

  if ((envClientId && !envClientSecret) || (!envClientId && envClientSecret)) {
    throw new Error(
      "HH_CLIENT_ID and HH_CLIENT_SECRET must be provided together.",
    );
  }

  const clientId = envClientId || ANDROID_CLIENT_ID;
  const clientSecret = envClientSecret || ANDROID_CLIENT_SECRET;
  const redirectUri = fromEnv(env, "HH_REDIRECT_URI") || DEFAULT_REDIRECT_URI;
  const source = envClientId && envClientSecret ? "env" : "android";

  return { clientId, clientSecret, redirectUri, source };
}
