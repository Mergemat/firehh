export type IdName = {
  id?: string | null;
  name: string;
  url?: string;
};

export type Salary = {
  from: number | null;
  to: number | null;
  currency: string | null;
  gross?: boolean | null;
};

export type ContactPhone = {
  country?: string | null;
  city?: string | null;
  number?: string | null;
  comment?: string | null;
  formatted?: string | null;
};

export type Vacancy = {
  id: string;
  name: string;
  archived?: boolean | null;
  area?: IdName;
  employer?: IdName & {
    accredited_it_employer?: boolean;
    trusted?: boolean;
    alternate_url?: string;
  };
  salary?: Salary | null;
  salary_range?: Salary | null;
  experience?: IdName;
  employment?: IdName;
  employment_form?: IdName & {
    duration?: string;
  };
  schedule?: IdName;
  work_format?: IdName[];
  work_schedule_by_days?: IdName[];
  working_hours?: IdName[];
  professional_roles?: IdName[];
  key_skills?: { name: string }[];
  alternate_url?: string;
  apply_alternate_url?: string;
  response_url?: string | null;
  description?: string;
  published_at?: string;
  accept_labor_contract?: boolean | null;
  civil_law_contracts?: IdName[] | null;
  contacts?: {
    name?: string | null;
    email?: string | null;
    phones?: ContactPhone[] | null;
  } | null;
  relations?: (string | null)[];
  snippet?: {
    requirement?: string | null;
    responsibility?: string | null;
  };
  negotiations_state?: IdName | null;
  employer_negotiations_state?: IdName | null;
};

export type Resume = {
  id: string;
  title: string;
  status?: IdName;
  area?: IdName;
  updated_at?: string;
  total_experience?: {
    months: number;
  };
};

export type ResumesResponse = {
  items: Resume[];
  found: number;
};

export type VacancySearchResponse = {
  items: Vacancy[];
  found: number;
  page: number;
  pages: number;
  per_page: number;
  scanned_pages?: number;
  matched_items?: number;
};

export type SuitableResume = Resume & {
  finished?: boolean;
  requires_completion?: boolean;
};

export type SuitableResumesResponse = {
  items: SuitableResume[];
  found?: number;
  overall?: {
    already_applied?: number;
    not_published?: number;
    unavailable?: number;
  };
};

export type TokenFile = {
  access_token: string;
  token_type?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
};

export type EnvMap = Record<string, string | undefined>;
