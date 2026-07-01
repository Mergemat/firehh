import {
  applicationStatus,
  applyToVacancy,
  listApplications,
  type ApplicationsListOptions,
} from "../../hh/applications";
import {
  coverLetterSourceFromFlags,
  readCoverLetter,
} from "../cover-letter";
import {
  assertKnownFlags,
  inputError,
  isInputError,
  numberFlag,
  optionalStringFlag,
} from "../command-options";
import { writeData, writeError } from "../output";
import type { CommandSpec } from "./types";
import { legacy, scoped } from "./shared";

export const applicationsApplyCommand: CommandSpec = {
  id: "applications.apply",
  usage: "applications apply <vacancy-id> --resume <resume-id> (--message <text> | --message-file <path>) [--dry-run]",
  help: {
    summary: "Apply to an HH vacancy",
    description:
      "Posts the negotiation without local vacancy eligibility checks. DOCX cover letters are read through macOS textutil.",
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
        summary: "Print payload without applying",
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
    try {
      assertKnownFlags(
        parsed.flags,
        applicationsApplyCommand.help.options,
        "applications apply",
        ["resume-id", "letter-file"],
      );

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

      const message = await readCoverLetter(coverLetterSourceFromFlags(parsed.flags));
      if (!message) throw inputError("Cover letter is empty.");

      if (dryRun) {
        writeData(context, {
          dry_run: true,
          vacancy_id: vacancyId,
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
      const input = isInputError(error);
      writeError(context, input ? "INPUT_ERROR" : "HH_ERROR", error);
      return input ? 1 : 2;
    }
  },
};

export const applicationsStatusCommand: CommandSpec = {
  id: "applications.status",
  usage: "applications status <vacancy-id>",
  help: {
    summary: "Check whether this account already applied to a vacancy",
    description:
      "Checks HH negotiations for the vacancy id and returns a normalized application status.",
    examples: [{ command: "firehh applications status 133561763" }],
  },
  matches: (parsed) => scoped(parsed, "applications", "status"),
  run: async ({ parsed, context }) => {
    const vacancyId = parsed.positionals[2];

    if (!vacancyId) {
      writeError(context, "INPUT_ERROR", "Usage: firehh applications status <vacancy-id>");
      return 1;
    }

    try {
      assertKnownFlags(
        parsed.flags,
        applicationsStatusCommand.help.options,
        "applications status",
      );
      writeData(context, await applicationStatus(context.env, vacancyId));
      return 0;
    } catch (error) {
      const input = isInputError(error);
      writeError(context, input ? "INPUT_ERROR" : "HH_ERROR", error);
      return input ? 1 : 2;
    }
  },
};

export const applicationsListCommand: CommandSpec = {
  id: "applications.list",
  usage: "applications list [--since <date>] [--page <n>] [--per-page <n>]",
  help: {
    summary: "List recent HH applications",
    description:
      "Reads HH negotiations sorted by creation time and locally keeps applications created on or after --since.",
    options: [
      {
        name: "--since",
        value: "<date>",
        summary: "Keep applications created on or after this date",
      },
      {
        name: "--page",
        value: "<n>",
        summary: "Start page, zero-based",
        defaultValue: "0",
      },
      {
        name: "--per-page",
        value: "<n>",
        summary: "Number of applications per HH page",
        defaultValue: "50",
      },
    ],
    examples: [{ command: "firehh applications list --since 2026-06-01" }],
  },
  matches: (parsed) => scoped(parsed, "applications", "list"),
  run: async ({ parsed, context }) => {
    try {
      assertKnownFlags(
        parsed.flags,
        applicationsListCommand.help.options,
        "applications list",
      );

      const result = await listApplications(
        context.env,
        parseApplicationsListOptions(parsed.flags),
      );
      writeData(context, result);
      return 0;
    } catch (error) {
      const input = isInputError(error);
      writeError(context, input ? "INPUT_ERROR" : "HH_ERROR", error);
      return input ? 1 : 2;
    }
  },
};

function parseApplicationsListOptions(
  flags: Map<string, string>,
): ApplicationsListOptions {
  const since = optionalStringFlag(flags, "since");
  if (since && Number.isNaN(Date.parse(since))) {
    throw inputError(`Invalid date for --since: ${since}`);
  }

  return {
    since,
    page: numberFlag(flags, "page", 0),
    perPage: numberFlag(flags, "per-page", 50, { min: 1, max: 100 }),
  };
}
