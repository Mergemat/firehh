#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cliPath = join(dirname(fileURLToPath(import.meta.url)), "../src/firehh.ts");
const result = spawnSync("bun", [cliPath, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (result.error) {
  if (result.error.message.includes("ENOENT")) {
    console.error("firehh requires Bun. Install it from https://bun.sh/");
    process.exit(1);
  }

  console.error(result.error.message);
  process.exit(1);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exit(result.status ?? 0);
