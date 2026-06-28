import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { EnvMap } from "../types";
import { hhFetch } from "./client";

export async function readMessageFile(path: string): Promise<string> {
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

export async function readCoverLetter(
  flags: Map<string, string>,
): Promise<string> {
  const inlineMessage = flags.get("message");
  if (inlineMessage) return inlineMessage.trim();

  const messageFile = flags.get("message-file") || flags.get("letter-file");
  if (messageFile) return readMessageFile(messageFile);

  throw new Error(
    "Missing cover letter. Use --message '<text>' or --message-file <path>.",
  );
}

export async function applyToVacancy(
  env: EnvMap,
  vacancyId: string,
  resumeId: string,
  message: string,
): Promise<{ id: string; location: string | null }> {
  const body = new URLSearchParams({
    vacancy_id: vacancyId,
    resume_id: resumeId,
    message,
  });

  const response = await hhFetch(env, "/negotiations", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const location = response.headers.get("Location");

  if (response.status === 201) {
    return {
      id: location?.split("/").pop() || "",
      location,
    };
  }

  if (response.status === 303) {
    throw new Error(`Direct employer response required: ${location ?? "unknown URL"}`);
  }

  const data = await response.json().catch(() => null);
  throw new Error(
    `HH apply error ${response.status}: ${JSON.stringify(data ?? {})}`,
  );
}
