import type { EnvMap, Vacancy, VacancySearchResponse } from "../types";
import { hhJson } from "./client";

export type SuitableSearchOptions = {
  page: number;
  perPage: number;
};

export async function getVacancy(
  env: EnvMap,
  id: string,
): Promise<Vacancy> {
  return hhJson<Vacancy>(env, `/vacancies/${id}`);
}

export function isAccreditedItVacancy(vacancy: Vacancy): boolean {
  return vacancy.employer?.accredited_it_employer === true;
}

export function isRemoteVacancy(vacancy: Vacancy): boolean {
  return (
    vacancy.schedule?.id === "remote" ||
    vacancy.schedule?.name.toLowerCase().includes("удален") === true ||
    vacancy.work_format?.some((format) => format.id === "REMOTE") === true
  );
}

export function formatAccreditation(vacancy: Vacancy): string {
  return isAccreditedItVacancy(vacancy)
    ? "accredited IT employer"
    : "not accredited IT employer";
}

export function vacancySummary(vacancy: Vacancy) {
  return {
    id: vacancy.id,
    name: vacancy.name,
    employer: vacancy.employer?.name ?? null,
    area: vacancy.area?.name ?? null,
    accredited_it_employer: isAccreditedItVacancy(vacancy),
    remote: isRemoteVacancy(vacancy),
    salary: vacancy.salary ?? null,
    experience: vacancy.experience?.name ?? null,
    employment: vacancy.employment?.name ?? null,
    schedule: vacancy.schedule?.name ?? null,
    published_at: vacancy.published_at ?? null,
    url: vacancy.alternate_url ?? null,
    roles: vacancy.professional_roles?.map((role) => role.name) ?? [],
    skills: vacancy.key_skills?.map((skill) => skill.name) ?? [],
    description_text: htmlToText(vacancy.description),
  };
}

export async function requireEligibleVacancy(
  env: EnvMap,
  vacancyId: string,
): Promise<Vacancy> {
  const vacancy = await getVacancy(env, vacancyId);

  if (!isAccreditedItVacancy(vacancy)) {
    throw new Error(
      [
        "Skipped: employer is not an accredited IT company.",
        `Vacancy: ${vacancy.name}`,
        `Employer: ${vacancy.employer?.name ?? "Unknown employer"}`,
      ].join("\n"),
    );
  }

  if (!isRemoteVacancy(vacancy)) {
    throw new Error(
      [
        "Skipped: vacancy is not remote.",
        `Vacancy: ${vacancy.name}`,
        `Employer: ${vacancy.employer?.name ?? "Unknown employer"}`,
        `Schedule: ${vacancy.schedule?.name ?? "Unknown schedule"}`,
      ].join("\n"),
    );
  }

  return vacancy;
}

export function suitableSearchOptions(
  flags: Map<string, string>,
): SuitableSearchOptions {
  return {
    page: numberFlag(flags, "page", 0),
    perPage: numberFlag(flags, "per-page", 20, { min: 1, max: 100 }),
  };
}

export async function searchSuitableVacancies(
  env: EnvMap,
  resumeId: string,
  options: SuitableSearchOptions,
): Promise<VacancySearchResponse> {
  const params = new URLSearchParams({
    resume: resumeId,
    page: String(options.page),
    per_page: String(options.perPage),
  });

  return hhJson<VacancySearchResponse>(env, `/vacancies?${params.toString()}`);
}

export function htmlToText(html = ""): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
