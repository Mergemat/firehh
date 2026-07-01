import {
  getVacancy,
  searchSuitableVacancies,
  searchVacancies,
  type SuitableSearchOptions,
  type VacancySearchOptions,
  vacancySummary,
} from "../../hh/vacancies";
import type { ParsedArgs } from "../args";
import {
  assertKnownFlags,
  booleanFlag,
  inputError,
  isInputError,
  numberFlag,
  oneOfFlag,
  optionalNumberFlag,
  optionalStringFlag,
  regexFlag,
} from "../command-options";
import { writeData, writeError } from "../output";
import type { CommandSpec } from "./types";
import { legacy, scoped } from "./shared";
import {
  writeVacancySearchResult,
  type VacancySearchFormat,
} from "./vacancy-output";

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
      assertKnownFlags(parsed.flags, vacancyViewCommand.help.options, "vacancies view");
      const vacancy = await getVacancy(context.env, vacancyId);
      writeData(context, vacancySummary(vacancy));
      return 0;
    } catch (error) {
      const input = isInputError(error);
      writeError(context, input ? "INPUT_ERROR" : "HH_ERROR", error);
      return input ? 1 : 2;
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
      assertKnownFlags(
        parsed.flags,
        vacanciesSearchCommand.help.options,
        "vacancies search",
      );

      const options = parseVacancySearchOptions(parsed.flags);
      const format = parseVacancySearchFormat(parsed.flags);
      const vacancies = await searchVacancies(context.env, options);
      writeVacancySearchResult(context, vacancies, options, format, {
        must: optionalStringFlag(parsed.flags, "must"),
        reject: optionalStringFlag(parsed.flags, "reject"),
      });
      return 0;
    } catch (error) {
      const input = isInputError(error);
      writeError(context, input ? "INPUT_ERROR" : "HH_ERROR", error);
      return input ? 1 : 2;
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

      assertKnownFlags(
        parsed.flags,
        vacanciesSuitableCommand.help.options,
        "vacancies suitable",
      );

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

      const options = parseSuitableSearchOptions(parsed.flags);
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
      const input = isInputError(error);
      writeError(
        context,
        input ? "INPUT_ERROR" : "HH_ERROR",
        error,
      );
      return input ? 1 : 2;
    }
  },
};

function parseSuitableSearchOptions(
  flags: Map<string, string>,
): SuitableSearchOptions {
  return {
    page: numberFlag(flags, "page", 0),
    perPage: numberFlag(flags, "per-page", 20, { min: 1, max: 100 }),
  };
}

function parseVacancySearchOptions(
  flags: Map<string, string>,
): VacancySearchOptions {
  const salaryFrom = optionalNumberFlag(flags, "salary-from");
  const salaryTo = optionalNumberFlag(flags, "salary-to");

  if (
    salaryFrom !== undefined &&
    salaryTo !== undefined &&
    salaryTo < salaryFrom
  ) {
    throw inputError("--salary-to must be greater than or equal to --salary-from");
  }

  return {
    text: optionalStringFlag(flags, "text"),
    area: optionalStringFlag(flags, "area"),
    remote: booleanFlag(flags, "remote"),
    hybrid: booleanFlag(flags, "hybrid"),
    employment: optionalStringFlag(flags, "employment"),
    experience: optionalStringFlag(flags, "experience"),
    salaryFrom,
    salaryTo,
    onlyAccredited: booleanFlag(flags, "only-accredited"),
    publishedAfter: optionalStringFlag(flags, "published-after"),
    page: numberFlag(flags, "page", 0),
    perPage: numberFlag(flags, "per-page", 20, { min: 1, max: 100 }),
    must: regexFlag(flags, "must"),
    reject: regexFlag(flags, "reject"),
  };
}

function parseVacancySearchFormat(
  flags: Map<string, string>,
): VacancySearchFormat {
  return oneOfFlag(flags, "format", ["json", "tsv", "md", "jsonl"] as const, "json");
}

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
