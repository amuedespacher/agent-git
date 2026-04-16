import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { cosmiconfig } from "cosmiconfig";
import { z } from "zod";

import type { AppConfig } from "../types.js";

export const defaultOpenAIModel = "gpt-4.1-mini";

type ConfigInput = Partial<AppConfig> & {
  provider?: Partial<AppConfig["provider"]>;
};

const configSchema = z.object({
  provider: z
    .object({
      kind: z.enum(["openai"]).default("openai"),
      model: z.string().min(1).default(defaultOpenAIModel),
      apiKeyEnv: z.string().min(1).default("OPENAI_API_KEY"),
      apiKey: z.string().min(1).optional(),
      baseUrl: z.string().url().optional(),
    })
    .default({
      kind: "openai",
      model: defaultOpenAIModel,
      apiKeyEnv: "OPENAI_API_KEY",
    }),
  commitStyle: z.enum(["conventional", "sentence"]).default("conventional"),
  branchPattern: z
    .string()
    .min(1)
    .default("^(feature|fix|chore|docs|refactor|test)/[a-z0-9._-]+$"),
  safetyLevel: z.enum(["strict", "balanced", "permissive"]).default("balanced"),
  verbosity: z.enum(["minimal", "normal", "detailed"]).default("normal"),
  uiLabels: z
    .object({
      assistant: z.string().default("dr. git"),
      user: z.string().default("me"),
    })
    .default({
      assistant: "dr. git",
      user: "me",
    }),
});

export const defaultConfig: AppConfig = configSchema.parse({});

export function getUserConfigPath(): string {
  return path.join(os.homedir(), ".drgit", "config.json");
}

export async function loadConfig(cwd: string): Promise<AppConfig> {
  const userConfig = await loadUserConfig();
  const explorer = cosmiconfig("drgit");
  const result = await explorer.search(cwd);

  return mergeConfigLayers(defaultConfig, userConfig, result?.config);
}

export async function saveUserConfig(
  configPatch: ConfigInput,
): Promise<AppConfig> {
  const existingConfig = await loadUserConfig();
  const nextConfig = mergeConfigLayers(
    defaultConfig,
    existingConfig,
    configPatch,
  );
  const filePath = getUserConfigPath();

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(nextConfig, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  return nextConfig;
}

export function mergeConfigLayers(...layers: Array<unknown>): AppConfig {
  const merged = layers.reduce<Record<string, unknown>>((current, layer) => {
    if (!layer || typeof layer !== "object") {
      return current;
    }

    return {
      ...current,
      ...layer,
      provider: {
        ...(current.provider && typeof current.provider === "object"
          ? current.provider
          : {}),
        ...normalizeProviderInput(
          ((layer as ConfigInput).provider ?? {}) as Record<string, unknown>,
        ),
      },
    };
  }, {});

  return configSchema.parse(merged);
}

function normalizeProviderInput(
  provider: Record<string, unknown>,
): Record<string, unknown> {
  if (provider.kind === "heuristic") {
    return {
      ...provider,
      kind: "openai",
      model:
        typeof provider.model === "string" &&
        provider.model !== "local-heuristic"
          ? provider.model
          : defaultOpenAIModel,
    };
  }

  return provider;
}

async function loadUserConfig(): Promise<ConfigInput | undefined> {
  const filePath = getUserConfigPath();

  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as ConfigInput;
  } catch (error) {
    if (isFileMissingError(error)) {
      return undefined;
    }

    throw error;
  }
}

function isFileMissingError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT",
  );
}
