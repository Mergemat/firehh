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

describe("applications status", () => {
  test("checks negotiations by vacancy id", async () => {
    let requestedUrl: string | null = null;

    globalThis.fetch = async (input) => {
      requestedUrl = String(input);

      return new Response(
        JSON.stringify({
          items: [
            {
              id: "negotiation-id",
              created_at: "2026-06-10T12:00:00+0300",
              updated_at: "2026-06-10T12:30:00+0300",
              state: { id: "response", name: "Отклик" },
              vacancy: {
                id: "vacancy-id",
                name: "Frontend React",
                alternate_url: "https://hh.ru/vacancy/vacancy-id",
              },
            },
          ],
          found: 1,
          page: 0,
          pages: 1,
          per_page: 50,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    let stdout = "";
    let stderr = "";
    const exitCode = await runCli(["applications", "status", "vacancy-id"], {
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
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(requestedUrl).not.toBeNull();
    const url = new URL(requestedUrl!);
    expect(url.pathname).toBe("/negotiations");
    expect([...url.searchParams.entries()]).toEqual([
      ["page", "0"],
      ["per_page", "50"],
      ["vacancy_id", "vacancy-id"],
    ]);
    expect(JSON.parse(stdout)).toEqual({
      ok: true,
      data: {
        vacancy_id: "vacancy-id",
        already_applied: true,
        items: [
          {
            id: "negotiation-id",
            created_at: "2026-06-10T12:00:00+0300",
            updated_at: "2026-06-10T12:30:00+0300",
            state: { id: "response", name: "Отклик" },
            employer_state: null,
            has_updates: null,
            viewed_by_opponent: null,
            vacancy: {
              id: "vacancy-id",
              name: "Frontend React",
              employer: null,
              archived: null,
              published_at: null,
              url: "https://hh.ru/vacancy/vacancy-id",
              apply_url: "https://hh.ru/vacancy/vacancy-id",
            },
            resume: null,
          },
        ],
      },
    });
  });
});

describe("applications list", () => {
  test("filters applications since date", async () => {
    let requestedUrl: string | null = null;

    globalThis.fetch = async (input) => {
      requestedUrl = String(input);

      return new Response(
        JSON.stringify({
          items: [
            {
              id: "new",
              created_at: "2026-06-10T12:00:00+0300",
              updated_at: "2026-06-10T12:30:00+0300",
              state: { id: "response", name: "Отклик" },
              vacancy: { id: "1", name: "New vacancy" },
            },
            {
              id: "old",
              created_at: "2026-05-30T12:00:00+0300",
              updated_at: "2026-05-30T12:30:00+0300",
              state: { id: "response", name: "Отклик" },
              vacancy: { id: "2", name: "Old vacancy" },
            },
          ],
          found: 2,
          page: 0,
          pages: 1,
          per_page: 50,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    let stdout = "";
    let stderr = "";
    const exitCode = await runCli(
      ["applications", "list", "--since", "2026-06-01"],
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
    const url = new URL(requestedUrl!);
    expect(url.pathname).toBe("/negotiations");
    expect([...url.searchParams.entries()]).toEqual([
      ["page", "0"],
      ["per_page", "50"],
      ["order_by", "created_at"],
      ["order", "desc"],
    ]);
    const payload = JSON.parse(stdout);
    expect(payload.data.since).toBe("2026-06-01");
    expect(payload.data.scanned_pages).toBe(1);
    expect(payload.data.items.map((item: { id: string }) => item.id)).toEqual([
      "new",
    ]);
  });
});
