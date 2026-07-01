import type {
  ContactPhone,
  EnvMap,
  IdName,
  Vacancy,
  VacancySearchResponse,
} from "../types";
import { hhJson } from "./client";

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

export type VacancyFormalization = {
  labor_contract: boolean;
  gph: boolean;
  project_work: boolean;
  individual_entrepreneur: boolean;
};

export type NormalizedVacancy = ReturnType<typeof normalizeVacancy>;

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
    vacancy.work_format?.some((format) => format.id?.toUpperCase() === "REMOTE") === true
  );
}

export function isHybridVacancy(vacancy: Vacancy): boolean {
  return (
    vacancy.work_format?.some((format) => format.id?.toUpperCase() === "HYBRID") === true ||
    vacancy.work_format?.some((format) => format.name.toLowerCase().includes("гибрид")) === true
  );
}

export function formatAccreditation(vacancy: Vacancy): string {
  return isAccreditedItVacancy(vacancy)
    ? "accredited IT employer"
    : "not accredited IT employer";
}

export function normalizeVacancy(vacancy: Vacancy) {
  const salary = normalizeSalary(vacancy);
  const keySkills = vacancy.key_skills?.map((skill) => skill.name) ?? [];

  return {
    id: vacancy.id,
    name: vacancy.name,
    active: vacancy.archived !== true,
    archived: vacancy.archived === true,
    published_at: vacancy.published_at ?? null,
    salary,
    employer: normalizeIdName(vacancy.employer),
    area: normalizeIdName(vacancy.area),
    accredited_it_employer: isAccreditedItVacancy(vacancy),
    remote: isRemoteVacancy(vacancy),
    hybrid: isHybridVacancy(vacancy),
    employment: normalizeIdName(vacancy.employment),
    employment_form: normalizeIdName(vacancy.employment_form),
    schedule: normalizeIdName(vacancy.schedule),
    experience: normalizeIdName(vacancy.experience),
    work_format: vacancy.work_format?.map(normalizeIdName).filter(Boolean) ?? [],
    formalization: normalizeFormalization(vacancy),
    url: vacancy.alternate_url ?? vacancy.url ?? null,
    apply_url: vacancy.apply_alternate_url ?? vacancy.response_url ?? vacancy.alternate_url ?? null,
    roles: vacancy.professional_roles?.map((role) => role.name) ?? [],
    key_skills: keySkills,
    skills: keySkills,
    description_text: htmlToText(vacancy.description),
    snippet_text: snippetText(vacancy),
    contacts: normalizeContacts(vacancy.contacts),
    already_applied: alreadyApplied(vacancy),
  };
}

export function vacancySummary(vacancy: Vacancy): NormalizedVacancy {
  return normalizeVacancy(vacancy);
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

export function vacancySearchOptions(
  flags: Map<string, string>,
): VacancySearchOptions {
  const salaryFrom = optionalNumberFlag(flags, "salary-from");
  const salaryTo = optionalNumberFlag(flags, "salary-to");

  if (
    salaryFrom !== undefined &&
    salaryTo !== undefined &&
    salaryTo < salaryFrom
  ) {
    throw new Error("--salary-to must be greater than or equal to --salary-from");
  }

  return {
    text: optionalStringFlag(flags, "text"),
    area: optionalStringFlag(flags, "area"),
    remote: booleanFlag(flags, "remote"),
    hybrid: booleanFlag(flags, "hybrid"),
    employment: optionalStringFlag(flags, "employment"),
    experience: optionalStringFlag(flags, "experience"),
    salaryFrom,
    salaryTo,
    onlyAccredited: booleanFlag(flags, "only-accredited"),
    publishedAfter: optionalStringFlag(flags, "published-after"),
    page: numberFlag(flags, "page", 0),
    perPage: numberFlag(flags, "per-page", 20, { min: 1, max: 100 }),
    must: regexFlag(flags, "must"),
    reject: regexFlag(flags, "reject"),
  };
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

function normalizeSalary(vacancy: Vacancy): {
  from: number | null;
  to: number | null;
  currency: string | null;
  gross: boolean | null;
} {
  const salary = vacancy.salary_range ?? vacancy.salary ?? null;

  return {
    from: salary?.from ?? null,
    to: salary?.to ?? null,
    currency: salary?.currency ?? null,
    gross: salary?.gross ?? null,
  };
}

function normalizeIdName(value: IdName | null | undefined) {
  if (!value) return null;

  return {
    id: value.id ?? null,
    name: value.name ?? null,
    url: value.url ?? null,
  };
}

function normalizeContacts(contacts: Vacancy["contacts"]) {
  if (!contacts) return null;

  return {
    name: contacts.name ?? null,
    email: contacts.email ?? null,
    phones: (contacts.phones ?? []).map(normalizePhone),
  };
}

function normalizePhone(phone: ContactPhone) {
  return {
    country: phone.country ?? null,
    city: phone.city ?? null,
    number: phone.number ?? null,
    comment: phone.comment ?? null,
    formatted: phone.formatted ?? formatPhone(phone),
  };
}

function formatPhone(phone: ContactPhone): string | null {
  const parts = [phone.country, phone.city, phone.number].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

export function normalizeFormalization(vacancy: Vacancy): VacancyFormalization {
  const civilLawContracts = vacancy.civil_law_contracts ?? [];
  const civilLawText = civilLawContracts
    .map((contract) => `${contract.id ?? ""} ${contract.name ?? ""}`)
    .join(" ")
    .toLowerCase();
  const employmentText = [
    vacancy.employment?.id,
    vacancy.employment?.name,
    vacancy.employment_form?.id,
    vacancy.employment_form?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    labor_contract: vacancy.accept_labor_contract === true,
    gph: civilLawContracts.length > 0,
    project_work:
      employmentText.includes("project") || employmentText.includes("проект"),
    individual_entrepreneur:
      civilLawText.includes("individual_entrepreneur") ||
      civilLawText.includes("ип") ||
      civilLawText.includes("предприним"),
  };
}

function alreadyApplied(vacancy: Vacancy): boolean {
  return (
    vacancy.relations?.includes("got_response") === true ||
    (vacancy.negotiations_state !== undefined &&
      vacancy.negotiations_state !== null) ||
    (vacancy.employer_negotiations_state !== undefined &&
      vacancy.employer_negotiations_state !== null)
  );
}

function snippetText(vacancy: Vacancy): string {
  return htmlToText(
    [vacancy.snippet?.requirement, vacancy.snippet?.responsibility]
      .filter(Boolean)
      .join("\n"),
  );
}

function appendOptional(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
): void {
  if (value !== undefined && value !== "") params.append(key, value);
}

function optionalStringFlag(
  flags: Map<string, string>,
  key: string,
): string | undefined {
  const value = flags.get(key);
  return value === undefined || value === "" ? undefined : value;
}

function optionalNumberFlag(
  flags: Map<string, string>,
  key: string,
): number | undefined {
  const value = flags.get(key);
  if (value === undefined || value === "") return undefined;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid number for --${key}: ${value}`);
  }

  return parsed;
}

function booleanFlag(flags: Map<string, string>, key: string): boolean {
  if (!flags.has(key)) return false;

  const value = flags.get(key);
  return value !== "false" && value !== "0";
}

function regexFlag(
  flags: Map<string, string>,
  key: string,
): RegExp | undefined {
  const value = optionalStringFlag(flags, key);
  if (!value) return undefined;

  try {
    return new RegExp(value, "iu");
  } catch {
    throw new Error(`Invalid regex for --${key}: ${value}`);
  }
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

  const salary = normalizeSalary(vacancy);
  if (salary.from === null && salary.to === null) return false;

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
