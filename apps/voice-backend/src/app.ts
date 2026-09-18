import Fastify, { type FastifyServerOptions } from "fastify";
import multipart from "@fastify/multipart";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import type { Config } from "./config.js";
import { StateStore } from "./state.js";
import { askTutor } from "./tutor.js";
import { AudioError, MAX_AUDIO_BYTES, audioExtension, normalizeAudio, recognizeAudio } from "./audio.js";

const errorBody = (code: string, message: string, retryable = false) => ({ error: { code, message, retryable } });

export async function buildApp(config: Config, options: { logger?: FastifyServerOptions["logger"] } = {}) {
  const app = Fastify({ logger: options.logger ?? true });
  const state = new StateStore(config);
  const activeSessions = new Set<string>();
  await state.initialize();
  await app.register(multipart, { limits: { files: 1, fileSize: MAX_AUDIO_BYTES, fields: 1 } });

  app.get("/health", async () => ({ status: "ready" }));
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/v1/")) return;
    if (request.headers.authorization !== `Bearer ${config.accessToken}`) {
      return reply.code(401).send(errorBody("unauthorized", "A valid bearer token is required."));
    }
  });

  app.post("/v1/sessions", async (_request, reply) => reply.code(201).send({ sessionId: await state.createSession() }));

  app.delete<{ Params: { sessionId: string } }>("/v1/sessions/:sessionId", async (request, reply) => {
    if (!await state.deleteSession(request.params.sessionId)) {
      return reply.code(404).send(errorBody("session_not_found", "Session not found."));
    }
    return reply.code(204).send();
  });

  app.post<{ Params: { sessionId: string } }>("/v1/sessions/:sessionId/turns", async (request, reply) => {
    const requestStarted = Date.now();
    const session = state.getSession(request.params.sessionId);
    if (!session) return reply.code(404).send(errorBody("session_not_found", "Session not found."));
    const workDir = await mkdtemp(path.join(tmpdir(), "voice-turn-"));
    const abortController = new AbortController();
    let ownsActiveTurn = false;
    request.raw.once("aborted", () => abortController.abort());
    const dependencyOutcome = (stage: string) => (outcome: string, durationMs: number) => {
      request.log.info({ requestId: request.id, stage, outcome, durationMs }, "dependency completed");
    };
    try {
      const parts = request.parts();
      let turnId = "";
      let sourcePath = "";
      for await (const part of parts) {
        if (part.type === "field" && part.fieldname === "turnId") turnId = String(part.value).trim();
        if (part.type === "file" && part.fieldname === "audio") {
          const extension = audioExtension(part.mimetype);
          sourcePath = path.join(workDir, `source${extension}`);
          await writeFile(sourcePath, part.file);
          if (part.file.truncated) throw new AudioError("audio_too_large", 413);
          if ((await stat(sourcePath)).size === 0) throw new AudioError("empty_audio", 400);
        }
      }
      if (!turnId) throw new AudioError("missing_turn_id", 400);
      if (!sourcePath) throw new AudioError("missing_audio", 400);
      const completed = session.completedTurns[turnId];
      if (completed) return completed;
      if (activeSessions.has(request.params.sessionId)) {
        return reply.code(409).send(errorBody("session_busy", "Another turn is already in progress.", true));
      }
      activeSessions.add(request.params.sessionId);
      ownsActiveTurn = true;
      const normalizedPath = path.join(workDir, "normalized.wav");
      await normalizeAudio(config, sourcePath, normalizedPath, abortController.signal, dependencyOutcome("ffmpeg"));
      const transcript = await recognizeAudio(config, normalizedPath, path.join(workDir, "transcript"), abortController.signal, dependencyOutcome("whisper"));
      const codexStarted = Date.now();
      let result;
      try {
        result = await askTutor(config, transcript, session.codexThreadId);
        dependencyOutcome("codex")("success", Date.now() - codexStarted);
      } catch (error) {
        dependencyOutcome("codex")("failed", Date.now() - codexStarted);
        throw error;
      }
      const completedTurn = { turnId, transcript, replyText: result.replyText };
      await state.completeTurn(request.params.sessionId, result.threadId, completedTurn);
      return completedTurn;
    } catch (error) {
      let audioError: AudioError;
      if (error instanceof AudioError) audioError = error;
      else if (error instanceof app.multipartErrors.RequestFileTooLargeError) audioError = new AudioError("audio_too_large", 413);
      else audioError = new AudioError("dependency_failed", 502, true);
      request.log.warn({ requestId: request.id, errorCode: audioError.code, durationMs: Date.now() - requestStarted }, "voice turn failed");
      const messages: Record<string, string> = {
        unsupported_audio: "The recording format is not supported.",
        audio_too_large: "The recording exceeds the 10 MB limit.",
        audio_too_long: "The recording exceeds the 60 second limit.",
        empty_audio: "The recording is empty.",
        invalid_audio: "The recording could not be decoded.",
        missing_audio: "An audio recording is required.",
        missing_turn_id: "turnId is required.",
        empty_transcript: "No speech was recognized.",
        normalization_timeout: "Audio processing timed out.",
        normalization_failed: "The recording could not be processed.",
        transcription_timeout: "Speech recognition timed out.",
        transcription_failed: "Speech recognition failed.",
        dependency_failed: "The voice turn could not be completed."
      };
      reply.code(audioError.statusCode);
      return errorBody(audioError.code, messages[audioError.code] ?? "The voice turn could not be completed.", audioError.retryable);
    } finally {
      if (ownsActiveTurn) activeSessions.delete(request.params.sessionId);
      await rm(workDir, { recursive: true, force: true });
      request.log.info({ requestId: request.id, durationMs: Date.now() - requestStarted }, "voice turn completed");
    }
  });

  return app;
}
