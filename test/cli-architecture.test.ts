import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/cli/args";
import { commandModules, commandSpecs } from "../src/cli/commands";
import { renderHelp, renderModuleHelp } from "../src/cli/help";
import { runCli } from "../src/cli/run";
import packageJson from "../package.json";

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
        commands: ["auth.login", "auth.status"],
      },
      {
        scope: "resumes",
        commands: ["resumes.list", "resumes.for-vacancy"],
      },
      {
        scope: "vacancies",
        commands: ["vacancies.view", "vacancies.search", "vacancies.suitable"],
      },
      {
        scope: "applications",
        commands: [
          "applications.apply",
          "applications.status",
          "applications.list",
        ],
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
    expect(renderModuleHelp(commandModules[0])).not.toContain("auth url");
    expect(renderModuleHelp(commandModules[0])).not.toContain("auth code");
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

  test("version is available as a global flag", async () => {
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["--version"], {
      env: {},
      io: {
        stdout: (text) => {
          stdout += text;
        },
        stderr: (text) => {
          stderr += text;
        },
        question: async () => "",
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toBe(`firehh ${packageJson.version}\n`);
    expect(stderr).toBe("");
  });
});
