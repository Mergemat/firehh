import { describe, expect, test } from "bun:test";
import {
  captureAuthRedirectWithBrowser,
  cleanupBrowserProfile,
} from "../src/browser-auth";
import type { ChildProcess } from "node:child_process";

describe("browser auth capture", () => {
  test("orchestrates browser, DevTools, redirect capture, and cleanup through adapters", async () => {
    const browser = {} as ChildProcess;
    const statuses: string[] = [];
    let capturedAuthUrl = "";
    let cleanedProfile = "";

    const redirectUrl = await captureAuthRedirectWithBrowser({
      env: {
      },
      timeoutMs: 1234,
      authUrl:
        "https://hh.test/oauth/authorize?client_id=client-id&redirect_uri=hhandroid%3A%2F%2Foauthresponse",
      browserPath: "/Applications/Test Chrome",
      onStatus: (message) => statuses.push(message),
      adapters: {
        exists: (path) => path === "/Applications/Test Chrome",
        makeProfileDir: async () => "/tmp/firehh-auth-profile",
        spawnBrowser: (browserPath, userDataDir) => {
          expect(browserPath).toBe("/Applications/Test Chrome");
          expect(userDataDir).toBe("/tmp/firehh-auth-profile");
          return browser;
        },
        waitForDevtoolsPort: async (userDataDir, timeoutMs) => {
          expect(userDataDir).toBe("/tmp/firehh-auth-profile");
          expect(timeoutMs).toBe(1234);
          return 9222;
        },
        waitForPageTarget: async (port, timeoutMs) => {
          expect(port).toBe(9222);
          expect(timeoutMs).toBe(1234);
          return { type: "page", webSocketDebuggerUrl: "ws://devtools" };
        },
        captureRedirectFromTarget: async (webSocketUrl, authUrl, timeoutMs) => {
          expect(webSocketUrl).toBe("ws://devtools");
          expect(timeoutMs).toBe(1234);
          capturedAuthUrl = authUrl;
          return "hhandroid://oauthresponse?code=captured-code";
        },
        cleanupBrowserProfile: async (options) => {
          expect(options.browser).toBe(browser);
          cleanedProfile = options.userDataDir;
        },
      },
    });

    expect(redirectUrl).toBe("hhandroid://oauthresponse?code=captured-code");
    expect(cleanedProfile).toBe("/tmp/firehh-auth-profile");
    expect(statuses).toEqual([
      "Opened Test Chrome. Complete HH login in the browser window.",
    ]);
    const authUrl = new URL(capturedAuthUrl);
    expect(authUrl.searchParams.get("client_id")).toBe("client-id");
    expect(authUrl.searchParams.get("redirect_uri")).toBe(
      "hhandroid://oauthresponse",
    );
  });
});

describe("browser auth cleanup", () => {
  test("does not throw when the temporary profile is still busy", async () => {
    const warnings: string[] = [];
    let attempts = 0;

    await expect(
      cleanupBrowserProfile({
        browser: null,
        userDataDir: "C:\\Temp\\firehh-auth-test",
        retryDelaysMs: [0],
        onStatus: (message) => warnings.push(message),
        removeProfile: async () => {
          attempts += 1;
          const error = new Error("resource busy or locked");
          Object.assign(error, { code: "EBUSY" });
          throw error;
        },
      }),
    ).resolves.toBeUndefined();

    expect(attempts).toBe(1);
    expect(warnings).toEqual([
      "Could not remove temporary browser profile; it can be deleted later. Reason: EBUSY: resource busy or locked",
    ]);
  });
});
