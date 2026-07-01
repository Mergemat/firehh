import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { EnvMap, IdName } from "../types";
import { hhFetch, hhJson } from "./client";
import { directResponseError, hhResponseError } from "./errors";

export type ApplicationsListOptions = {
  since?: string;
  page: number;
  perPage: number;
};

export type ApplicationSummary = ReturnType<typeof applicationSummary>;

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
    throw directResponseError(location);
  }

  const data = await response.json().catch(() => null);
  throw hhResponseError(response.status, data);
}

export async function applicationStatus(
  env: EnvMap,
  vacancyId: string,
): Promise<{
  vacancy_id: string;
  already_applied: boolean;
  items: ApplicationSummary[];
}> {
  const data = await getNegotiations(env, {
    vacancyId,
    page: 0,
    perPage: 50,
  });
  const items = extractApplicationItems(data).filter((item) =>
    matchesVacancy(item, vacancyId),
  );

  return {
    vacancy_id: vacancyId,
    already_applied: items.length > 0 || hasNegotiationCounters(data),
    items: items.map((item) => applicationSummary(item)),
  };
}

export async function listApplications(
  env: EnvMap,
  options: ApplicationsListOptions,
): Promise<{
  since: string | null;
  page: number;
  per_page: number;
  scanned_pages: number;
  items: ApplicationSummary[];
}> {
  const sinceDate = options.since ? parseDateFlag(options.since, "since") : null;
  const items: ApplicationLike[] = [];
  let page = options.page;
  let scannedPages = 0;

  while (true) {
    const data = await getNegotiations(env, {
      page,
      perPage: options.perPage,
      orderBy: "created_at",
      order: "desc",
    });
    const pageItems = extractApplicationItems(data);
    scannedPages += 1;

    items.push(
      ...pageItems.filter((item) =>
        sinceDate ? applicationCreatedAt(item) >= sinceDate : true,
      ),
    );

    if (!sinceDate) break;
    if (pageItems.length === 0) break;
    if (pageItems.every((item) => applicationCreatedAt(item) < sinceDate)) break;

    const pages = numberFromRecord(data, "pages");
    if (pages === null || page + 1 >= pages) break;

    page += 1;
  }

  return {
    since: options.since ?? null,
    page: options.page,
    per_page: options.perPage,
    scanned_pages: scannedPages,
    items: items.map((item) => applicationSummary(item)),
  };
}

type NegotiationsQuery = {
  vacancyId?: string;
  page: number;
  perPage: number;
  orderBy?: string;
  order?: string;
};

type ApplicationLike = {
  item: Record<string, unknown>;
  vacancy?: Record<string, unknown> | null;
};

async function getNegotiations(
  env: EnvMap,
  query: NegotiationsQuery,
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    page: String(query.page),
    per_page: String(query.perPage),
  });

  if (query.vacancyId) params.set("vacancy_id", query.vacancyId);
  if (query.orderBy) params.set("order_by", query.orderBy);
  if (query.order) params.set("order", query.order);

  return hhJson<Record<string, unknown>>(env, `/negotiations?${params.toString()}`);
}

function extractApplicationItems(data: Record<string, unknown>): ApplicationLike[] {
  const directItems = records(data.items).map((item) => ({
    item,
    vacancy: recordOrNull(item.vacancy),
  }));
  const vacancyItems = records(data.vacancies).flatMap((vacancy) =>
    records(vacancy.items).map((item) => ({ item, vacancy })),
  );

  return [...directItems, ...vacancyItems];
}

function applicationSummary(application: ApplicationLike) {
  const item = application.item;
  const vacancy = recordOrNull(item.vacancy) ?? application.vacancy ?? null;
  const resume = recordOrNull(item.resume);

  return {
    id: stringOrNull(item.id),
    created_at: stringOrNull(item.created_at),
    updated_at: stringOrNull(item.updated_at),
    state: normalizeIdName(recordOrNull(item.state)),
    employer_state: normalizeIdName(recordOrNull(item.employer_state)),
    has_updates: booleanOrNull(item.has_updates),
    viewed_by_opponent: booleanOrNull(item.viewed_by_opponent),
    vacancy: vacancySummary(vacancy),
    resume: resumeSummary(resume),
  };
}

function vacancySummary(vacancy: Record<string, unknown> | null) {
  if (!vacancy) return null;
  const employer = recordOrNull(vacancy.employer);

  return {
    id: stringOrNull(vacancy.id),
    name: stringOrNull(vacancy.name),
    employer: normalizeIdName(employer),
    archived: booleanOrNull(vacancy.archived),
    published_at: stringOrNull(vacancy.published_at),
    url: stringOrNull(vacancy.alternate_url) ?? stringOrNull(vacancy.url),
    apply_url:
      stringOrNull(vacancy.apply_alternate_url) ??
      stringOrNull(vacancy.response_url) ??
      stringOrNull(vacancy.alternate_url),
  };
}

function resumeSummary(resume: Record<string, unknown> | null) {
  if (!resume) return null;

  return {
    id: stringOrNull(resume.id),
    title: stringOrNull(resume.title),
    url: stringOrNull(resume.alternate_url) ?? stringOrNull(resume.url),
  };
}

function matchesVacancy(application: ApplicationLike, vacancyId: string): boolean {
  const vacancy = recordOrNull(application.item.vacancy) ?? application.vacancy;
  const foundId = vacancy ? stringOrNull(vacancy.id) : null;
  return foundId === null || foundId === vacancyId;
}

function hasNegotiationCounters(data: Record<string, unknown>): boolean {
  return (
    sumCollectionCounters(records(data.collections)) > 0 ||
    sumCollectionCounters(records(data.generated_collections)) > 0 ||
    (numberFromRecord(data, "found") !== 0 && numberFromRecord(data, "found") !== null)
  );
}

function sumCollectionCounters(collections: Record<string, unknown>[]): number {
  return collections.reduce((total, collection) => {
    const counters = recordOrNull(collection.counters);
    const ownTotal = counters ? numberFromRecord(counters, "total") ?? 0 : 0;
    return total + ownTotal + sumCollectionCounters(records(collection.sub_collections));
  }, 0);
}

function applicationCreatedAt(application: ApplicationLike): number {
  const value = stringOrNull(application.item.created_at);
  return value ? Date.parse(value) : 0;
}

function parseDateFlag(value: string, flag: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`Invalid date for --${flag}: ${value}`);
  return parsed;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeIdName(value: Record<string, unknown> | null): IdName | null {
  if (!value) return null;
  const name = stringOrNull(value.name);
  if (!name) return null;

  return {
    id: stringOrNull(value.id),
    name,
    url: stringOrNull(value.url) ?? undefined,
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function numberFromRecord(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === "number" ? value : null;
}
