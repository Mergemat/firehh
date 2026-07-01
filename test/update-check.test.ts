import { describe, expect, test } from "bun:test";
import { checkForUpdate, shouldCheckForUpdate } from "../src/update-check";

describe("update check", () => {
  test("skips help and failed commands", () => {
    expect(shouldCheckForUpdate(["--help"], 0)).toBe(false);
    expect(shouldCheckForUpdate(["vacancies", "view", "123"], 2)).toBe(false);
  });

  test("checks successful commands and version", () => {
    expect(shouldCheckForUpdate(["--version"], 0)).toBe(true);
    expect(shouldCheckForUpdate(["resumes", "list"], 0)).toBe(true);
  });

  test("returns compact notice when a newer version exists", async () => {
    const notice = await checkForUpdate(
      {},
      {
        currentVersion: "0.2.4",
        packageName: "@bagasek/firehh",
        fetch: async () =>
          new Response(JSON.stringify({ version: "0.2.5" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      },
    );

    expect(notice).toEqual({
      current: "0.2.4",
      latest: "0.2.5",
      message: "firehh update 0.2.4->0.2.5: bun install -g @bagasek/firehh",
    });
  });

  test("stays quiet when current or disabled", async () => {
    const fetchLatest = async () =>
      new Response(JSON.stringify({ version: "0.2.4" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    await expect(
      checkForUpdate(
        {},
        {
          currentVersion: "0.2.4",
          fetch: fetchLatest,
        },
      ),
    ).resolves.toBeNull();

    await expect(
      checkForUpdate(
        { FIREHH_NO_UPDATE_CHECK: "1" },
        {
          currentVersion: "0.2.3",
          fetch: fetchLatest,
        },
      ),
    ).resolves.toBeNull();
  });
});
