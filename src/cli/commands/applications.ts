import { applyToVacancy, readCoverLetter } from "../../hh/applications";
import { requireEligibleVacancy, vacancySummary } from "../../hh/vacancies";
import { errorMessage, writeData, writeError } from "../output";
import type { CommandSpec } from "./types";
import { legacy, scoped } from "./shared";

export const applicationsApplyCommand: CommandSpec = {
  id: "applications.apply",
  usage: "applications apply <vacancy-id> --resume <resume-id> (--message <text> | --message-file <path>) [--dry-run]",
  help: {
    summary: "Apply to an eligible HH vacancy",
    description:
      "Checks accredited IT and remote eligibility before posting the negotiation. DOCX cover letters are read through macOS textutil.",
    options: [
      {
        name: "--resume",
        value: "<resume-id>",
        summary: "Resume id to apply with",
        required: true,
      },
      {
        name: "--message",
        value: "<text>",
        summary: "Inline cover letter",
      },
      {
        name: "--message-file",
        value: "<path>",
        summary: "Cover letter text or DOCX file",
      },
      {
        name: "--dry-run",
        summary: "Validate and print payload without applying",
      },
    ],
    aliases: ["apply <vacancy-id>"],
    examples: [
      {
        command:
          "firehh applications apply 133561763 --resume <resume-id> --message-file cover-letter.docx --dry-run",
      },
    ],
  },
  matches: (parsed) =>
    scoped(parsed, "applications", "apply") || legacy(parsed, "apply"),
  run: async ({ parsed, context }) => {
    const vacancyId =
      parsed.command === "apply" ? parsed.positionals[1] : parsed.positionals[2];
    const resumeId = parsed.flags.get("resume") || parsed.flags.get("resume-id");
    const dryRun = parsed.flags.has("dry-run");

    if (!vacancyId || !resumeId) {
      writeError(
        context,
        "INPUT_ERROR",
        "Usage: firehh applications apply <vacancy-id> --resume <resume-id> --message-file <path>",
      );
      return 1;
    }

    try {
      const vacancy = await requireEligibleVacancy(context.env, vacancyId);
      const message = await readCoverLetter(parsed.flags);
      if (!message) throw new Error("Cover letter is empty.");

      if (dryRun) {
        writeData(context, {
          dry_run: true,
          vacancy: vacancySummary(vacancy),
          resume_id: resumeId,
          cover_letter_chars: message.length,
          cover_letter: message,
        });
        return 0;
      }

      const result = await applyToVacancy(
        context.env,
        vacancyId,
        resumeId,
        message,
      );
      writeData(context, {
        applied: true,
        negotiation_id: result.id || null,
        location: result.location,
      });
      return 0;
    } catch (error) {
      writeError(context, "HH_ERROR", errorMessage(error));
      return 2;
    }
  },
};
