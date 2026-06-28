import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { EnvMap } from "./types";
import { getAuthUrl } from "./auth";

const REDIRECT_PREFIX = "hhandroid://oauthresponse";

export type BrowserAuthOptions = {
  env: EnvMap;
  timeoutMs: number;
  browserPath?: string;
  onStatus?: (message: string) => void;
};

type DevtoolsTarget = {
  type?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
};

type DevtoolsMessage = {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

export async function captureAuthRedirectWithBrowser(
  options: BrowserAuthOptions,
): Promise<string> {
  const browserPath = options.browserPath || findBrowserExecutable();
  if (!browserPath) {
    throw new Error(
      "Chrome or Chromium was not found. Install one or pass --browser <path>.",
    );
  }
  if (!existsSync(browserPath)) {
    throw new Error(`Browser executable was not found: ${browserPath}`);
  }

  const userDataDir = await mkdtemp(join(tmpdir(), "firehh-auth-"));
  let browser: ChildProcess | null = null;

  try {
    browser = spawnBrowser(browserPath, userDataDir);
    const port = await waitForDevtoolsPort(userDataDir, options.timeoutMs);
    const target = await waitForPageTarget(port, options.timeoutMs);

    if (!target.webSocketDebuggerUrl) {
      throw new Error("Chrome DevTools page target did not expose a websocket.");
    }

    options.onStatus?.(
      `Opened ${basename(browserPath)}. Complete HH login in the browser window.`,
    );

    return await captureRedirectFromTarget(
      target.webSocketDebuggerUrl,
      getAuthUrl(options.env),
      options.timeoutMs,
    );
  } finally {
    browser?.kill();
    await rm(userDataDir, { force: true, recursive: true });
  }
}

function spawnBrowser(browserPath: string, userDataDir: string): ChildProcess {
  const browser = spawn(
    browserPath,
    [
      "--new-window",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      "--remote-allow-origins=*",
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  browser.on("error", () => {
    // The login flow reports startup failure through DevTools readiness timeout.
  });
  return browser;
}

function findBrowserExecutable(): string | null {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function waitForDevtoolsPort(
  userDataDir: string,
  timeoutMs: number,
): Promise<number> {
  const file = join(userDataDir, "DevToolsActivePort");
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const [port] = (await readFile(file, "utf8")).trim().split(/\r?\n/);
      const parsed = Number(port);
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    } catch {
      // Chrome writes this file after startup.
    }

    await sleep(100);
  }

  throw new Error("Timed out waiting for Chrome DevTools to start.");
}

async function waitForPageTarget(
  port: number,
  timeoutMs: number,
): Promise<DevtoolsTarget> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const targets = await fetchJson<DevtoolsTarget[]>(
      `http://127.0.0.1:${port}/json/list`,
    ).catch(() => []);
    const target = targets.find(
      (candidate) =>
        candidate.type === "page" && candidate.webSocketDebuggerUrl,
    );

    if (target) return target;
    await sleep(100);
  }

  throw new Error("Timed out waiting for Chrome DevTools page target.");
}

async function captureRedirectFromTarget(
  webSocketUrl: string,
  authUrl: string,
  timeoutMs: number,
): Promise<string> {
  const socket = await openWebSocket(webSocketUrl);
  let nextId = 1;
  const pending = new Map<
    number,
    {
      resolve: (message: DevtoolsMessage) => void;
      reject: (error: Error) => void;
    }
  >();

  const send = (method: string, params?: unknown): Promise<DevtoolsMessage> => {
    const id = nextId;
    nextId += 1;
    socket.send(JSON.stringify({ id, method, params }));

    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      finish(new Error("Timed out waiting for HH OAuth redirect."));
    }, timeoutMs);

    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as DevtoolsMessage;
      if (message.id !== undefined) {
        const handler = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) {
          handler?.reject(new Error(JSON.stringify(message.error)));
        } else {
          handler?.resolve(message);
        }
      }

      const redirectUrl = findRedirectUrl(message);
      if (redirectUrl) finish(null, redirectUrl);
    };

    socket.onerror = () => finish(new Error("Chrome DevTools websocket failed."));
    socket.onclose = () => {
      if (!settled) finish(new Error("Chrome DevTools websocket closed."));
    };

    void (async () => {
      try {
        await send("Page.enable");
        await send("Network.enable");
        await send("Page.navigate", { url: authUrl });
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    })();

    function finish(error: Error | null, redirectUrl?: string): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      pending.forEach(({ reject: rejectPending }) =>
        rejectPending(new Error("Chrome DevTools session ended.")),
      );
      pending.clear();

      if (error) {
        reject(error);
        return;
      }

      resolve(redirectUrl as string);
    }
  });
}

function openWebSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);

  return new Promise((resolve, reject) => {
    socket.onopen = () => resolve(socket);
    socket.onerror = () => reject(new Error("Could not connect to Chrome DevTools."));
  });
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  return (await response.json()) as T;
}

function findRedirectUrl(value: unknown): string | null {
  if (typeof value === "string") {
    return value.startsWith(REDIRECT_PREFIX) ? value : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRedirectUrl(item);
      if (found) return found;
    }
    return null;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const found = findRedirectUrl(item);
      if (found) return found;
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
