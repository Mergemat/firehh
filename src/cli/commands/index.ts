import { authLoginCommand, authStatusCommand } from "./auth";
import {
  applicationsApplyCommand,
  applicationsListCommand,
  applicationsStatusCommand,
} from "./applications";
import { resumesForVacancyCommand, resumesListCommand } from "./resumes";
import {
  vacanciesSearchCommand,
  vacanciesSuitableCommand,
  vacancyViewCommand,
} from "./vacancies";
import type { CommandModule, CommandSpec } from "./types";

export const commandModules: CommandModule[] = [
  {
    scope: "auth",
    summary: "OAuth login and token storage",
    description:
      "Authorize HH once through browser capture and inspect token status.",
    commands: [authLoginCommand, authStatusCommand],
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
    summary: "Vacancy lookup and search",
    description:
      "Fetch vacancy details, run ordinary HH search, or search suitable vacancies by resume.",
    commands: [vacancyViewCommand, vacanciesSearchCommand, vacanciesSuitableCommand],
  },
  {
    scope: "applications",
    summary: "Apply to vacancies and inspect applications",
    description:
      "Read a cover letter, create HH negotiations, and inspect application status.",
    commands: [
      applicationsApplyCommand,
      applicationsStatusCommand,
      applicationsListCommand,
    ],
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
