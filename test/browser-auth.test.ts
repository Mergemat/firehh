import { describe, expect, test } from "bun:test";
import { cleanupBrowserProfile } from "../src/browser-auth";

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
