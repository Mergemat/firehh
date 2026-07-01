import type { EnvMap, Vacancy, VacancySearchResponse } from "../types";
import { hhJson } from "./client";
import {
  htmlToText,
  isAccreditedItVacancy,
  isRemoteVacancy,
  normalizeFormalization,
} from "./vacancy-normalization";

export type SuitableSearchOptions = {
  page: number;
  perPage: number;
};

export type VacancySearchOptions = {
  text?: string;
  area?: string;
  remote: boolean;
  hybrid: boolean;
  employment?: string;
  experience?: string;
  salaryFrom?: number;
  salaryTo?: number;
  onlyAccredited: boolean;
  publishedAfter?: string;
  page: number;
  perPage: number;
  must?: RegExp;
  reject?: RegExp;
};

export async function getVacancy(
  env: EnvMap,
  id: string,
): Promise<Vacancy> {
  return hhJson<Vacancy>(env, `/vacancies/${id}`);
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

export async function searchVacancies(
  env: EnvMap,
  options: VacancySearchOptions,
): Promise<VacancySearchResponse> {
  const params = vacancySearchParams(options);
  const response = await hhJson<VacancySearchResponse>(
    env,
    `/vacancies?${params.toString()}`,
  );
  const items = response.items.filter((vacancy) =>
    matchesLocalSearchFilters(vacancy, options),
  );

  return {
    ...response,
    items,
    matched_items: items.length,
  };
}

export function vacancySearchParams(
  options: VacancySearchOptions,
): URLSearchParams {
  const params = new URLSearchParams({
    page: String(options.page),
    per_page: String(options.perPage),
  });

  appendOptional(params, "text", options.text);
  appendOptional(params, "area", options.area);
  appendOptional(params, "employment", options.employment);
  appendOptional(params, "experience", options.experience);
  appendOptional(params, "date_from", options.publishedAfter);

  if (options.remote) params.append("work_format", "REMOTE");
  if (options.hybrid) params.append("work_format", "HYBRID");

  return params;
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

function appendOptional(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
): void {
  if (value !== undefined && value !== "") params.append(key, value);
}

function matchesLocalSearchFilters(
  vacancy: Vacancy,
  options: VacancySearchOptions,
): boolean {
  if (options.onlyAccredited && !isAccreditedItVacancy(vacancy)) return false;
  if (!matchesSalary(vacancy, options.salaryFrom, options.salaryTo)) return false;

  const text = searchableVacancyText(vacancy);
  if (options.must && !options.must.test(text)) return false;
  if (options.reject && options.reject.test(text)) return false;

  return true;
}

function matchesSalary(
  vacancy: Vacancy,
  salaryFrom: number | undefined,
  salaryTo: number | undefined,
): boolean {
  if (salaryFrom === undefined && salaryTo === undefined) return true;

  const salary = vacancy.salary_range ?? vacancy.salary ?? null;
  if (salary?.from === null && salary.to === null) return false;
  if (!salary) return false;

  const vacancyMin = salary.from ?? salary.to;
  const vacancyMax = salary.to ?? salary.from;

  if (salaryFrom !== undefined && vacancyMax !== null && vacancyMax < salaryFrom) {
    return false;
  }

  if (salaryTo !== undefined && vacancyMin !== null && vacancyMin > salaryTo) {
    return false;
  }

  return true;
}

function searchableVacancyText(vacancy: Vacancy): string {
  const formalization = normalizeFormalization(vacancy);
  const formalizationText = [
    formalization.labor_contract ? "labor contract трудовой договор" : "",
    formalization.gph ? "gph гпх гражданско-правовой договор" : "",
    formalization.project_work ? "project проектная работа" : "",
    formalization.individual_entrepreneur ? "individual entrepreneur ип" : "",
  ];

  return [
    vacancy.name,
    vacancy.employer?.name,
    vacancy.area?.name,
    vacancy.employment?.name,
    vacancy.employment?.id,
    vacancy.employment_form?.name,
    vacancy.employment_form?.id,
    vacancy.schedule?.name,
    vacancy.schedule?.id,
    vacancy.experience?.name,
    vacancy.experience?.id,
    ...(vacancy.key_skills?.map((skill) => skill.name) ?? []),
    ...(vacancy.professional_roles?.map((role) => role.name) ?? []),
    ...(vacancy.work_format?.flatMap((format) => [format.id, format.name]) ?? []),
    ...(vacancy.civil_law_contracts?.flatMap((contract) => [
      contract.id,
      contract.name,
    ]) ?? []),
    snippetText(vacancy),
    htmlToText(vacancy.description),
    ...formalizationText,
  ]
    .filter(Boolean)
    .join("\n");
}

function snippetText(vacancy: Vacancy): string {
  return htmlToText(
    [vacancy.snippet?.requirement, vacancy.snippet?.responsibility]
      .filter(Boolean)
      .join("\n"),
  );
}
