import { afterEach, describe, expect, test } from "bun:test";
import { runCli } from "../src/cli/run";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("applications apply", () => {
  test("posts an application without pre-checking vacancy eligibility", async () => {
    let requestedUrl: string | null = null;
    let requestedMethod: string | undefined;
    let requestedBody: string | null = null;

    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedMethod = init?.method;
      requestedBody = String(init?.body);

      return new Response(null, {
        status: 201,
        headers: {
          Location: "https://api.hh.ru/negotiations/negotiation-id",
        },
      });
    };

    let stdout = "";
    let stderr = "";
    const exitCode = await runCli(
      [
        "applications",
        "apply",
        "vacancy-id",
        "--resume",
        "resume-id",
        "--message",
        "hello",
      ],
      {
        env: { HH_ACCESS_TOKEN: "token" },
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

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(requestedUrl).not.toBeNull();
    expect(new URL(requestedUrl!).pathname).toBe("/negotiations");
    expect(requestedMethod).toBe("POST");
    expect([...new URLSearchParams(requestedBody ?? "").entries()]).toEqual([
      ["vacancy_id", "vacancy-id"],
      ["resume_id", "resume-id"],
      ["message", "hello"],
    ]);
    expect(JSON.parse(stdout)).toEqual({
      ok: true,
      data: {
        applied: true,
        negotiation_id: "negotiation-id",
        location: "https://api.hh.ru/negotiations/negotiation-id",
      },
    });
  });

  test("dry-run prints payload without calling HH", async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error("fetch should not be called");
    };

    let stdout = "";
    let stderr = "";
    const exitCode = await runCli(
      [
        "applications",
        "apply",
        "vacancy-id",
        "--resume",
        "resume-id",
        "--message",
        "hello",
        "--dry-run",
      ],
      {
        env: { HH_ACCESS_TOKEN: "token" },
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

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(fetchCalled).toBe(false);
    expect(JSON.parse(stdout)).toEqual({
      ok: true,
      data: {
        dry_run: true,
        vacancy_id: "vacancy-id",
        resume_id: "resume-id",
        cover_letter_chars: 5,
        cover_letter: "hello",
      },
    });
  });

  test("reports direct employer response as compact instruction", async () => {
    globalThis.fetch = async () =>
      new Response(null, {
        status: 303,
        headers: {
          Location: "https://hh.ru/applicant/vacancy_response?vacancyId=123",
        },
      });

    let stderr = "";
    const exitCode = await runCli(
      [
        "applications",
        "apply",
        "vacancy-id",
        "--resume",
        "resume-id",
        "--message",
        "hello",
      ],
      {
        env: { HH_ACCESS_TOKEN: "token" },
        io: {
          stdout: () => {},
          stderr: (text) => {
            stderr += text;
          },
          question: async () => "",
        },
      },
    );

    expect(exitCode).toBe(2);
    expect(JSON.parse(stderr)).toEqual({
      ok: false,
      error: {
        code: "direct_response",
        message: "open url apply manually",
        url: "https://hh.ru/applicant/vacancy_response?vacancyId=123",
      },
    });
  });
});
