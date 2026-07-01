import { type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { EnvMap } from "./types";
import { getAuthUrl } from "./auth";
import {
  captureRedirectFromTarget,
  waitForDevtoolsPort,
  waitForPageTarget,
  type DevtoolsTarget,
} from "./browser-auth-devtools";
import {
  cleanupBrowserProfile,
  findBrowserExecutable,
  spawnBrowser,
} from "./browser-auth-profile";

export { cleanupBrowserProfile } from "./browser-auth-profile";

export type BrowserAuthOptions = {
  env: EnvMap;
  timeoutMs: number;
  authUrl?: string;
  browserPath?: string;
  onStatus?: (message: string) => void;
  adapters?: Partial<BrowserAuthAdapters>;
};

export type BrowserAuthAdapters = {
  findBrowserExecutable: () => string | null;
  exists: (path: string) => boolean;
  makeProfileDir: () => Promise<string>;
  spawnBrowser: (browserPath: string, userDataDir: string) => ChildProcess;
  waitForDevtoolsPort: (userDataDir: string, timeoutMs: number) => Promise<number>;
  waitForPageTarget: (port: number, timeoutMs: number) => Promise<DevtoolsTarget>;
  captureRedirectFromTarget: (
    webSocketUrl: string,
    authUrl: string,
    timeoutMs: number,
  ) => Promise<string>;
  cleanupBrowserProfile: typeof cleanupBrowserProfile;
};

export async function captureAuthRedirectWithBrowser(
  options: BrowserAuthOptions,
): Promise<string> {
  const adapters = browserAuthAdapters(options.adapters);
  const browserPath = options.browserPath || adapters.findBrowserExecutable();
  if (!browserPath) {
    throw new Error(
      "Chrome or Chromium was not found. Install one or pass --browser <path>.",
    );
  }
  if (!adapters.exists(browserPath)) {
    throw new Error(`Browser executable was not found: ${browserPath}`);
  }

  const userDataDir = await adapters.makeProfileDir();
  let browser: ChildProcess | null = null;

  try {
    browser = adapters.spawnBrowser(browserPath, userDataDir);
    const port = await adapters.waitForDevtoolsPort(userDataDir, options.timeoutMs);
    const target = await adapters.waitForPageTarget(port, options.timeoutMs);

    if (!target.webSocketDebuggerUrl) {
      throw new Error("Chrome DevTools page target did not expose a websocket.");
    }

    options.onStatus?.(
      `Opened ${basename(browserPath)}. Complete HH login in the browser window.`,
    );

    return await adapters.captureRedirectFromTarget(
      target.webSocketDebuggerUrl,
      options.authUrl ?? getAuthUrl(options.env),
      options.timeoutMs,
    );
  } finally {
    await adapters.cleanupBrowserProfile({
      browser,
      userDataDir,
      onStatus: options.onStatus,
    });
  }
}

function browserAuthAdapters(
  overrides: Partial<BrowserAuthAdapters> | undefined,
): BrowserAuthAdapters {
  return {
    findBrowserExecutable,
    exists: existsSync,
    makeProfileDir: () => mkdtemp(join(tmpdir(), "firehh-auth-")),
    spawnBrowser,
    waitForDevtoolsPort,
    waitForPageTarget,
    captureRedirectFromTarget,
    cleanupBrowserProfile,
    ...overrides,
  };
}
