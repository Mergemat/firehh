import { CLI_NAME } from "../config";
import packageJson from "../../package.json";
import { commandModules } from "./commands";
import type { CommandModule, CommandOption, CommandSpec } from "./commands";

const globalOptions: CommandOption[] = [
  {
    name: "--help",
    summary: "Show help for a command or module",
  },
  {
    name: "--version",
    summary: "Show CLI version",
  },
];

export function renderHelp(): string {
  const modules = renderRows(
    commandModules.map((module) => [module.scope, module.summary]),
  );

  return `${CLI_NAME} - agent-ready HH.ru CLI

USAGE
  ${CLI_NAME} <module> <command> [flags]

COMMAND GROUPS
${modules}

GETTING STARTED
  ${CLI_NAME} auth login
  ${CLI_NAME} resumes list
  ${CLI_NAME} vacancies suitable <resume-id>
  ${CLI_NAME} vacancies view <vacancy-id>
  ${CLI_NAME} applications apply <vacancy-id> --resume <resume-id> --message-file cover-letter.txt

OUTPUT
  Command results are JSON on stdout by default.
  Interactive prompts, diagnostics, and errors are written to stderr.
  --help output is human-readable text.

FLAGS
${renderOptions(globalOptions)}

Use "${CLI_NAME} <module>" for module help and "${CLI_NAME} <module> <command> --help" for command help.
`;
}

export function renderModuleHelp(module: CommandModule): string {
  const commands = renderRows(
    module.commands.map((command) => [
      commandName(command),
      [
        command.help.summary,
        `${CLI_NAME} ${command.usage}`,
        ...(command.help.aliases?.map((alias) => `alias: ${CLI_NAME} ${alias}`) ??
          []),
      ],
    ]),
  );

  return `${CLI_NAME} ${module.scope} - ${module.summary}

${module.description ?? module.summary}

USAGE
  ${CLI_NAME} ${module.scope} <command> [flags]

COMMANDS
${commands}

FLAGS
${renderOptions(globalOptions)}
`;
}

export function renderCommandHelp(command: CommandSpec): string {
  const sections = [
    renderOptionSection([...(command.help.options ?? []), ...globalOptions]),
    renderAliasSection(command.help.aliases),
    renderExampleSection(command.help.examples),
  ].filter((section) => section.length > 0);

  return [
    `${CLI_NAME} ${commandPath(command)} - ${command.help.summary}`,
    "",
    command.help.description ?? command.help.summary,
    "",
    "USAGE",
    `  ${CLI_NAME} ${command.usage}`,
    ...sections,
  ].join("\n");
}

export function renderVersion(): string {
  return `${CLI_NAME} ${packageJson.version}\n`;
}

function renderOptionSection(options: CommandOption[]): string {
  if (options.length === 0) return "";

  return ["", "FLAGS", renderOptions(options)].join("\n");
}

function renderOptions(options: CommandOption[]): string {
  return renderRows(
    options.map((option) => [optionLabel(option), optionDescription(option)]),
  );
}

function renderAliasSection(aliases: string[] | undefined): string {
  if (!aliases?.length) return "";

  return ["", "ALIASES", ...aliases.map((alias) => `  ${CLI_NAME} ${alias}`)].join(
    "\n",
  );
}

function renderExampleSection(
  examples: CommandSpec["help"]["examples"],
): string {
  if (!examples?.length) return "";

  return [
    "",
    "EXAMPLES",
    ...examples.map((example) =>
      example.summary === undefined
        ? `  ${example.command}`
        : `  # ${example.summary}\n  ${example.command}`,
    ),
  ].join("\n");
}

function renderRows(rows: [string, string | string[]][]): string {
  if (rows.length === 0) return "";

  const width = Math.max(...rows.map(([left]) => left.length));

  return rows
    .map(([left, right]) => {
      const lines = Array.isArray(right) ? right : [right];
      const [first = "", ...rest] = lines;
      return [
        `  ${left.padEnd(width)}  ${first}`,
        ...rest.map((line) => `  ${" ".repeat(width)}  ${line}`),
      ].join("\n");
    })
    .join("\n");
}

function optionLabel(option: CommandOption): string {
  return [option.name, option.value].filter(Boolean).join(" ");
}

function optionDescription(option: CommandOption): string {
  return [
    option.summary,
    option.required ? "(required)" : undefined,
    option.defaultValue === undefined
      ? undefined
      : `(default ${option.defaultValue})`,
  ]
    .filter(Boolean)
    .join(" ");
}

function commandName(command: CommandSpec): string {
  return command.id.slice(command.id.indexOf(".") + 1);
}

function commandPath(command: CommandSpec): string {
  return command.id.replace(".", " ");
}
