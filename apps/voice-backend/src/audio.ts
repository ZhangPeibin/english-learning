import { readFile } from "node:fs/promises";
import type { Config } from "./config.js";
import { ProcessFailure, runProcess } from "./process.js";

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const SUPPORTED_AUDIO = new Map([
  ["audio/webm", ".webm"], ["video/webm", ".webm"],
  ["audio/wav", ".wav"], ["audio/x-wav", ".wav"], ["audio/wave", ".wav"],
  ["audio/mp4", ".m4a"], ["audio/m4a", ".m4a"], ["audio/x-m4a", ".m4a"],
  ["video/mp4", ".mp4"], ["application/mp4", ".mp4"],
  ["audio/ogg", ".ogg"], ["application/ogg", ".ogg"]
]);

export class AudioError extends Error {
  constructor(readonly code: string, readonly statusCode: number, readonly retryable = false) { super(code); }
}

export function audioExtension(mimetype: string): string {
  const extension = SUPPORTED_AUDIO.get(mimetype.toLowerCase());
  if (!extension) throw new AudioError("unsupported_audio", 415);
  return extension;
}

function dependencyError(stage: "normalization" | "transcription", error: unknown): AudioError {
  const timedOut = error instanceof ProcessFailure && error.kind === "timeout";
  return new AudioError(`${stage}_${timedOut ? "timeout" : "failed"}`, 502, true);
}

export async function normalizeAudio(config: Config, sourcePath: string, normalizedPath: string,
  signal: AbortSignal, onOutcome: (outcome: string, durationMs: number) => void): Promise<void> {
  const started = Date.now();
  try {
    let probe;
    try {
      probe = await runProcess(config.ffmpegPath, ["-nostdin", "-i", sourcePath, "-f", "null", "-"],
        { timeoutMs: config.normalizationTimeoutMs ?? 30_000, signal });
    } catch (error) {
      if (error instanceof ProcessFailure && error.kind === "timeout") throw dependencyError("normalization", error);
      throw new AudioError("invalid_audio", 400);
    }
    const duration = /Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(probe.stderr);
    if (!duration) throw new AudioError("invalid_audio", 400);
    const seconds = Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new AudioError("empty_audio", 400);
    if (seconds > 60) throw new AudioError("audio_too_long", 413);
    await runProcess(config.ffmpegPath, ["-nostdin", "-y", "-i", sourcePath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", normalizedPath],
      { timeoutMs: config.normalizationTimeoutMs ?? 30_000, signal });
    if ((await readFile(normalizedPath)).length === 0) throw new AudioError("invalid_audio", 400);
    onOutcome("success", Date.now() - started);
  } catch (error) {
    const mapped = error instanceof AudioError ? error : dependencyError("normalization", error);
    onOutcome(mapped.code, Date.now() - started);
    throw mapped;
  }
}

export async function recognizeAudio(config: Config, wavPath: string, outputBase: string,
  signal: AbortSignal, onOutcome: (outcome: string, durationMs: number) => void): Promise<string> {
  const started = Date.now();
  try {
    await runProcess(config.whisperPath, ["-m", config.whisperModelPath, "-f", wavPath, "-otxt", "-of", outputBase],
      { timeoutMs: config.transcriptionTimeoutMs ?? 120_000, signal });
    const transcript = (await readFile(`${outputBase}.txt`, "utf8")).trim();
    if (!transcript) throw new AudioError("empty_transcript", 422);
    onOutcome("success", Date.now() - started);
    return transcript;
  } catch (error) {
    const mapped = error instanceof AudioError ? error : dependencyError("transcription", error);
    onOutcome(mapped.code, Date.now() - started);
    throw mapped;
  }
}
