import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import type { Config } from "./config.js";
import { runProcess } from "./process.js";
import { StateStore } from "./state.js";
import { askTutor, transcribe } from "./tutor.js";

const errorBody = (code: string, message: string, retryable = false) => ({ error: { code, message, retryable } });

export async function buildApp(config: Config) {
  const app = Fastify({ logger: false });
  const state = new StateStore(config);
  await state.initialize();
  await app.register(multipart, { limits: { files: 1, fileSize: 10 * 1024 * 1024, fields: 1 } });

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
    const session = state.getSession(request.params.sessionId);
    if (!session) return reply.code(404).send(errorBody("session_not_found", "Session not found."));
    const workDir = await mkdtemp(path.join(tmpdir(), "voice-turn-"));
    try {
      const parts = request.parts();
      let turnId = "";
      let sourcePath = "";
      for await (const part of parts) {
        if (part.type === "field" && part.fieldname === "turnId") turnId = String(part.value).trim();
        if (part.type === "file" && part.fieldname === "audio") {
          if (!new Set(["audio/wav", "audio/x-wav", "audio/wave"]).has(part.mimetype)) {
            part.file.resume();
            return reply.code(415).send(errorBody("unsupported_audio", "A WAV recording is required."));
          }
          sourcePath = path.join(workDir, "source.wav");
          await writeFile(sourcePath, part.file);
        }
      }
      if (!turnId || !sourcePath) return reply.code(400).send(errorBody("invalid_turn", "turnId and audio are required."));
      const normalizedPath = path.join(workDir, "normalized.wav");
      await runProcess(config.ffmpegPath, ["-nostdin", "-y", "-i", sourcePath, "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", normalizedPath]);
      await readFile(normalizedPath);
      const transcript = await transcribe(config, normalizedPath, path.join(workDir, "transcript"));
      const result = await askTutor(config, transcript, session.codexThreadId);
      await state.setThread(request.params.sessionId, result.threadId);
      return { turnId, transcript, replyText: result.replyText };
    } catch {
      return reply.code(502).send(errorBody("dependency_failed", "The voice turn could not be completed.", true));
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  return app;
}
