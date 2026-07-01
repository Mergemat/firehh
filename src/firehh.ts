#!/usr/bin/env bun

import { createInterface } from "node:readline/promises";
import { stdin as input, stderr as output } from "node:process";
import { loadLocalEnv } from "./config";
import { runCli } from "./cli/run";
import type { CliContext } from "./cli/types";
import { shouldCheckForUpdate, writeUpdateNotice } from "./update-check";

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
  const args = process.argv.slice(2);
  const exitCode = await runCli(args, context);
  process.exitCode = exitCode;

  if (shouldCheckForUpdate(args, exitCode)) {
    await writeUpdateNotice(context.env, context.io.stderr);
  }
} finally {
  terminal.close();
}
