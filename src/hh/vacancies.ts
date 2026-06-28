import {
  DEFAULT_SUITABLE_TEXT,
  DEVELOPER_PROFESSIONAL_ROLE_ID,
  fromEnv,
} from "../config";
import type { EnvMap, Vacancy, VacancySearchResponse } from "../types";
import { hhJson } from "./client";

export type SuitableSearchOptions = {
  text?: string;
  page: number;
  perPage: number;
  scanPages: number;
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

export function isFrontendVacancy(vacancy: Vacancy): boolean {
  const title = vacancy.name.toLowerCase();

  return (
    /front[\s-]?end|фронт|react|next\.?js/.test(title) &&
    !/react native|native|vue|angular|backend|back[\s-]?end|full[\s-]?stack|fullstack|golang|go-разработчик|java разработчик|java developer|c#|\.net|php|laravel|python/.test(
      title,
    )
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
    frontend: isFrontendVacancy(vacancy),
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
  env: EnvMap,
  flags: Map<string, string>,
): SuitableSearchOptions {
  return {
    text: flags.get("text") || fromEnv(env, "HH_SUITABLE_TEXT") || DEFAULT_SUITABLE_TEXT,
    page: numberFlag(flags, "page", 0),
    perPage: Math.min(numberFlag(flags, "per-page", 20), 100),
    scanPages: Math.min(numberFlag(flags, "scan-pages", 5), 20),
  };
}

export async function searchSuitableVacancies(
  env: EnvMap,
  resumeId: string,
  options: SuitableSearchOptions,
): Promise<VacancySearchResponse> {
  const matchedItems: Vacancy[] = [];
  let firstResponse: VacancySearchResponse | null = null;
  let scannedPages = 0;

  for (
    let page = options.page;
    page < options.page + options.scanPages;
    page += 1
  ) {
    const params = new URLSearchParams({
      resume: resumeId,
      text: options.text ?? DEFAULT_SUITABLE_TEXT,
      label: "accredited_it",
      professional_role: DEVELOPER_PROFESSIONAL_ROLE_ID,
      schedule: "remote",
      order_by: "publication_time",
      page: String(page),
      per_page: "100",
    });

    const response = await hhJson<VacancySearchResponse>(
      env,
      `/vacancies?${params.toString()}`,
    );

    firstResponse ??= response;
    scannedPages += 1;

    matchedItems.push(
      ...response.items.filter(
        (vacancy) =>
          isAccreditedItVacancy(vacancy) &&
          isRemoteVacancy(vacancy) &&
          isFrontendVacancy(vacancy),
      ),
    );

    if (matchedItems.length >= options.perPage || page >= response.pages - 1) {
      break;
    }
  }

  if (!firstResponse) {
    throw new Error("HH returned no vacancy search response.");
  }

  return {
    ...firstResponse,
    per_page: options.perPage,
    items: matchedItems.slice(0, options.perPage),
    scanned_pages: scannedPages,
    matched_items: matchedItems.length,
  };
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
): number {
  const value = flags.get(key);
  if (value === undefined || value === "") return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid number for --${key}: ${value}`);
  }

  return parsed;
}
