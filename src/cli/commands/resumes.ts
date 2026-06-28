import { getResumes, getSuitableResumes, resumeSummary } from "../../hh/resumes";
import { requireEligibleVacancy, vacancySummary } from "../../hh/vacancies";
import { errorMessage, writeData, writeError } from "../output";
import type { CommandSpec } from "./types";
import { legacy, scoped } from "./shared";

export const resumesListCommand: CommandSpec = {
  id: "resumes.list",
  usage: "resumes list",
  help: {
    summary: "List your HH resumes",
    description: "Returns your resumes in a compact JSON shape.",
    aliases: ["resumes"],
    examples: [{ command: "firehh resumes list" }],
  },
  matches: (parsed) =>
    scoped(parsed, "resumes", "list") ||
    (legacy(parsed, "resumes") && parsed.subcommand === undefined),
  run: async ({ context }) => {
    try {
      const resumes = await getResumes(context.env);
      writeData(context, {
        found: resumes.found,
        items: resumes.items.map(resumeSummary),
      });
      return 0;
    } catch (error) {
      writeError(context, "HH_ERROR", errorMessage(error));
      return 2;
    }
  },
};

export const resumesForVacancyCommand: CommandSpec = {
  id: "resumes.for-vacancy",
  usage: "resumes for-vacancy <vacancy-id>",
  help: {
    summary: "List resumes suitable for a vacancy",
    description:
      "Checks that the vacancy is remote and accredited IT, then returns suitable resumes.",
    aliases: ["vacancy-resumes <vacancy-id>"],
    examples: [{ command: "firehh resumes for-vacancy 133561763" }],
  },
  matches: (parsed) =>
    scoped(parsed, "resumes", "for-vacancy") || legacy(parsed, "vacancy-resumes"),
  run: async ({ parsed, context }) => {
    const vacancyId =
      parsed.command === "vacancy-resumes"
        ? parsed.positionals[1]
        : parsed.positionals[2];
    if (!vacancyId) {
      writeError(
        context,
        "INPUT_ERROR",
        "Usage: firehh resumes for-vacancy <vacancy-id>",
      );
      return 1;
    }

    try {
      const vacancy = await requireEligibleVacancy(context.env, vacancyId);
      const suitable = await getSuitableResumes(context.env, vacancyId);

      writeData(context, {
        vacancy: vacancySummary(vacancy),
        already_applied: suitable.overall?.already_applied ?? 0,
        found: suitable.found ?? suitable.items.length,
        items: suitable.items.map(resumeSummary),
      });
      return 0;
    } catch (error) {
      writeError(context, "HH_ERROR", errorMessage(error));
      return 2;
    }
  },
};
