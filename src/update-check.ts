import packageJson from "../package.json";
import { fromEnv } from "./config";
import type { EnvMap } from "./types";

const REGISTRY_TIMEOUT_MS = 700;

type FetchLike = typeof fetch;

export type UpdateNotice = {
  current: string;
  latest: string;
  message: string;
};

export function shouldCheckForUpdate(args: string[], exitCode: number): boolean {
  if (args.includes("--help")) return false;
  if (args[0] === "--help") return false;
  if (args.includes("--version")) return true;

  return exitCode === 0;
}

export async function checkForUpdate(
  env: EnvMap,
  options: {
    fetch?: FetchLike;
    currentVersion?: string;
    packageName?: string;
    timeoutMs?: number;
  } = {},
): Promise<UpdateNotice | null> {
  if (fromEnv(env, "FIREHH_NO_UPDATE_CHECK")) return null;

  const fetchFn = options.fetch ?? fetch;
  const current = options.currentVersion ?? packageJson.version;
  const packageName = options.packageName ?? packageJson.name;
  const timeoutMs = options.timeoutMs ?? REGISTRY_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
      {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      },
    );
    if (!response.ok) return null;

    const data = (await response.json().catch(() => null)) as {
      version?: unknown;
    } | null;
    const latest = typeof data?.version === "string" ? data.version : null;
    if (!latest || compareVersions(current, latest) >= 0) return null;

    return {
      current,
      latest,
      message: `firehh update ${current}->${latest}: bun install -g ${packageName}`,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function writeUpdateNotice(
  env: EnvMap,
  write: (text: string) => void,
): Promise<void> {
  const notice = await checkForUpdate(env);
  if (notice) write(`${notice.message}\n`);
}

function compareVersions(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);

  for (let index = 0; index < 3; index += 1) {
    const diff = leftParts[index] - rightParts[index];
    if (diff !== 0) return diff;
  }

  return 0;
}

function versionParts(version: string): [number, number, number] {
  const [major = "0", minor = "0", patch = "0"] = version
    .replace(/^[^\d]*/, "")
    .split(/[.-]/);

  return [major, minor, patch].map((part) => Number(part) || 0) as [
    number,
    number,
    number,
  ];
}
