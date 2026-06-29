import { authLoginCommand, authStatusCommand } from "./auth";
import { applicationsApplyCommand } from "./applications";
import { resumesForVacancyCommand, resumesListCommand } from "./resumes";
import { vacanciesSuitableCommand, vacancyViewCommand } from "./vacancies";
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
    summary: "Vacancy lookup and suitable search",
    description:
      "Fetch vacancy details or search HH suitable vacancies by resume.",
    commands: [vacancyViewCommand, vacanciesSuitableCommand],
  },
  {
    scope: "applications",
    summary: "Apply to vacancies",
    description:
      "Read a cover letter and create HH negotiations without local vacancy filters.",
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
