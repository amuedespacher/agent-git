import { cosmiconfig } from "cosmiconfig";
import { z } from "zod";

import type { AppConfig } from "../types.js";

const configSchema = z.object({
  provider: z
    .object({
      kind: z.enum(["heuristic", "openai"]).default("heuristic"),
      model: z.string().min(1).default("local-heuristic"),
      apiKeyEnv: z.string().min(1).default("OPENAI_API_KEY"),
      baseUrl: z.string().url().optional(),
    })
    .default({
      kind: "heuristic",
      model: "local-heuristic",
      apiKeyEnv: "OPENAI_API_KEY",
    }),
  commitStyle: z.enum(["conventional", "sentence"]).default("conventional"),
  branchPattern: z
    .string()
    .min(1)
    .default("^(feature|fix|chore|docs|refactor|test)/[a-z0-9._-]+$"),
  safetyLevel: z.enum(["strict", "balanced", "permissive"]).default("balanced"),
  verbosity: z.enum(["minimal", "normal", "detailed"]).default("normal"),
});

export const defaultConfig: AppConfig = configSchema.parse({});

export async function loadConfig(cwd: string): Promise<AppConfig> {
  const explorer = cosmiconfig("git-agent");
  const result = await explorer.search(cwd);

  if (!result?.config) {
    return defaultConfig;
  }

  return configSchema.parse(result.config);
}
