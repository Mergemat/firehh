import { afterEach, describe, expect, test } from "bun:test";
import {
  searchSuitableVacancies,
  suitableSearchOptions,
} from "../src/hh/vacancies";
import { runCli } from "../src/cli/run";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("vacancy suitable search", () => {
  test("uses HH resume-based search without extra biased filters", async () => {
    let requestedUrl: string | null = null;

    globalThis.fetch = async (input) => {
      requestedUrl = String(input);

      return new Response(
        JSON.stringify({
          items: [],
          found: 0,
          page: 1,
          pages: 0,
          per_page: 50,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    const options = suitableSearchOptions(
      new Map([
        ["page", "1"],
        ["per-page", "50"],
      ]),
    );

    await searchSuitableVacancies(
      { HH_ACCESS_TOKEN: "token" },
      "resume-id",
      options,
    );

    expect(requestedUrl).not.toBeNull();
    const url = new URL(requestedUrl!);

    expect(url.pathname).toBe("/vacancies");
    expect([...url.searchParams.entries()]).toEqual([
      ["resume", "resume-id"],
      ["page", "1"],
      ["per_page", "50"],
    ]);
  });

  test("requires explicit resume id", async () => {
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["vacancies", "suitable"], {
      env: {},
      io: {
        stdout: (text) => {
          stdout += text;
        },
        stderr: (text) => {
          stderr += text;
        },
        question: async () => "",
      },
    });

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(JSON.parse(stderr)).toEqual({
      ok: false,
      error: {
        code: "INPUT_ERROR",
        message:
          "Usage: firehh vacancies suitable <resume-id> [--page <n>] [--per-page <n>]",
      },
    });
  });

  test("rejects unsupported suitable flags", async () => {
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(
      ["vacancies", "suitable", "resume-id", "--text", "Frontend"],
      {
        env: {},
        io: {
          stdout: (text) => {
            stdout += text;
          },
          stderr: (text) => {
            stderr += text;
          },
          question: async () => "",
        },
      },
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(JSON.parse(stderr)).toEqual({
      ok: false,
      error: {
        code: "INPUT_ERROR",
        message: "Unsupported flag for vacancies suitable: --text",
      },
    });
  });

  test("rejects out-of-range per-page instead of clamping", () => {
    expect(() =>
      suitableSearchOptions(new Map([["per-page", "500"]])),
    ).toThrow("Invalid number for --per-page: 500");
  });

  test("reports out-of-range per-page as input error", async () => {
    let stderr = "";

    const exitCode = await runCli(
      ["vacancies", "suitable", "resume-id", "--per-page", "500"],
      {
        env: {},
        io: {
          stdout: () => {},
          stderr: (text) => {
            stderr += text;
          },
          question: async () => "",
        },
      },
    );

    expect(exitCode).toBe(1);
    expect(JSON.parse(stderr)).toEqual({
      ok: false,
      error: {
        code: "INPUT_ERROR",
        message: "Invalid number for --per-page: 500",
      },
    });
  });
});
