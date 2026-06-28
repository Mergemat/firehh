import type { EnvMap } from "../types";

export type CliIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  question: (prompt: string) => Promise<string>;
};

export type CliContext = {
  env: EnvMap;
  io: CliIo;
};
