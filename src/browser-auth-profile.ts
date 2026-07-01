import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

type RemoveProfile = typeof rm;

export function findBrowserExecutable(): string | null {
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

export function spawnBrowser(browserPath: string, userDataDir: string): ChildProcess {
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

export async function cleanupBrowserProfile(options: {
  browser: ChildProcess | null;
  userDataDir: string;
  onStatus?: (message: string) => void;
  removeProfile?: RemoveProfile;
  retryDelaysMs?: readonly number[];
}): Promise<void> {
  const removeProfile = options.removeProfile ?? rm;
  const retryDelaysMs = options.retryDelaysMs ?? [0, 100, 250, 500, 1_000, 1_500];
  let lastError: unknown = null;

  terminateBrowser(options.browser);
  await waitForBrowserExit(options.browser, 1_500);

  for (const delayMs of retryDelaysMs) {
    if (delayMs > 0) await sleep(delayMs);

    try {
      await removeProfile(options.userDataDir, { force: true, recursive: true });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  options.onStatus?.(
    `Could not remove temporary browser profile; it can be deleted later. ${formatCleanupError(lastError)}`,
  );
}

function terminateBrowser(browser: ChildProcess | null): void {
  if (!browser) return;

  try {
    browser.kill();
  } catch {
    // Cleanup must not mask the OAuth redirect or token exchange error.
  }
}

function waitForBrowserExit(
  browser: ChildProcess | null,
  timeoutMs: number,
): Promise<void> {
  if (!browser || browser.exitCode !== null || browser.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      browser.off("exit", finish);
      browser.off("close", finish);
      resolve();
    };

    timer = setTimeout(finish, timeoutMs);
    browser.once("exit", finish);
    browser.once("close", finish);
  });
}

function formatCleanupError(error: unknown): string {
  if (!error || typeof error !== "object") return "";

  const code = "code" in error ? String(error.code) : "";
  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";

  if (code && message) return `Reason: ${code}: ${message}`;
  if (code) return `Reason: ${code}`;
  if (message) return `Reason: ${message}`;
  return "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
