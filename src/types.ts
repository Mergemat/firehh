export type IdName = {
  id?: string;
  name: string;
};

export type Vacancy = {
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
