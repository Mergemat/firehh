import {
  vacancySummary,
  type NormalizedVacancy,
  type VacancySearchOptions,
} from "../../hh/vacancies";
import type { VacancySearchResponse } from "../../types";
import { writeData } from "../output";
import type { CliContext } from "../types";

export type VacancySearchFormat = "json" | "tsv" | "md" | "jsonl";

export type VacancySearchQuery = {
  text: string | null;
  area: string | null;
  remote: boolean;
  hybrid: boolean;
  employment: string | null;
  experience: string | null;
  salary_from: number | null;
  salary_to: number | null;
  only_accredited: boolean;
  published_after: string | null;
  must: string | null;
  reject: string | null;
};

export function vacancySearchQuery(
  options: VacancySearchOptions,
  patterns: { must?: string; reject?: string },
): VacancySearchQuery {
  return {
    text: options.text ?? null,
    area: options.area ?? null,
    remote: options.remote,
    hybrid: options.hybrid,
    employment: options.employment ?? null,
    experience: options.experience ?? null,
    salary_from: options.salaryFrom ?? null,
    salary_to: options.salaryTo ?? null,
    only_accredited: options.onlyAccredited,
    published_after: options.publishedAfter ?? null,
    must: patterns.must || null,
    reject: patterns.reject || null,
  };
}

export function writeVacancySearchResult(
  context: CliContext,
  vacancies: VacancySearchResponse,
  options: VacancySearchOptions,
  format: VacancySearchFormat,
  patterns: { must?: string; reject?: string },
): void {
  const items = vacancies.items.map(vacancySummary);

  if (format === "jsonl") {
    for (const item of items) {
      context.io.stdout(`${JSON.stringify(item)}\n`);
    }
    return;
  }

  if (format === "tsv") {
    context.io.stdout(renderVacancyTsv(items));
    return;
  }

  if (format === "md") {
    context.io.stdout(renderVacancyMarkdown(items));
    return;
  }

  writeData(context, {
    query: vacancySearchQuery(options, patterns),
    found: vacancies.found,
    page: vacancies.page,
    pages: vacancies.pages,
    per_page: vacancies.per_page,
    matched_items: items.length,
    items,
  });
}

function renderVacancyTsv(items: NormalizedVacancy[]): string {
  const rows = vacancyTableRows(items);
  return [
    vacancyTableColumns.join("\t"),
    ...rows.map((row) =>
      vacancyTableColumns.map((column) => tsvCell(row[column])).join("\t"),
    ),
  ]
    .join("\n")
    .concat("\n");
}

function renderVacancyMarkdown(items: NormalizedVacancy[]): string {
  const rows = vacancyTableRows(items);
  const header = `| ${vacancyTableColumns.join(" | ")} |`;
  const separator = `| ${vacancyTableColumns.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (row) =>
      `| ${vacancyTableColumns.map((column) => markdownCell(row[column])).join(" | ")} |`,
  );

  return [header, separator, ...body].join("\n").concat("\n");
}

const vacancyTableColumns = [
  "id",
  "name",
  "employer",
  "area",
  "salary_from",
  "salary_to",
  "gross",
  "employment",
  "schedule",
  "experience",
  "accredited_it_employer",
  "formalization",
  "published_at",
  "url",
] as const;

type VacancyTableColumn = (typeof vacancyTableColumns)[number];
type VacancyTableRow = Record<VacancyTableColumn, string | number | boolean | null>;

function vacancyTableRows(items: NormalizedVacancy[]): VacancyTableRow[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    employer: item.employer?.name ?? null,
    area: item.area?.name ?? null,
    salary_from: item.salary.from,
    salary_to: item.salary.to,
    gross: item.salary.gross,
    employment: item.employment?.name ?? item.employment_form?.name ?? null,
    schedule: item.schedule?.name ?? null,
    experience: item.experience?.name ?? null,
    accredited_it_employer: item.accredited_it_employer,
    formalization: formalizationCell(item.formalization),
    published_at: item.published_at,
    url: item.url,
  }));
}

function formalizationCell(value: NormalizedVacancy["formalization"]): string {
  return [
    value.labor_contract ? "labor_contract" : "",
    value.gph ? "gph" : "",
    value.project_work ? "project_work" : "",
    value.individual_entrepreneur ? "individual_entrepreneur" : "",
  ]
    .filter(Boolean)
    .join(",");
}

function tsvCell(value: string | number | boolean | null): string {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ");
}

function markdownCell(value: string | number | boolean | null): string {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, " ");
}
