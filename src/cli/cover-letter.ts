import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { inputError, optionalStringFlag } from "./command-options";

export type CoverLetterSource =
  | { type: "inline"; message: string }
  | { type: "file"; path: string };

export function coverLetterSourceFromFlags(
  flags: Map<string, string>,
): CoverLetterSource {
  const inlineMessage = optionalStringFlag(flags, "message");
  if (inlineMessage) return { type: "inline", message: inlineMessage };

  const messageFile =
    optionalStringFlag(flags, "message-file") ||
    optionalStringFlag(flags, "letter-file");
  if (messageFile) return { type: "file", path: messageFile };

  throw inputError(
    "Missing cover letter. Use --message '<text>' or --message-file <path>.",
  );
}

export async function readCoverLetter(
  source: CoverLetterSource,
): Promise<string> {
  if (source.type === "inline") return source.message.trim();
  return readMessageFile(source.path);
}

async function readMessageFile(path: string): Promise<string> {
  if (extname(path).toLowerCase() === ".docx") {
    const proc = Bun.spawn(["textutil", "-convert", "txt", "-stdout", path], {
      stderr: "pipe",
      stdout: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      throw new Error(
        `Failed to read DOCX via textutil: ${stderr.trim() || `exit ${exitCode}`}`,
      );
    }

    return stdout.trim();
  }

  return (await readFile(path, "utf8")).trim();
}
