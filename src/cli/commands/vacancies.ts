import {
  getVacancy,
  searchSuitableVacancies,
  suitableSearchOptions,
  vacancySummary,
} from "../../hh/vacancies";
import { errorMessage, writeData, writeError } from "../output";
import type { ParsedArgs } from "../args";
import type { CommandSpec } from "./types";
import { legacy, scoped } from "./shared";

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
      writeError(context, "HH_ERROR", errorMessage(error));
      return 2;
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
        errorMessage(error),
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
  return error instanceof Error && error.message.startsWith("Invalid number for --");
}
