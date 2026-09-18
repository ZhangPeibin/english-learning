import { afterEach, describe, expect, test } from "vitest";
import { chmod, mkdtemp, mkdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../src/config.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function validEnvironment(): Promise<NodeJS.ProcessEnv> {
  const root = await mkdtemp(path.join(tmpdir(), "voice-config-test-"));
  roots.push(root);
  const skill = path.join(root, "skill");
  const runtime = path.join(root, "runtime");
  await mkdir(path.join(skill, "templates"), { recursive: true });
  await mkdir(path.join(skill, "apps", "voice-backend"), { recursive: true });
  await Promise.all([
    writeFile(path.join(skill, "SKILL.md"), "skill"),
    writeFile(path.join(skill, "templates", "LEARNING.md"), "template"),
    writeFile(path.join(skill, "apps", "voice-backend", "reply-schema.json"), "{}")
  ]);
  const files = Object.fromEntries(await Promise.all(["ffmpeg", "whisper", "codex", "model"].map(async (name) => {
    const file = path.join(root, name);
    await writeFile(file, name);
    if (name !== "model") await chmod(file, 0o755);
    return [name, file];
  })));
  return {
    VOICE_ACCESS_TOKEN: "configured", VOICE_RUNTIME_DIR: runtime, VOICE_SKILL_DIR: skill,
    VOICE_FFMPEG_PATH: files.ffmpeg, VOICE_WHISPER_PATH: files.whisper,
    VOICE_WHISPER_MODEL_PATH: files.model, VOICE_CODEX_PATH: files.codex
  };
}

describe("startup configuration", () => {
  test("rejects missing required configuration before startup", async () => {
    await expect(loadConfig({})).rejects.toThrow("VOICE_ACCESS_TOKEN is required");
    await expect(loadConfig({ VOICE_ACCESS_TOKEN: "configured" })).rejects.toThrow("VOICE_RUNTIME_DIR is required");
  });

  test("rejects an invalid port before dependency startup", async () => {
    await expect(loadConfig({ VOICE_ACCESS_TOKEN: "configured", VOICE_PORT: "70000" }))
      .rejects.toThrow("VOICE_PORT is invalid");
  });

  test("accepts usable local dependencies and creates the private runtime directory", async () => {
    const env = await validEnvironment();
    const config = await loadConfig(env);
    expect(config.port).toBe(3000);
    expect(config.runtimeDir).toBe(env.VOICE_RUNTIME_DIR);
  });

  test("rejects a configured path with an actionable variable name", async () => {
    const env = await validEnvironment();
    env.VOICE_WHISPER_MODEL_PATH = path.join(env.VOICE_RUNTIME_DIR!, "missing-model.bin");
    await expect(loadConfig(env)).rejects.toThrow("VOICE_WHISPER_MODEL_PATH must be an accessible file");
  });

  test("rejects runtime and source overlap before creating a runtime directory", async () => {
    const env = await validEnvironment();
    env.VOICE_RUNTIME_DIR = path.join(env.VOICE_SKILL_DIR!, "private-runtime");
    await expect(loadConfig(env)).rejects.toThrow(
      "VOICE_RUNTIME_DIR must be separate from VOICE_SKILL_DIR and VOICE_SOURCE_LEARNING_PATH"
    );
    await expect(stat(env.VOICE_RUNTIME_DIR)).rejects.toThrow();
  });

  test("rejects overlap through real symlink paths", async () => {
    const env = await validEnvironment();
    const alias = path.join(path.dirname(env.VOICE_SKILL_DIR!), "skill-alias");
    await symlink(env.VOICE_SKILL_DIR!, alias);
    env.VOICE_RUNTIME_DIR = path.join(alias, "private-runtime");
    await expect(loadConfig(env)).rejects.toThrow("VOICE_RUNTIME_DIR must be separate");
  });

  test("rejects a pre-existing runtime directory with group or world permissions", async () => {
    const env = await validEnvironment();
    await mkdir(env.VOICE_RUNTIME_DIR!, { mode: 0o750 });
    await expect(loadConfig(env)).rejects.toThrow(
      "VOICE_RUNTIME_DIR must not grant group or world permissions"
    );
  });
});
