#!/usr/bin/env bun

import { createInterface } from "node:readline/promises";
import { stdin as input, stderr as output } from "node:process";
import { loadLocalEnv } from "./config";
import { runCli } from "./cli/run";
import type { CliContext } from "./cli/types";

const terminal = createInterface({ input, output });

const context: CliContext = {
  env: await loadLocalEnv(),
  io: {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    question: (prompt) => terminal.question(prompt),
  },
};

try {
  process.exitCode = await runCli(process.argv.slice(2), context);
} finally {
  terminal.close();
}
