import type {
  EnvMap,
  Resume,
  ResumesResponse,
  SuitableResumesResponse,
} from "../types";
import { hhJson } from "./client";

export async function getResumes(env: EnvMap): Promise<ResumesResponse> {
  return hhJson<ResumesResponse>(env, "/resumes/mine");
}

export async function getSingleResumeId(env: EnvMap): Promise<string> {
  const resumes = await getResumes(env);

  if (resumes.items.length === 1) {
    return resumes.items[0].id;
  }

  if (resumes.items.length === 0) {
    throw new Error("No resumes found.");
  }

  throw new Error(
    [
      "Multiple resumes found. Pass resume id explicitly:",
      "  firehh vacancies suitable <resume-id>",
      "",
      ...resumes.items.map((resume) => `  ${resume.id} - ${resume.title}`),
    ].join("\n"),
  );
}

export async function getSuitableResumes(
  env: EnvMap,
  vacancyId: string,
): Promise<SuitableResumesResponse> {
  return hhJson<SuitableResumesResponse>(
    env,
    `/vacancies/${vacancyId}/suitable_resumes`,
  );
}

export function resumeSummary(resume: Resume) {
  return {
    id: resume.id,
    title: resume.title,
    status: resume.status?.name ?? null,
    area: resume.area?.name ?? null,
    updated_at: resume.updated_at ?? null,
    total_experience_months: resume.total_experience?.months ?? null,
  };
}
