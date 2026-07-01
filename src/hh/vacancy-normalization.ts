import type { ContactPhone, IdName, Vacancy } from "../types";

export type VacancyFormalization = {
  labor_contract: boolean;
  gph: boolean;
  project_work: boolean;
  individual_entrepreneur: boolean;
};

export type NormalizedVacancy = ReturnType<typeof normalizeVacancy>;

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
