import { describe, expect, it } from "vitest";

import {
  defaultConfig,
  defaultOpenAIModel,
  mergeConfigLayers,
} from "../src/config/index.js";

describe("mergeConfigLayers", () => {
  it("keeps provider fields from earlier layers when later layers only override one field", () => {
    const merged = mergeConfigLayers(defaultConfig, {
      provider: {
        kind: "openai",
        model: defaultOpenAIModel,
        apiKey: "test-key",
      },
    });

    expect(merged.provider.kind).toBe("openai");
    expect(merged.provider.model).toBe(defaultOpenAIModel);
    expect(merged.provider.apiKeyEnv).toBe("OPENAI_API_KEY");
    expect(merged.provider.apiKey).toBe("test-key");
  });

  it("allows a later layer to override the model without dropping a saved key", () => {
    const merged = mergeConfigLayers(
      defaultConfig,
      {
        provider: {
          kind: "openai",
          model: defaultOpenAIModel,
          apiKey: "saved-key",
        },
      },
      {
        provider: {
          model: "gpt-5.4-nano",
        },
      },
    );

    expect(merged.provider.kind).toBe("openai");
    expect(merged.provider.model).toBe("gpt-5.4-nano");
    expect(merged.provider.apiKey).toBe("saved-key");
  });

  it("migrates legacy heuristic provider config to openai", () => {
    const merged = mergeConfigLayers(defaultConfig, {
      provider: {
        kind: "heuristic",
        model: "local-heuristic",
      },
    });

    expect(merged.provider.kind).toBe("openai");
    expect(merged.provider.model).toBe(defaultOpenAIModel);
  });
});
