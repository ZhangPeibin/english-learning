import { describe, expect, test } from "vitest";
import { loadConfig } from "../src/config.js";

describe("startup configuration", () => {
  test("rejects missing required configuration before startup", async () => {
    await expect(loadConfig({})).rejects.toThrow("VOICE_ACCESS_TOKEN is required");
    await expect(loadConfig({ VOICE_ACCESS_TOKEN: "configured" })).rejects.toThrow("VOICE_RUNTIME_DIR is required");
  });

  test("rejects an invalid port before dependency startup", async () => {
    await expect(loadConfig({ VOICE_ACCESS_TOKEN: "configured", VOICE_PORT: "70000" }))
      .rejects.toThrow("VOICE_PORT is invalid");
  });
});
