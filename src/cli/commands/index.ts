import {
  authCodeCommand,
  authLoginCommand,
  authStatusCommand,
  authUrlCommand,
} from "./auth";
import { applicationsApplyCommand } from "./applications";
import { resumesForVacancyCommand, resumesListCommand } from "./resumes";
import { vacanciesSuitableCommand, vacancyViewCommand } from "./vacancies";
import type { CommandModule, CommandSpec } from "./types";

export const commandModules: CommandModule[] = [
  {
    scope: "auth",
    summary: "OAuth login and token storage",
    description:
      "Authorize HH once, exchange OAuth codes, and inspect local token status.",
    commands: [
      authLoginCommand,
      authUrlCommand,
      authCodeCommand,
      authStatusCommand,
    ],
  },
  {
    scope: "resumes",
    summary: "Your resumes and vacancy-fit checks",
    description:
      "List local account resumes or inspect which resumes can apply to a vacancy.",
    commands: [resumesListCommand, resumesForVacancyCommand],
  },
  {
    scope: "vacancies",
    summary: "Vacancy lookup and suitable search",
    description:
      "Fetch vacancy details or search suitable remote accredited frontend vacancies.",
    commands: [vacancyViewCommand, vacanciesSuitableCommand],
  },
  {
    scope: "applications",
    summary: "Apply to vacancies",
    description:
      "Validate eligibility, read a cover letter, and create HH negotiations.",
    commands: [applicationsApplyCommand],
  },
];

export const commandSpecs: CommandSpec[] = commandModules.flatMap(
  (module) => module.commands,
);

export type {
  CommandExample,
  CommandInput,
  CommandModule,
  CommandOption,
  CommandSpec,
} from "./types";
