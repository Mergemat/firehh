import { afterEach, describe, expect, test } from "bun:test";
import {
  searchVacancies,
  searchSuitableVacancies,
  suitableSearchOptions,
  vacancySearchOptions,
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

  test("reports captcha as compact agent instruction", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          errors: [
            {
              value: "captcha_required",
              captcha_url: "https://hh.ru/account/captcha?state=abc",
              type: "captcha_required",
            },
          ],
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );

    let stdout = "";
    let stderr = "";
    const exitCode = await runCli(["vacancies", "view", "123"], {
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

    expect(exitCode).toBe(2);
    expect(stdout).toBe("");
    expect(JSON.parse(stderr)).toEqual({
      ok: false,
      error: {
        code: "captcha",
        message: "open captcha_url solve retry",
        captcha_url: "https://hh.ru/account/captcha?state=abc",
      },
    });
  });

  test("reports generic HH errors without nested JSON", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          errors: [
            {
              value: "forbidden",
              type: "forbidden",
            },
          ],
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );

    let stderr = "";
    const exitCode = await runCli(["resumes", "list"], {
      env: { HH_ACCESS_TOKEN: "token" },
      io: {
        stdout: () => {},
        stderr: (text) => {
          stderr += text;
        },
        question: async () => "",
      },
    });

    expect(exitCode).toBe(2);
    expect(JSON.parse(stderr)).toEqual({
      ok: false,
      error: {
        code: "hh_403",
        message: "forbidden",
      },
    });
  });
});

describe("vacancy search", () => {
  test("uses ordinary HH filters and applies local stack filters", async () => {
    let requestedUrl: string | null = null;

    globalThis.fetch = async (input) => {
      requestedUrl = String(input);

      return new Response(
        JSON.stringify({
          items: [
            {
              id: "1",
              name: "Frontend React",
              employer: {
                id: "e1",
                name: "Accredited",
                accredited_it_employer: true,
              },
              area: { id: "1", name: "Москва" },
              salary: { from: 220000, to: null, currency: "RUR", gross: true },
              key_skills: [{ name: "React" }, { name: "TypeScript" }],
              snippet: { requirement: "React TypeScript", responsibility: null },
            },
            {
              id: "2",
              name: "Frontend Vue",
              employer: {
                id: "e2",
                name: "Also Accredited",
                accredited_it_employer: true,
              },
              area: { id: "1", name: "Москва" },
              salary: { from: 250000, to: null, currency: "RUR", gross: false },
              key_skills: [{ name: "Vue" }],
              civil_law_contracts: [{ id: "INDIVIDUAL_ENTREPRENEUR", name: "с ИП" }],
              snippet: { requirement: "Vue", responsibility: null },
            },
          ],
          found: 2,
          page: 0,
          pages: 1,
          per_page: 20,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    const options = vacancySearchOptions(
      new Map([
        ["text", "frontend react"],
        ["area", "1"],
        ["remote", ""],
        ["hybrid", ""],
        ["employment", "full"],
        ["experience", "between1And3"],
        ["published-after", "2026-06-01"],
        ["salary-from", "200000"],
        ["only-accredited", ""],
        ["must", "React|TypeScript"],
        ["reject", "Vue|ГПХ|ИП"],
      ]),
    );

    const vacancies = await searchVacancies({ HH_ACCESS_TOKEN: "token" }, options);

    expect(requestedUrl).not.toBeNull();
    const url = new URL(requestedUrl!);
    expect(url.pathname).toBe("/vacancies");
    expect([...url.searchParams.entries()]).toEqual([
      ["page", "0"],
      ["per_page", "20"],
      ["text", "frontend react"],
      ["area", "1"],
      ["employment", "full"],
      ["experience", "between1And3"],
      ["date_from", "2026-06-01"],
      ["work_format", "REMOTE"],
      ["work_format", "HYBRID"],
    ]);
    expect(vacancies.items.map((vacancy) => vacancy.id)).toEqual(["1"]);
    expect(vacancies.matched_items).toBe(1);
  });

  test("prints search results as raw TSV", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: "1",
              name: "Frontend React",
              employer: { name: "HH", accredited_it_employer: true },
              area: { name: "Москва" },
              salary: { from: 200000, to: 300000, currency: "RUR", gross: true },
              employment: { id: "full", name: "Полная занятость" },
              published_at: "2026-06-01T10:00:00+0300",
              alternate_url: "https://hh.ru/vacancy/1",
            },
          ],
          found: 1,
          page: 0,
          pages: 1,
          per_page: 20,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );

    let stdout = "";
    let stderr = "";
    const exitCode = await runCli(
      ["vacancies", "search", "--text", "react", "--format", "tsv"],
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
    expect(stdout.split("\n")[0]).toBe(
      "id\tname\temployer\tarea\tsalary_from\tsalary_to\tgross\temployment\tschedule\texperience\taccredited_it_employer\tformalization\tpublished_at\turl",
    );
    expect(stdout).toContain("1\tFrontend React\tHH\tМосква\t200000\t300000\ttrue");
  });

  test("normalizes vacancy view fields", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          id: "1",
          name: "Frontend React",
          archived: false,
          published_at: "2026-06-01T10:00:00+0300",
          salary: { from: 200000, to: 300000, currency: "RUR", gross: true },
          employer: {
            id: "e1",
            name: "HH",
            accredited_it_employer: true,
          },
          area: { id: "1", name: "Москва" },
          employment: { id: "full", name: "Полная занятость" },
          schedule: { id: "remote", name: "Удаленная работа" },
          experience: { id: "between1And3", name: "1-3 года" },
          key_skills: [{ name: "React" }],
          description: "<p>Hello&nbsp;React</p>",
          contacts: {
            name: "Ivan",
            email: "ivan@example.com",
            phones: [{ formatted: "+7 999 000-00-00", comment: "after 10" }],
          },
          accept_labor_contract: true,
          civil_law_contracts: [
            { id: "INDIVIDUAL_ENTREPRENEUR", name: "с ИП" },
          ],
          apply_alternate_url: "https://hh.ru/applicant/vacancy_response?vacancyId=1",
          relations: ["got_response"],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );

    let stdout = "";
    const exitCode = await runCli(["vacancies", "view", "1"], {
      env: { HH_ACCESS_TOKEN: "token" },
      io: {
        stdout: (text) => {
          stdout += text;
        },
        stderr: () => {},
        question: async () => "",
      },
    });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.data).toMatchObject({
      active: true,
      archived: false,
      published_at: "2026-06-01T10:00:00+0300",
      salary: { gross: true },
      accredited_it_employer: true,
      employer: { id: "e1", name: "HH" },
      area: { id: "1", name: "Москва" },
      key_skills: ["React"],
      description_text: "Hello React",
      contacts: {
        name: "Ivan",
        email: "ivan@example.com",
        phones: [{ formatted: "+7 999 000-00-00", comment: "after 10" }],
      },
      formalization: {
        labor_contract: true,
        gph: true,
        individual_entrepreneur: true,
      },
      apply_url: "https://hh.ru/applicant/vacancy_response?vacancyId=1",
      already_applied: true,
    });
  });
});
