import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/cli/args";
import { commandModules, commandSpecs } from "../src/cli/commands";
import { renderHelp, renderModuleHelp } from "../src/cli/help";

describe("cli architecture", () => {
  test("commands are declared through scoped modules", () => {
    expect(
      commandModules.map((module) => ({
        scope: module.scope,
        commands: module.commands.map((command) => command.id),
      })),
    ).toEqual([
      {
        scope: "auth",
        commands: ["auth.login", "auth.url", "auth.code", "auth.status"],
      },
      {
        scope: "resumes",
        commands: ["resumes.list", "resumes.for-vacancy"],
      },
      {
        scope: "vacancies",
        commands: ["vacancies.view", "vacancies.suitable"],
      },
      {
        scope: "applications",
        commands: ["applications.apply"],
      },
    ]);
  });

  test("all commands have help and unique ids", () => {
    const ids = commandSpecs.map((command) => command.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(commandSpecs.every((command) => command.usage.length > 0)).toBe(true);
    expect(commandSpecs.every((command) => command.help.summary.length > 0)).toBe(
      true,
    );
  });

  test("help points users to scoped modules and JSON output", () => {
    expect(renderHelp()).toContain("firehh <module> <command> [flags]");
    expect(renderHelp()).toContain("Command results are JSON on stdout");
    expect(renderModuleHelp(commandModules[0])).toContain("firehh auth login");
  });

  test("parser separates flags from positional args", () => {
    expect(
      parseArgs([
        "applications",
        "apply",
        "123",
        "--resume",
        "resume-id",
        "--dry-run",
      ]),
    ).toEqual({
      raw: [
        "applications",
        "apply",
        "123",
        "--resume",
        "resume-id",
        "--dry-run",
      ],
      command: "applications",
      subcommand: "apply",
      positionals: ["applications", "apply", "123"],
      flags: new Map([
        ["resume", "resume-id"],
        ["dry-run", ""],
      ]),
    });
  });
});
