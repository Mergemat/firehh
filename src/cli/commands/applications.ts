import {
  applicationStatus,
  applyToVacancy,
  listApplications,
  readCoverLetter,
} from "../../hh/applications";
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
      const message = await readCoverLetter(parsed.flags);
      if (!message) throw new Error("Cover letter is empty.");

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
      writeError(context, "HH_ERROR", error);
      return 2;
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
      const unsupportedFlag = firstUnsupportedFlag(parsed.flags, ["help", "version"]);
      if (unsupportedFlag) {
        writeError(
          context,
          "INPUT_ERROR",
          `Unsupported flag for applications status: --${unsupportedFlag}`,
        );
        return 1;
      }

      writeData(context, await applicationStatus(context.env, vacancyId));
      return 0;
    } catch (error) {
      writeError(context, "HH_ERROR", error);
      return 2;
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
      const unsupportedFlag = firstUnsupportedFlag(parsed.flags, [
        "since",
        "page",
        "per-page",
        "help",
        "version",
      ]);
      if (unsupportedFlag) {
        writeError(
          context,
          "INPUT_ERROR",
          `Unsupported flag for applications list: --${unsupportedFlag}`,
        );
        return 1;
      }

      const result = await listApplications(context.env, {
        since: optionalStringFlag(parsed.flags, "since"),
        page: numberFlag(parsed.flags, "page", 0),
        perPage: numberFlag(parsed.flags, "per-page", 50, { min: 1, max: 100 }),
      });
      writeData(context, result);
      return 0;
    } catch (error) {
      const inputError = isInputError(error);
      writeError(context, inputError ? "INPUT_ERROR" : "HH_ERROR", error);
      return inputError ? 1 : 2;
    }
  },
};

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

function optionalStringFlag(
  flags: Map<string, string>,
  key: string,
): string | undefined {
  const value = flags.get(key);
  return value === undefined || value === "" ? undefined : value;
}

function numberFlag(
  flags: Map<string, string>,
  key: string,
  fallback: number,
  range: { min?: number; max?: number } = {},
): number {
  const value = flags.get(key);
  if (value === undefined || value === "") return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < (range.min ?? 0)) {
    throw new Error(`Invalid number for --${key}: ${value}`);
  }

  if (range.max !== undefined && parsed > range.max) {
    throw new Error(`Invalid number for --${key}: ${value}`);
  }

  return parsed;
}

function isInputError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.startsWith("Invalid number for --") ||
      error.message.startsWith("Invalid date for --"))
  );
}
