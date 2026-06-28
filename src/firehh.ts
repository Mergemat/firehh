#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

type IdName = {
  id?: string;
  name: string;
};

type Vacancy = {
  id: string;
  name: string;
  area?: IdName;
  employer?: IdName & {
    accredited_it_employer?: boolean;
    trusted?: boolean;
  };
  salary?: {
    from: number | null;
    to: number | null;
    currency: string;
    gross?: boolean;
  } | null;
  experience?: IdName;
  employment?: IdName;
  schedule?: IdName;
  work_format?: IdName[];
  professional_roles?: IdName[];
  key_skills?: { name: string }[];
  alternate_url?: string;
  description?: string;
  published_at?: string;
};

type Resume = {
  id: string;
  title: string;
  status?: IdName;
  area?: IdName;
  updated_at?: string;
  total_experience?: {
    months: number;
  };
};

type ResumesResponse = {
  items: Resume[];
  found: number;
};

type VacancySearchResponse = {
  items: Vacancy[];
  found: number;
  page: number;
  pages: number;
  per_page: number;
  scanned_pages?: number;
  matched_items?: number;
};

type SuitableResume = Resume & {
  finished?: boolean;
  requires_completion?: boolean;
};

type SuitableResumesResponse = {
  items: SuitableResume[];
  found?: number;
  overall?: {
    already_applied?: number;
    not_published?: number;
    unavailable?: number;
  };
};

type TokenFile = {
  access_token: string;
  token_type?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
};

type EnvMap = Record<string, string>;

const API_BASE_URL = "https://api.hh.ru";
const AUTH_URL = "https://hh.ru/oauth/authorize";
const TOKEN_URL = "https://hh.ru/oauth/token";
const DEFAULT_REDIRECT_URI = "hhandroid://oauthresponse";
const DEFAULT_TOKEN_FILE = join(process.cwd(), ".hh-token.json");
const DEFAULT_SUITABLE_TEXT = "Frontend OR React OR Next.js";
const DEVELOPER_PROFESSIONAL_ROLE_ID = "96";
const CLI_NAME = "firehh";

const args = process.argv.slice(2);
const command = args[0];
const asJson = args.includes("--json");
const help = args.includes("--help") || args.includes("-h");

function usage(): string {
  return [
    "Usage:",
    `  ${CLI_NAME} <vacancy-id> [--json]`,
    `  ${CLI_NAME} resumes [--json]`,
    `  ${CLI_NAME} suitable [resume-id] [options]`,
    `  ${CLI_NAME} vacancy-resumes <vacancy-id> [--json]`,
    `  ${CLI_NAME} apply <vacancy-id> --resume <resume-id> --message-file <path>`,
    `  ${CLI_NAME} apply <vacancy-id> --resume <resume-id> --message '<text>'`,
    `  ${CLI_NAME} apply <vacancy-id> --resume <resume-id> --message-file <path> --dry-run`,
    `  ${CLI_NAME} auth-url`,
    `  ${CLI_NAME} auth-code <code-or-redirect-url>`,
    `  ${CLI_NAME} token`,
    "",
    "Suitable options:",
    "  --page <n>          HH page, zero-based. Default: 0",
    "  --per-page <n>      Number of shown frontend matches. Default: 20, max: 100",
    "  --scan-pages <n>    HH API pages to scan for frontend matches. Default: 5, max: 20",
    "  --text '<query>'    Override search text. Default: Frontend OR React OR Next.js",
    "  --json              Print raw JSON response",
    "",
    "Built-in suitable filters:",
    "  resume=<your resume>, professional_role=96, label=accredited_it, schedule=remote",
    "  local title filter keeps Frontend/React/Next.js and removes support/backend/fullstack/mobile-adjacent stacks",
    "",
    "Examples:",
    `  ${CLI_NAME} suitable`,
    `  ${CLI_NAME} suitable --page 1 --per-page 20`,
    `  ${CLI_NAME} suitable --text 'Senior Frontend React'`,
    `  ${CLI_NAME} apply 133561763 --resume 01cf346eff09dc583b0039ed1f414230386259 --message-file 'cover-letter.docx' --dry-run`,
    "",
    "Env:",
    "  HH_CLIENT_ID, HH_CLIENT_SECRET are read from .env, .env.local or shell",
    "  HH_TOKEN_FILE overrides token file path",
    "  HH_SUITABLE_TEXT overrides default suitable search text",
  ].join("\n");
}

function parseEnv(content: string): EnvMap {
  const env: EnvMap = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

async function loadLocalEnv(): Promise<EnvMap> {
  const env: EnvMap = {};

  for (const path of [".env", ".env.local"]) {
    if (!existsSync(path)) continue;
    Object.assign(env, parseEnv(await readFile(path, "utf8")));
  }

  return env;
}

function fromEnv(env: EnvMap, key: string): string | undefined {
  return process.env[key] || env[key];
}

function tokenFilePath(env: EnvMap): string {
  return fromEnv(env, "HH_TOKEN_FILE") || DEFAULT_TOKEN_FILE;
}

function optionValue(name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }

  return value;
}

function numberOption(name: string, fallback: number): number {
  const raw = optionValue(name);
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid number for ${name}: ${raw}`);
  }

  return parsed;
}

async function readToken(env: EnvMap): Promise<TokenFile | null> {
  const rawToken =
    fromEnv(env, "HH_ACCESS_TOKEN") || fromEnv(env, "HH_TOKEN") || null;

  if (rawToken) {
    try {
      return JSON.parse(rawToken) as TokenFile;
    } catch {
      return { access_token: rawToken };
    }
  }

  try {
    return JSON.parse(await readFile(tokenFilePath(env), "utf8")) as TokenFile;
  } catch {
    return null;
  }
}

async function saveToken(env: EnvMap, token: TokenFile): Promise<TokenFile> {
  const expiresIn = token.expires_in ?? 0;
  const tokenWithExpiry: TokenFile = {
    ...token,
    expires_at: token.expires_at ?? Date.now() + expiresIn * 1000,
  };

  const path = tokenFilePath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(tokenWithExpiry, null, 2)}\n`, {
    mode: 0o600,
  });

  return tokenWithExpiry;
}

function requireClientCredentials(env: EnvMap): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId = fromEnv(env, "HH_CLIENT_ID");
  const clientSecret = fromEnv(env, "HH_CLIENT_SECRET");
  const redirectUri = fromEnv(env, "HH_REDIRECT_URI") || DEFAULT_REDIRECT_URI;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing HH_CLIENT_ID or HH_CLIENT_SECRET. Put them into .env.local.",
    );
  }

  return { clientId, clientSecret, redirectUri };
}

function getAuthUrl(env: EnvMap): string {
  const { clientId, redirectUri } = requireClientCredentials(env);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
  });

  return `${AUTH_URL}?${params.toString()}`;
}

function extractCode(input: string): string {
  if (!input.includes("://") && !input.includes("?")) {
    return input;
  }

  const url = new URL(input);
  const code = url.searchParams.get("code");

  if (!code) {
    throw new Error("Redirect URL does not contain ?code=...");
  }

  return code;
}

async function exchangeCodeForToken(
  env: EnvMap,
  codeOrUrl: string,
): Promise<TokenFile> {
  const { clientId, clientSecret, redirectUri } = requireClientCredentials(env);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code: extractCode(codeOrUrl),
      redirect_uri: redirectUri,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `HH token exchange error ${response.status}: ${JSON.stringify(data ?? {})}`,
    );
  }

  return saveToken(env, data as TokenFile);
}

async function refreshToken(env: EnvMap, token: TokenFile): Promise<TokenFile> {
  if (!token.refresh_token) {
    throw new Error("Token is expired and has no refresh_token.");
  }

  const { clientId, clientSecret } = requireClientCredentials(env);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `HH token refresh error ${response.status}: ${JSON.stringify(data ?? {})}`,
    );
  }

  return saveToken(env, data as TokenFile);
}

async function getValidToken(env: EnvMap): Promise<TokenFile | null> {
  const token = await readToken(env);
  if (!token?.access_token) return null;

  if (!token.expires_at || Date.now() < token.expires_at - 5 * 60 * 1000) {
    return token;
  }

  return refreshToken(env, token);
}

async function requireValidToken(env: EnvMap): Promise<TokenFile> {
  const token = await getValidToken(env);

  if (!token?.access_token) {
    throw new Error(
      [
        "No HH OAuth token found.",
        "",
        "Run:",
        `  ${CLI_NAME} auth-url`,
        "Open printed URL, login, copy redirect URL or code, then run:",
        `  ${CLI_NAME} auth-code '<code-or-redirect-url>'`,
      ].join("\n"),
    );
  }

  return token;
}

async function hhFetch(
  env: EnvMap,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await requireValidToken(env);
  const headers = new Headers(init.headers);

  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token.access_token}`);
  headers.set("User-Agent", "firehh/0.1");
  headers.set("HH-User-Agent", "firehh/0.1");

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
}

async function hhJson<T>(
  env: EnvMap,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await hhFetch(env, path, init);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `HH API error ${response.status}: ${JSON.stringify(data ?? {})}`,
    );
  }

  return data as T;
}

function formatSalary(vacancy: Vacancy): string {
  if (!vacancy.salary) return "not specified";

  const { from, to, currency, gross } = vacancy.salary;
  const tax = gross === true ? " gross" : gross === false ? " net" : "";

  if (from && to) return `${from}-${to} ${currency}${tax}`;
  if (from) return `from ${from} ${currency}${tax}`;
  if (to) return `to ${to} ${currency}${tax}`;

  return "not specified";
}

function htmlToText(html = ""): string {
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

async function getVacancy(env: EnvMap, id: string): Promise<Vacancy> {
  return hhJson<Vacancy>(env, `/vacancies/${id}`);
}

function isAccreditedItVacancy(vacancy: Vacancy): boolean {
  return vacancy.employer?.accredited_it_employer === true;
}

function isRemoteVacancy(vacancy: Vacancy): boolean {
  return (
    vacancy.schedule?.id === "remote" ||
    vacancy.schedule?.name.toLowerCase().includes("удален") === true ||
    vacancy.work_format?.some((format) => format.id === "REMOTE") === true
  );
}

function isFrontendVacancy(vacancy: Vacancy): boolean {
  const title = vacancy.name.toLowerCase();

  return (
    /front[\s-]?end|фронт|react|next\.?js/.test(title) &&
    !/react native|native|vue|angular|backend|back[\s-]?end|full[\s-]?stack|fullstack|golang|go-разработчик|java разработчик|java developer|c#|\.net|php|laravel|python/.test(
      title,
    )
  );
}

function formatAccreditation(vacancy: Vacancy): string {
  return isAccreditedItVacancy(vacancy)
    ? "accredited IT employer"
    : "not accredited IT employer";
}

async function requireEligibleVacancy(
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

async function getResumes(env: EnvMap): Promise<ResumesResponse> {
  return hhJson<ResumesResponse>(env, "/resumes/mine");
}

async function getSingleResumeId(env: EnvMap): Promise<string> {
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
      `  ${CLI_NAME} suitable <resume-id>`,
      "",
      ...resumes.items.map((resume) => `  ${resume.id} - ${resume.title}`),
    ].join("\n"),
  );
}

async function searchSuitableVacancies(
  env: EnvMap,
  resumeId: string,
): Promise<VacancySearchResponse> {
  const text =
    optionValue("--text") || fromEnv(env, "HH_SUITABLE_TEXT") || DEFAULT_SUITABLE_TEXT;
  const requestedPage = numberOption("--page", 0);
  const displayPerPage = Math.min(numberOption("--per-page", 20), 100);
  const scanPages = Math.min(numberOption("--scan-pages", 5), 20);
  const matchedItems: Vacancy[] = [];
  let firstResponse: VacancySearchResponse | null = null;
  let scannedPages = 0;

  for (let page = requestedPage; page < requestedPage + scanPages; page++) {
    const params = new URLSearchParams({
      resume: resumeId,
      text,
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
    scannedPages++;

    matchedItems.push(
      ...response.items.filter(
        (vacancy) =>
          isAccreditedItVacancy(vacancy) &&
          isRemoteVacancy(vacancy) &&
          isFrontendVacancy(vacancy),
      ),
    );

    if (matchedItems.length >= displayPerPage || page >= response.pages - 1) {
      break;
    }
  }

  if (!firstResponse) {
    throw new Error("HH returned no vacancy search response.");
  }

  return {
    ...firstResponse,
    per_page: displayPerPage,
    items: matchedItems.slice(0, displayPerPage),
    scanned_pages: scannedPages,
    matched_items: matchedItems.length,
  };
}

async function getSuitableResumes(
  env: EnvMap,
  vacancyId: string,
): Promise<SuitableResumesResponse> {
  return hhJson<SuitableResumesResponse>(
    env,
    `/vacancies/${vacancyId}/suitable_resumes`,
  );
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

async function readCoverLetter(): Promise<string> {
  const inlineMessage = optionValue("--message");
  if (inlineMessage) return inlineMessage.trim();

  const messageFile = optionValue("--message-file") || optionValue("--letter-file");
  if (messageFile) return readMessageFile(messageFile);

  throw new Error(
    "Missing cover letter. Use --message '<text>' or --message-file <path>.",
  );
}

async function applyToVacancy(
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

async function printTokenStatus(env: EnvMap): Promise<void> {
  const token = await readToken(env);
  const path = tokenFilePath(env);

  if (!token?.access_token) {
    console.log(`No token found. Token file: ${path}`);
    return;
  }

  console.log(`Token file: ${path}`);
  console.log(`Access token: present`);
  console.log(`Refresh token: ${token.refresh_token ? "present" : "missing"}`);
  console.log(
    `Expires: ${
      token.expires_at ? new Date(token.expires_at).toISOString() : "unknown"
    }`,
  );
}

function printResumes(resumes: Resume[]): void {
  for (const resume of resumes) {
    const details = [
      resume.status?.name,
      resume.area?.name,
      resume.updated_at ? `updated ${resume.updated_at}` : null,
    ].filter(Boolean);

    console.log(`${resume.id} - ${resume.title}`);
    if (details.length) {
      console.log(`  ${details.join(" | ")}`);
    }
  }
}

async function main(): Promise<void> {
  const env = await loadLocalEnv();

  if (help || !command) {
    console.error(usage());
    process.exit(help ? 0 : 1);
  }

  if (command === "auth-url") {
    console.log(getAuthUrl(env));
    return;
  }

  if (command === "auth-code") {
    const codeOrUrl = args[1];
    if (!codeOrUrl) {
      throw new Error(`Usage: ${CLI_NAME} auth-code <code-or-url>`);
    }

    const token = await exchangeCodeForToken(env, codeOrUrl);
    console.log(`HH token saved: ${tokenFilePath(env)}`);
    console.log(
      `Expires: ${
        token.expires_at ? new Date(token.expires_at).toISOString() : "unknown"
      }`,
    );
    return;
  }

  if (command === "token") {
    await printTokenStatus(env);
    return;
  }

  if (command === "resumes") {
    const resumes = await getResumes(env);
    if (asJson) {
      console.log(JSON.stringify(resumes, null, 2));
      return;
    }

    console.log(`Found resumes: ${resumes.found}`);
    printResumes(resumes.items);
    return;
  }

  if (command === "suitable") {
    const explicitResumeId = args[1]?.startsWith("--") ? null : args[1];
    const resumeId = explicitResumeId || (await getSingleResumeId(env));

    if (/^\d+$/.test(resumeId)) {
      throw new Error(
        [
          "suitable searches vacancies for a resume, but this looks like a vacancy id.",
          "Use:",
          `  ${CLI_NAME} suitable`,
          "or:",
          `  ${CLI_NAME} suitable <resume-id>`,
          "",
          "To check resumes for a vacancy, use:",
          `  ${CLI_NAME} vacancy-resumes <vacancy-id>`,
        ].join("\n"),
      );
    }

    const vacancies = await searchSuitableVacancies(env, resumeId);
    if (asJson) {
      console.log(JSON.stringify(vacancies, null, 2));
      return;
    }

    console.log(`Resume: ${resumeId}`);
    console.log(
      `Filter: ${optionValue("--text") || fromEnv(env, "HH_SUITABLE_TEXT") || DEFAULT_SUITABLE_TEXT}, developer role, accredited IT employers only, remote only`,
    );
    console.log(
      `Found vacancies: ${vacancies.found} | page ${vacancies.page + 1}/${vacancies.pages}`,
    );
    console.log(
      `Shown frontend matches: ${vacancies.items.length} | scanned API pages: ${vacancies.scanned_pages ?? 1}`,
    );

    for (const vacancy of vacancies.items) {
      console.log(`${vacancy.id} - ${vacancy.name}`);
      console.log(
        `  ${vacancy.employer?.name ?? "Unknown employer"} | ${vacancy.area?.name ?? "Unknown area"} | ${vacancy.schedule?.name ?? "Unknown schedule"} | ${formatAccreditation(vacancy)}`,
      );
      console.log(`  ${vacancy.alternate_url ?? ""}`);
    }
    return;
  }

  if (command === "vacancy-resumes") {
    const vacancyId = args[1];
    if (!vacancyId) {
      throw new Error(
        `Usage: ${CLI_NAME} vacancy-resumes <vacancy-id> [--json]`,
      );
    }

    const vacancy = await requireEligibleVacancy(env, vacancyId);
    const suitable = await getSuitableResumes(env, vacancyId);
    if (asJson) {
      console.log(
        JSON.stringify(
          {
            vacancy,
            accredited_it_employer: true,
            suitable_resumes: suitable,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`Vacancy: ${vacancy.name}`);
    console.log(`Employer: ${vacancy.employer?.name ?? "Unknown employer"}`);
    console.log(`Accreditation: ${formatAccreditation(vacancy)}`);

    if (suitable.overall?.already_applied) {
      console.log(`Already applied: ${suitable.overall.already_applied}`);
    }

    console.log(`Suitable resumes: ${suitable.items.length}`);
    printResumes(suitable.items);
    return;
  }

  if (command === "apply") {
    const vacancyId = args[1];
    const resumeId = optionValue("--resume") || optionValue("--resume-id");
    const dryRun = args.includes("--dry-run");

    if (!vacancyId || !resumeId) {
      throw new Error(
        `Usage: ${CLI_NAME} apply <vacancy-id> --resume <resume-id> --message-file <path>`,
      );
    }

    const vacancy = await requireEligibleVacancy(env, vacancyId);
    const message = await readCoverLetter();
    if (!message) {
      throw new Error("Cover letter is empty.");
    }

    if (dryRun) {
      console.log("Dry run. No application sent.");
      console.log(`Vacancy: ${vacancy.name}`);
      console.log(`Employer: ${vacancy.employer?.name ?? "Unknown employer"}`);
      console.log(`Accreditation: ${formatAccreditation(vacancy)}`);
      console.log(`Resume: ${resumeId}`);
      console.log(`Cover letter chars: ${message.length}`);
      console.log("\nCover letter:\n");
      console.log(message);
      return;
    }

    const result = await applyToVacancy(env, vacancyId, resumeId, message);
    console.log("Applied successfully.");
    if (result.id) console.log(`Negotiation id: ${result.id}`);
    if (result.location) console.log(`Location: ${result.location}`);
    return;
  }

  const vacancyId = command;
  const vacancy = await getVacancy(env, vacancyId);

  if (asJson) {
    console.log(JSON.stringify(vacancy, null, 2));
    return;
  }

  console.log(vacancy.name);
  console.log(
    `${vacancy.employer?.name ?? "Unknown employer"} - ${vacancy.area?.name ?? "Unknown area"}`,
  );
  console.log(`Accreditation: ${formatAccreditation(vacancy)}`);
  console.log(`Salary: ${formatSalary(vacancy)}`);
  console.log(`Experience: ${vacancy.experience?.name ?? "not specified"}`);
  console.log(`Employment: ${vacancy.employment?.name ?? "not specified"}`);
  console.log(`Schedule: ${vacancy.schedule?.name ?? "not specified"}`);

  if (vacancy.published_at) {
    console.log(`Published: ${vacancy.published_at}`);
  }

  if (vacancy.alternate_url) {
    console.log(`URL: ${vacancy.alternate_url}`);
  }

  if (vacancy.professional_roles?.length) {
    console.log(
      `Roles: ${vacancy.professional_roles.map((role) => role.name).join(", ")}`,
    );
  }

  if (vacancy.key_skills?.length) {
    console.log(
      `Skills: ${vacancy.key_skills.map((skill) => skill.name).join(", ")}`,
    );
  }

  const description = htmlToText(vacancy.description);
  if (description) {
    console.log("\nDescription:\n");
    console.log(description);
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
