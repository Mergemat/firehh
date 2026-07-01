import {
  getVacancy,
  searchVacancies,
  searchSuitableVacancies,
  suitableSearchOptions,
  type NormalizedVacancy,
  type VacancySearchOptions,
  vacancySearchOptions,
  vacancySummary,
} from "../../hh/vacancies";
import { writeData, writeError } from "../output";
import type { ParsedArgs } from "../args";
import type { CommandSpec } from "./types";
import { legacy, scoped } from "./shared";

type VacancySearchFormat = "json" | "tsv" | "md" | "jsonl";

export const vacancyViewCommand: CommandSpec = {
  id: "vacancies.view",
  usage: "vacancies view <vacancy-id>",
  help: {
    summary: "Fetch one HH vacancy",
    description:
      "Returns a single vacancy with normalized booleans and description text for agent consumption.",
    aliases: ["<vacancy-id>"],
    examples: [{ command: "firehh vacancies view 133561763" }],
  },
  matches: (parsed) =>
    scoped(parsed, "vacancies", "view") || looksLikeLegacyVacancyView(parsed),
  run: async ({ parsed, context }) => {
    const vacancyId =
      parsed.command === "vacancies" ? parsed.positionals[2] : parsed.positionals[0];
    if (!vacancyId) {
      writeError(context, "INPUT_ERROR", "Usage: firehh vacancies view <vacancy-id>");
      return 1;
    }

    try {
      const vacancy = await getVacancy(context.env, vacancyId);
      writeData(context, vacancySummary(vacancy));
      return 0;
    } catch (error) {
      writeError(context, "HH_ERROR", error);
      return 2;
    }
  },
};

export const vacanciesSearchCommand: CommandSpec = {
  id: "vacancies.search",
  usage:
    "vacancies search [--text <query>] [--area <id>] [--remote] [--hybrid] [--employment <id>] [--experience <id>] [--salary-from <n>] [--salary-to <n>] [--only-accredited] [--published-after <date>] [--must <regex>] [--reject <regex>] [--format json|tsv|md|jsonl] [--page <n>] [--per-page <n>]",
  help: {
    summary: "Search HH vacancies with API filters and local stack filters",
    description:
      "Runs ordinary HH vacancy search. Stack, salary-range, and accreditation filters are applied locally to the returned page.",
    options: [
      { name: "--text", value: "<query>", summary: "HH search text" },
      { name: "--area", value: "<id>", summary: "HH area id" },
      { name: "--remote", summary: "Require remote work format" },
      { name: "--hybrid", summary: "Require hybrid work format" },
      {
        name: "--employment",
        value: "<id>",
        summary: "HH employment id, for example full",
      },
      {
        name: "--experience",
        value: "<id>",
        summary: "HH experience id",
      },
      {
        name: "--salary-from",
        value: "<n>",
        summary: "Local salary lower bound filter",
      },
      {
        name: "--salary-to",
        value: "<n>",
        summary: "Local salary upper bound filter",
      },
      {
        name: "--only-accredited",
        summary: "Keep only accredited IT employers",
      },
      {
        name: "--published-after",
        value: "<date>",
        summary: "HH date_from publication filter",
      },
      {
        name: "--must",
        value: "<regex>",
        summary: "Local regex that must match vacancy text",
      },
      {
        name: "--reject",
        value: "<regex>",
        summary: "Local regex that must not match vacancy text",
      },
      {
        name: "--format",
        value: "json|tsv|md|jsonl",
        summary: "Output format",
        defaultValue: "json",
      },
      {
        name: "--page",
        value: "<n>",
        summary: "HH page, zero-based",
        defaultValue: "0",
      },
      {
        name: "--per-page",
        value: "<n>",
        summary: "Number of returned vacancies before local filters",
        defaultValue: "20",
      },
    ],
    examples: [
      {
        command:
          'firehh vacancies search --text "frontend react" --must "React|TypeScript|Next" --reject "Vue|Angular|MobX|Ember|React Native|SCSS|БЭМ|fullstack|ГПХ|ИП" --format tsv',
      },
    ],
  },
  matches: (parsed) => scoped(parsed, "vacancies", "search"),
  run: async ({ parsed, context }) => {
    try {
      const unsupportedFlag = firstUnsupportedFlag(parsed.flags, [
        "text",
        "area",
        "remote",
        "hybrid",
        "employment",
        "experience",
        "salary-from",
        "salary-to",
        "only-accredited",
        "published-after",
        "must",
        "reject",
        "format",
        "page",
        "per-page",
        "help",
        "version",
      ]);
      if (unsupportedFlag) {
        writeError(
          context,
          "INPUT_ERROR",
          `Unsupported flag for vacancies search: --${unsupportedFlag}`,
        );
        return 1;
      }

      const options = vacancySearchOptions(parsed.flags);
      const format = vacancySearchFormat(parsed.flags);
      const vacancies = await searchVacancies(context.env, options);
      writeVacancySearchResult(context, vacancies, options, format, parsed.flags);
      return 0;
    } catch (error) {
      const inputError = isInputError(error);
      writeError(context, inputError ? "INPUT_ERROR" : "HH_ERROR", error);
      return inputError ? 1 : 2;
    }
  },
};

export const vacanciesSuitableCommand: CommandSpec = {
  id: "vacancies.suitable",
  usage: "vacancies suitable <resume-id> [--page <n>] [--per-page <n>]",
  help: {
    summary: "Search HH suitable vacancies for a resume",
    description:
      "Uses HH suitable-vacancy search by resume without extra local role, title, schedule, or employer filters.",
    options: [
      {
        name: "--page",
        value: "<n>",
        summary: "HH page, zero-based",
        defaultValue: "0",
      },
      {
        name: "--per-page",
        value: "<n>",
        summary: "Number of returned vacancies",
        defaultValue: "20",
      },
    ],
    aliases: ["suitable <resume-id>"],
    examples: [
      { command: "firehh vacancies suitable <resume-id> --per-page 50" },
    ],
  },
  matches: (parsed) => scoped(parsed, "vacancies", "suitable") || legacy(parsed, "suitable"),
  run: async ({ parsed, context }) => {
    try {
      const explicitResumeId =
        parsed.command === "suitable" ? parsed.positionals[1] : parsed.positionals[2];

      const unsupportedFlag = firstUnsupportedFlag(parsed.flags, [
        "page",
        "per-page",
        "help",
        "version",
      ]);
      if (unsupportedFlag) {
        writeError(
          context,
          "INPUT_ERROR",
          `Unsupported flag for vacancies suitable: --${unsupportedFlag}`,
        );
        return 1;
      }

      if (!explicitResumeId) {
        writeError(
          context,
          "INPUT_ERROR",
          "Usage: firehh vacancies suitable <resume-id> [--page <n>] [--per-page <n>]",
        );
        return 1;
      }

      const resumeId = explicitResumeId;

      if (/^\d+$/.test(resumeId)) {
        writeError(
          context,
          "INPUT_ERROR",
          [
            "vacancies suitable searches vacancies for a resume, but this looks like a vacancy id.",
            "Use: firehh vacancies suitable <resume-id>",
            "To check resumes for a vacancy: firehh resumes for-vacancy <vacancy-id>",
          ].join("\n"),
        );
        return 1;
      }

      const options = suitableSearchOptions(parsed.flags);
      const vacancies = await searchSuitableVacancies(
        context.env,
        resumeId,
        options,
      );

      writeData(context, {
        resume_id: resumeId,
        query: {
          resume: resumeId,
        },
        found: vacancies.found,
        page: vacancies.page,
        pages: vacancies.pages,
        per_page: vacancies.per_page,
        items: vacancies.items.map(vacancySummary),
      });
      return 0;
    } catch (error) {
      const inputError = isInputError(error);
      writeError(
        context,
        inputError ? "INPUT_ERROR" : "HH_ERROR",
        error,
      );
      return inputError ? 1 : 2;
    }
  },
};

function looksLikeLegacyVacancyView(parsed: ParsedArgs): boolean {
  if (!parsed.command || parsed.subcommand !== undefined) return false;
  if (!/^\d+$/.test(parsed.command)) return false;

  return ![
    "auth",
    "token",
    "resumes",
    "suitable",
    "vacancy-resumes",
    "vacancies",
    "applications",
    "apply",
  ].includes(parsed.command);
}

function firstUnsupportedFlag(
  flags: Map<string, string>,
  allowedFlags: string[],
): string | null {
  const allowed = new Set(allowedFlags);

  for (const flag of flags.keys()) {
    if (!allowed.has(flag)) return flag;
  }

  return null;
}

function isInputError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.startsWith("Invalid number for --") ||
      error.message.startsWith("Invalid regex for --") ||
      error.message.startsWith("Unsupported --format") ||
      error.message.startsWith("--salary-to"))
  );
}

function vacancySearchFormat(flags: Map<string, string>): VacancySearchFormat {
  const format = flags.get("format") || "json";
  if (
    format === "json" ||
    format === "tsv" ||
    format === "md" ||
    format === "jsonl"
  ) {
    return format;
  }

  throw new Error(`Unsupported --format: ${format}`);
}

function writeVacancySearchResult(
  context: Parameters<CommandSpec["run"]>[0]["context"],
  vacancies: Awaited<ReturnType<typeof searchVacancies>>,
  options: VacancySearchOptions,
  format: VacancySearchFormat,
  flags: Map<string, string>,
): void {
  const items = vacancies.items.map(vacancySummary);

  if (format === "jsonl") {
    for (const item of items) {
      context.io.stdout(`${JSON.stringify(item)}\n`);
    }
    return;
  }

  if (format === "tsv") {
    context.io.stdout(renderVacancyTsv(items));
    return;
  }

  if (format === "md") {
    context.io.stdout(renderVacancyMarkdown(items));
    return;
  }

  writeData(context, {
    query: vacancySearchQuery(options, flags),
    found: vacancies.found,
    page: vacancies.page,
    pages: vacancies.pages,
    per_page: vacancies.per_page,
    matched_items: items.length,
    items,
  });
}

function vacancySearchQuery(
  options: VacancySearchOptions,
  flags: Map<string, string>,
) {
  return {
    text: options.text ?? null,
    area: options.area ?? null,
    remote: options.remote,
    hybrid: options.hybrid,
    employment: options.employment ?? null,
    experience: options.experience ?? null,
    salary_from: options.salaryFrom ?? null,
    salary_to: options.salaryTo ?? null,
    only_accredited: options.onlyAccredited,
    published_after: options.publishedAfter ?? null,
    must: flags.get("must") || null,
    reject: flags.get("reject") || null,
  };
}

function renderVacancyTsv(items: NormalizedVacancy[]): string {
  const rows = vacancyTableRows(items);
  return [
    vacancyTableColumns.join("\t"),
    ...rows.map((row) =>
      vacancyTableColumns.map((column) => tsvCell(row[column])).join("\t"),
    ),
  ]
    .join("\n")
    .concat("\n");
}

function renderVacancyMarkdown(items: NormalizedVacancy[]): string {
  const rows = vacancyTableRows(items);
  const header = `| ${vacancyTableColumns.join(" | ")} |`;
  const separator = `| ${vacancyTableColumns.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (row) =>
      `| ${vacancyTableColumns.map((column) => markdownCell(row[column])).join(" | ")} |`,
  );

  return [header, separator, ...body].join("\n").concat("\n");
}

const vacancyTableColumns = [
  "id",
  "name",
  "employer",
  "area",
  "salary_from",
  "salary_to",
  "gross",
  "employment",
  "schedule",
  "experience",
  "accredited_it_employer",
  "formalization",
  "published_at",
  "url",
] as const;

type VacancyTableColumn = (typeof vacancyTableColumns)[number];
type VacancyTableRow = Record<VacancyTableColumn, string | number | boolean | null>;

function vacancyTableRows(items: NormalizedVacancy[]): VacancyTableRow[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    employer: item.employer?.name ?? null,
    area: item.area?.name ?? null,
    salary_from: item.salary.from,
    salary_to: item.salary.to,
    gross: item.salary.gross,
    employment: item.employment?.name ?? item.employment_form?.name ?? null,
    schedule: item.schedule?.name ?? null,
    experience: item.experience?.name ?? null,
    accredited_it_employer: item.accredited_it_employer,
    formalization: formalizationCell(item.formalization),
    published_at: item.published_at,
    url: item.url,
  }));
}

function formalizationCell(value: NormalizedVacancy["formalization"]): string {
  return [
    value.labor_contract ? "labor_contract" : "",
    value.gph ? "gph" : "",
    value.project_work ? "project_work" : "",
    value.individual_entrepreneur ? "individual_entrepreneur" : "",
  ]
    .filter(Boolean)
    .join(",");
}

function tsvCell(value: string | number | boolean | null): string {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ");
}

function markdownCell(value: string | number | boolean | null): string {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, " ");
}
