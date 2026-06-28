import { getSingleResumeId } from "../../hh/resumes";
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
  usage: "vacancies suitable [resume-id] [--page <n>] [--per-page <n>] [--scan-pages <n>] [--text <query>]",
  help: {
    summary: "Search suitable frontend vacancies for a resume",
    description:
      "Uses HH suitable-vacancy search with built-in remote, accredited IT, developer-role, and frontend title filters.",
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
        summary: "Number of returned frontend matches",
        defaultValue: "20",
      },
      {
        name: "--scan-pages",
        value: "<n>",
        summary: "HH API pages to scan for frontend matches",
        defaultValue: "5",
      },
      {
        name: "--text",
        value: "<query>",
        summary: "Override search text",
        defaultValue: "Frontend OR React OR Next.js",
      },
    ],
    aliases: ["suitable [resume-id]"],
    examples: [
      { command: "firehh vacancies suitable" },
      { command: "firehh vacancies suitable <resume-id> --per-page 50" },
    ],
  },
  matches: (parsed) => scoped(parsed, "vacancies", "suitable") || legacy(parsed, "suitable"),
  run: async ({ parsed, context }) => {
    try {
      const explicitResumeId =
        parsed.command === "suitable" ? parsed.positionals[1] : parsed.positionals[2];
      const resumeId = explicitResumeId || (await getSingleResumeId(context.env));

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

      const options = suitableSearchOptions(context.env, parsed.flags);
      const vacancies = await searchSuitableVacancies(
        context.env,
        resumeId,
        options,
      );

      writeData(context, {
        resume_id: resumeId,
        filters: {
          text: options.text,
          professional_role: "96",
          label: "accredited_it",
          schedule: "remote",
          local_title_filter: "frontend/react/next.js excluding backend/fullstack/mobile-adjacent stacks",
        },
        found: vacancies.found,
        page: vacancies.page,
        pages: vacancies.pages,
        per_page: vacancies.per_page,
        scanned_pages: vacancies.scanned_pages ?? 1,
        matched_items: vacancies.matched_items ?? vacancies.items.length,
        items: vacancies.items.map(vacancySummary),
      });
      return 0;
    } catch (error) {
      writeError(context, "HH_ERROR", errorMessage(error));
      return 2;
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
