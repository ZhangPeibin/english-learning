import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildApp } from "../dist/app.js";
import { loadConfig } from "../dist/config.js";

const audioPath = process.env.VOICE_SMOKE_AUDIO?.trim();
if (!audioPath) throw new Error("VOICE_SMOKE_AUDIO is required and must name a recorded utterance");

const contentTypes = new Map([
  [".wav", "audio/wav"], [".webm", "audio/webm"], [".m4a", "audio/mp4"],
  [".mp4", "audio/mp4"], [".ogg", "audio/ogg"]
]);
const contentType = contentTypes.get(path.extname(audioPath).toLowerCase());
if (!contentType) throw new Error("VOICE_SMOKE_AUDIO must be WAV, WebM, M4A, MP4, or OGG");

const config = await loadConfig();
const app = await buildApp(config, { logger: true });
try {
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("Smoke server did not acquire a TCP port");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = { authorization: `Bearer ${config.accessToken}` };
  const created = await fetch(`${baseUrl}/v1/sessions`, { method: "POST", headers });
  if (!created.ok) throw new Error(`Session creation failed with HTTP ${created.status}`);
  const { sessionId } = await created.json();
  const form = new FormData();
  form.set("turnId", `smoke-${Date.now()}`);
  form.set("audio", new Blob([await readFile(audioPath)], { type: contentType }), path.basename(audioPath));
  const response = await fetch(`${baseUrl}/v1/sessions/${sessionId}/turns`, { method: "POST", headers, body: form });
  const result = await response.json();
  if (!response.ok) throw new Error(`Voice turn failed with HTTP ${response.status}: ${result.error?.code ?? "unknown_error"}`);
  process.stdout.write(`${JSON.stringify({ transcript: result.transcript, replyText: result.replyText }, null, 2)}\n`);
} finally {
  await app.close();
}
