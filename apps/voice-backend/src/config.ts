import { access, mkdir, stat } from "node:fs/promises";
import path from "node:path";

export interface Config {
  accessToken: string;
  port: number;
  runtimeDir: string;
  skillDir: string;
  sourceLearningPath?: string;
  ffmpegPath: string;
  whisperPath: string;
  whisperModelPath: string;
  codexPath: string;
}

async function requireFile(filePath: string, executable = false): Promise<void> {
  const info = await stat(filePath).catch(() => undefined);
  if (!info?.isFile()) throw new Error(`Required file is unavailable: ${path.basename(filePath)}`);
  await access(filePath, executable ? 1 : 4);
}

export async function loadConfig(env: NodeJS.ProcessEnv = process.env): Promise<Config> {
  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name} is required`);
    return path.resolve(value);
  };
  const token = env.VOICE_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("VOICE_ACCESS_TOKEN is required");
  const port = Number(env.VOICE_PORT ?? "3000");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("VOICE_PORT is invalid");

  const config: Config = {
    accessToken: token,
    port,
    runtimeDir: required("VOICE_RUNTIME_DIR"),
    skillDir: required("VOICE_SKILL_DIR"),
    sourceLearningPath: env.VOICE_SOURCE_LEARNING_PATH
      ? path.resolve(env.VOICE_SOURCE_LEARNING_PATH)
      : undefined,
    ffmpegPath: required("VOICE_FFMPEG_PATH"),
    whisperPath: required("VOICE_WHISPER_PATH"),
    whisperModelPath: required("VOICE_WHISPER_MODEL_PATH"),
    codexPath: required("VOICE_CODEX_PATH")
  };
  await mkdir(config.runtimeDir, { recursive: true, mode: 0o700 });
  await Promise.all([
    requireFile(path.join(config.skillDir, "SKILL.md")),
    requireFile(path.join(config.skillDir, "templates", "LEARNING.md")),
    requireFile(path.join(config.skillDir, "apps", "voice-backend", "reply-schema.json")),
    requireFile(config.ffmpegPath, true),
    requireFile(config.whisperPath, true),
    requireFile(config.whisperModelPath),
    requireFile(config.codexPath, true)
  ]);
  return config;
}
