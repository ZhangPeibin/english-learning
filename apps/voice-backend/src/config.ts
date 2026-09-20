import { access, mkdir, realpath, stat } from "node:fs/promises";
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
  codexTransport?: "exec" | "app-server";
  normalizationTimeoutMs?: number;
  transcriptionTimeoutMs?: number;
  codexTimeoutMs?: number;
}

async function requireFile(label: string, filePath: string, executable = false): Promise<void> {
  const info = await stat(filePath).catch(() => undefined);
  if (!info?.isFile()) throw new Error(`${label} must be an accessible file (${path.basename(filePath)})`);
  await access(filePath, executable ? 1 : 4).catch(() => {
    throw new Error(`${label} is not ${executable ? "executable" : "readable"} (${path.basename(filePath)})`);
  });
}

async function requireDirectory(label: string, directoryPath: string, writable = false): Promise<void> {
  const info = await stat(directoryPath).catch(() => undefined);
  if (!info?.isDirectory()) throw new Error(`${label} must be an accessible directory`);
  await access(directoryPath, writable ? 6 : 4).catch(() => {
    throw new Error(`${label} is not ${writable ? "readable and writable" : "readable"}`);
  });
}

function pathsOverlap(first: string, second: string): boolean {
  const relative = path.relative(first, second);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function prospectiveRealPath(targetPath: string): Promise<string> {
  const missing: string[] = [];
  let current = targetPath;
  while (true) {
    try {
      return path.join(await realpath(current), ...missing.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) throw new Error("VOICE_RUNTIME_DIR cannot be resolved");
      missing.push(path.basename(current));
      current = parent;
    }
  }
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
  const codexTransport = env.VOICE_CODEX_TRANSPORT?.trim() || "exec";
  if (codexTransport !== "exec" && codexTransport !== "app-server") {
    throw new Error("VOICE_CODEX_TRANSPORT must be exec or app-server");
  }

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
    codexPath: required("VOICE_CODEX_PATH"),
    codexTransport
  };
  await requireDirectory("VOICE_SKILL_DIR", config.skillDir);
  await Promise.all([
    requireFile("English Learning skill", path.join(config.skillDir, "SKILL.md")),
    requireFile("learner-state template", path.join(config.skillDir, "templates", "LEARNING.md")),
    requireFile("tutor reply schema", path.join(config.skillDir, "apps", "voice-backend", "reply-schema.json")),
    requireFile("VOICE_FFMPEG_PATH", config.ffmpegPath, true),
    requireFile("VOICE_WHISPER_PATH", config.whisperPath, true),
    requireFile("VOICE_WHISPER_MODEL_PATH", config.whisperModelPath),
    requireFile("VOICE_CODEX_PATH", config.codexPath, true),
    ...(config.sourceLearningPath
      ? [requireFile("VOICE_SOURCE_LEARNING_PATH", config.sourceLearningPath)]
      : [])
  ]);
  const runtimeInfo = await stat(config.runtimeDir).catch(() => undefined);
  if (runtimeInfo && !runtimeInfo.isDirectory()) throw new Error("VOICE_RUNTIME_DIR must be an accessible directory");
  if (runtimeInfo && (runtimeInfo.mode & 0o077) !== 0) {
    throw new Error("VOICE_RUNTIME_DIR must not grant group or world permissions");
  }
  const runtimeRealPath = await prospectiveRealPath(config.runtimeDir);
  const protectedPaths = [await realpath(config.skillDir)];
  if (config.sourceLearningPath) protectedPaths.push(await realpath(config.sourceLearningPath));
  if (protectedPaths.some((protectedPath) =>
    pathsOverlap(runtimeRealPath, protectedPath) || pathsOverlap(protectedPath, runtimeRealPath))) {
    throw new Error("VOICE_RUNTIME_DIR must be separate from VOICE_SKILL_DIR and VOICE_SOURCE_LEARNING_PATH");
  }
  await mkdir(config.runtimeDir, { recursive: true, mode: 0o700 });
  await requireDirectory("VOICE_RUNTIME_DIR", config.runtimeDir, true);
  return config;
}
