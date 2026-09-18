import { afterEach, describe, expect, test } from "vitest";
import { chmod, mkdtemp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { tmpdir } from "node:os";
import type { Config } from "../src/config.js";
import { buildApp } from "../src/app.js";
import { StateStore } from "../src/state.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function executable(filePath: string, source: string): Promise<void> {
  await writeFile(filePath, `#!/usr/bin/env node\n${source}`);
  await chmod(filePath, 0o755);
}

async function fixtureConfig(existingProgress = true): Promise<{ config: Config; callsPath: string; ffmpegCallsPath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "voice-backend-test-"));
  roots.push(root);
  const runtimeDir = path.join(root, "runtime");
  const skillDir = path.join(root, "skill");
  const binDir = path.join(root, "bin");
  await mkdir(path.join(skillDir, "templates"), { recursive: true });
  await mkdir(binDir);
  await writeFile(path.join(skillDir, "SKILL.md"), "# Test English skill\n");
  await writeFile(path.join(skillDir, "templates", "LEARNING.md"), "template progress\n");
  await mkdir(path.join(skillDir, "apps", "voice-backend"), { recursive: true });
  await writeFile(path.join(skillDir, "apps", "voice-backend", "reply-schema.json"), "{}\n");
  if (existingProgress) await writeFile(path.join(skillDir, "LEARNING.md"), "existing learner progress\n");
  const whisperModelPath = path.join(root, "model.bin");
  await writeFile(whisperModelPath, "fixture");
  const callsPath = path.join(root, "codex-calls.jsonl");
  const ffmpegCallsPath = path.join(root, "ffmpeg-calls.jsonl");
  const ffmpegPath = path.join(binDir, "ffmpeg");
  const whisperPath = path.join(binDir, "whisper-cli");
  const codexPath = path.join(binDir, "codex");
  await executable(ffmpegPath, `
    const fs = require("node:fs");
    const input = process.argv[process.argv.indexOf("-i") + 1];
    fs.appendFileSync(${JSON.stringify(ffmpegCallsPath)}, JSON.stringify(process.argv.slice(2)) + "\\n");
    if (process.argv.at(-1) === "-") process.stderr.write("Duration: 00:00:01.00\\n");
    else fs.copyFileSync(input, process.argv.at(-1));
  `);
  await executable(whisperPath, `
    const fs = require("node:fs");
    const output = process.argv[process.argv.indexOf("-of") + 1];
    fs.writeFileSync(output + ".txt", "Hello tutor");
  `);
  await executable(codexPath, `
    const fs = require("node:fs");
    fs.appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }) + "\\n");
    console.log(JSON.stringify({ type: "thread.started", thread_id: "internal-thread-7" }));
    console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify({ replyText: "Nice to hear you. What did you do today?" }) } }));
  `);
  return {
    callsPath,
    ffmpegCallsPath,
    config: {
      accessToken: "test-secret-token",
      port: 0,
      runtimeDir,
      skillDir,
      ffmpegPath,
      whisperPath,
      whisperModelPath,
      codexPath
    }
  };
}

function wavMultipart(boundary: string, turnId: string): Buffer {
  return audioMultipart(boundary, turnId, "audio/wav", "speech.wav", "RIFF-fixture-wave");
}

function audioMultipart(boundary: string, turnId: string, mimetype: string, filename: string, content: string | Buffer): Buffer {
  const prefix = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="turnId"',
    "",
    turnId,
    `--${boundary}`,
    `Content-Disposition: form-data; name="audio"; filename="${filename}"`,
    `Content-Type: ${mimetype}`,
    "",
    ""
  ].join("\r\n");
  return Buffer.concat([Buffer.from(prefix), Buffer.isBuffer(content) ? content : Buffer.from(content), Buffer.from(`\r\n--${boundary}--\r\n`)]);
}

async function session(app: Awaited<ReturnType<typeof buildApp>>, config: Config): Promise<{ sessionId: string; auth: { authorization: string } }> {
  const auth = { authorization: `Bearer ${config.accessToken}` };
  const created = await app.inject({ method: "POST", url: "/v1/sessions", headers: auth });
  return { sessionId: created.json().sessionId, auth };
}

async function missing(filePath: string): Promise<boolean> {
  return stat(filePath).then(() => false, () => true);
}

async function waitForFile(filePath: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!await missing(filePath)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${path.basename(filePath)}`);
}

describe("voice tutor API", () => {
  test("protects the API and completes then resumes a private tutor session", async () => {
    const { config, callsPath, ffmpegCallsPath } = await fixtureConfig();
    const logLines: string[] = [];
    let app = await buildApp(config, { logger: { level: "info", stream: { write: (line: string) => logLines.push(line) } } });
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ready" });

    const protectedRequests = [
      { method: "POST" as const, url: "/v1/sessions" },
      { method: "POST" as const, url: "/v1/sessions/test-session/turns" },
      { method: "DELETE" as const, url: "/v1/sessions/test-session" }
    ];
    for (const request of protectedRequests) {
      for (const authorization of [undefined, "Bearer wrong"]) {
        const denied = await app.inject({ ...request, headers: authorization ? { authorization } : {} });
        expect(denied.statusCode).toBe(401);
        expect(denied.json().error.code).toBe("unauthorized");
      }
    }

    const auth = { authorization: `Bearer ${config.accessToken}` };
    const created = await app.inject({ method: "POST", url: "/v1/sessions", headers: auth });
    expect(created.statusCode).toBe(201);
    const { sessionId } = created.json();
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);

    const boundary = "voice-test-boundary";
    const first = await app.inject({
      method: "POST",
      url: `/v1/sessions/${sessionId}/turns`,
      headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: wavMultipart(boundary, "turn-one")
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({
      turnId: "turn-one",
      transcript: "Hello tutor",
      replyText: "Nice to hear you. What did you do today?"
    });
    expect(first.body).not.toContain("internal-thread-7");
    const successLogs = logLines.join("");
    expect(successLogs).toContain('"stage":"codex"');
    expect(successLogs).toContain('"outcome":"success"');
    expect(successLogs).toContain("durationMs");
    expect(successLogs).not.toContain(config.accessToken);
    expect(successLogs).not.toContain("Hello tutor");
    expect(successLogs).not.toContain("Nice to hear you");
    expect(await readFile(path.join(config.runtimeDir, "LEARNING.md"), "utf8")).toBe("existing learner progress\n");

    const duplicate = await app.inject({
      method: "POST", url: `/v1/sessions/${sessionId}/turns`,
      headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: wavMultipart(boundary, "turn-one")
    });
    expect(duplicate.json()).toEqual(first.json());
    expect((await readFile(callsPath, "utf8")).trim().split("\n")).toHaveLength(1);
    expect((await readFile(ffmpegCallsPath, "utf8")).trim().split("\n")).toHaveLength(2);

    await app.close();
    app = await buildApp(config, { logger: false });
    const restartedDuplicate = await app.inject({
      method: "POST", url: `/v1/sessions/${sessionId}/turns`,
      headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: wavMultipart(boundary, "turn-one")
    });
    expect(restartedDuplicate.json()).toEqual(first.json());
    const second = await app.inject({
      method: "POST",
      url: `/v1/sessions/${sessionId}/turns`,
      headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: wavMultipart(boundary, "turn-two")
    });
    expect(second.statusCode).toBe(200);
    const calls = (await readFile(callsPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(calls).toHaveLength(2);
    expect(await realpath(calls[0].cwd)).toBe(await realpath(config.runtimeDir));
    expect(calls[0].args).toContain("workspace-write");
    expect(calls[0].args).toContain("--output-schema");
    expect(calls[1].args.slice(0, 2)).toEqual(["exec", "resume"]);
    expect(calls[1].args).toContain('sandbox_mode="workspace-write"');
    expect(calls[1].args).toContain('approval_policy="never"');
    expect(calls[1].args).toContain("internal-thread-7");
    expect(calls.every((call) => !call.args.includes("--dangerously-bypass-approvals-and-sandbox"))).toBe(true);

    const removed = await app.inject({ method: "DELETE", url: `/v1/sessions/${sessionId}`, headers: auth });
    expect(removed.statusCode).toBe(204);
    expect(await readFile(path.join(config.runtimeDir, "LEARNING.md"), "utf8")).toBe("existing learner progress\n");
    const persisted = JSON.parse(await readFile(path.join(config.runtimeDir, "sessions.json"), "utf8"));
    expect(persisted.sessions[sessionId]).toBeUndefined();
    const historyText = await readFile(path.join(config.runtimeDir, "conversation-history.json"), "utf8");
    const history = JSON.parse(historyText);
    expect(history).toEqual({
      version: 1,
      conversations: [{
        sessionId,
        startedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        endedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        turns: [
          {
            turnId: "turn-one",
            completedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
            transcript: "Hello tutor",
            replyText: "Nice to hear you. What did you do today?"
          },
          {
            turnId: "turn-two",
            completedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
            transcript: "Hello tutor",
            replyText: "Nice to hear you. What did you do today?"
          }
        ]
      }]
    });
    expect(historyText).not.toContain("internal-thread-7");
    expect(historyText).not.toContain(config.accessToken);
    expect(historyText).not.toContain(config.runtimeDir);
    expect((await stat(path.join(config.runtimeDir, "conversation-history.json"))).mode & 0o777).toBe(0o600);
    const gone = await app.inject({ method: "DELETE", url: `/v1/sessions/${sessionId}`, headers: auth });
    expect(gone.statusCode).toBe(404);
    await app.close();
  });

  test("rejects an overlapping turn without launching another dependency pipeline", async () => {
    const { config, callsPath, ffmpegCallsPath } = await fixtureConfig();
    const startedPath = path.join(config.runtimeDir, "codex-started");
    const releasePath = path.join(config.runtimeDir, "release-codex");
    await executable(config.codexPath, `
      const fs = require("node:fs");
      fs.appendFileSync(${JSON.stringify(callsPath)}, "call\\n");
      fs.writeFileSync(${JSON.stringify(startedPath)}, "started");
      const timer = setInterval(() => {
        if (!fs.existsSync(${JSON.stringify(releasePath)})) return;
        clearInterval(timer);
        console.log(JSON.stringify({ type: "thread.started", thread_id: "thread-concurrent" }));
        console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify({ replyText: "First reply" }) } }));
      }, 10);
    `);
    const app = await buildApp(config, { logger: false });
    const { sessionId, auth } = await session(app, config);
    const boundary = "concurrent-boundary";
    const first = app.inject({ method: "POST", url: `/v1/sessions/${sessionId}/turns`,
      headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` }, payload: wavMultipart(boundary, "turn-first") });
    await waitForFile(startedPath);
    const second = await app.inject({ method: "POST", url: `/v1/sessions/${sessionId}/turns`,
      headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` }, payload: wavMultipart(boundary, "turn-second") });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toMatchObject({ code: "session_busy", retryable: true });
    expect((await readFile(callsPath, "utf8")).trim().split("\n")).toHaveLength(1);
    expect((await readFile(ffmpegCallsPath, "utf8")).trim().split("\n")).toHaveLength(2);
    await writeFile(releasePath, "release");
    expect((await first).statusCode).toBe(200);
    await app.close();
  });

  test("does not retain a state mutation when atomic replacement fails", async () => {
    const { config } = await fixtureConfig();
    const store = new StateStore(config);
    await store.initialize();
    const statePath = path.join(config.runtimeDir, "sessions.json");
    await rm(statePath);
    await mkdir(statePath);
    await expect(store.createSession()).rejects.toThrow();
    await rm(statePath, { recursive: true });
    await Promise.all([store.createSession(), store.createSession()]);
    const persisted = JSON.parse(await readFile(statePath, "utf8"));
    expect(Object.keys(persisted.sessions)).toHaveLength(2);
    expect((await readdir(config.runtimeDir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  test("backfills a completed turn after an atomic history write failure", async () => {
    const { config } = await fixtureConfig();
    const store = new StateStore(config);
    await store.initialize();
    const sessionId = await store.createSession();
    const historyPath = path.join(config.runtimeDir, "conversation-history.json");
    await rm(historyPath);
    await mkdir(historyPath);

    await expect(store.completeTurn(sessionId, "private-thread", {
      turnId: "turn-after-write-failure",
      transcript: "Recorded learner text",
      replyText: "Recorded tutor reply"
    })).rejects.toThrow();
    const completed = store.getSession(sessionId)?.completedTurns["turn-after-write-failure"];
    expect(completed).toBeDefined();

    await rm(historyPath, { recursive: true });
    await store.ensureHistoryTurn(sessionId, completed!);
    const historyText = await readFile(historyPath, "utf8");
    expect(JSON.parse(historyText).conversations[0].turns).toHaveLength(1);
    expect(historyText).not.toContain("private-thread");
    expect((await readdir(config.runtimeDir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  test("does not restore cleared history when a completed turn is retried", async () => {
    const { config, callsPath } = await fixtureConfig();
    let app = await buildApp(config, { logger: false });
    const { sessionId, auth } = await session(app, config);
    const boundary = "cleared-history-boundary";
    const request = {
      method: "POST" as const,
      url: `/v1/sessions/${sessionId}/turns`,
      headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: wavMultipart(boundary, "turn-before-clear")
    };
    expect((await app.inject(request)).statusCode).toBe(200);
    await app.close();
    await rm(path.join(config.runtimeDir, "conversation-history.json"));

    app = await buildApp(config, { logger: false });
    expect((await app.inject(request)).statusCode).toBe(200);
    expect((await readFile(callsPath, "utf8")).trim().split("\n")).toHaveLength(1);
    const history = JSON.parse(await readFile(path.join(config.runtimeDir, "conversation-history.json"), "utf8"));
    expect(history.conversations).toEqual([]);
    await app.close();
  });

  test("initializes learner state from the template when no existing progress is present", async () => {
    const { config } = await fixtureConfig(false);
    const app = await buildApp(config, { logger: false });
    expect(await readFile(path.join(config.runtimeDir, "LEARNING.md"), "utf8")).toBe("template progress\n");
    await app.close();
  });

  test("starts history empty without migrating existing session turns", async () => {
    const { config } = await fixtureConfig();
    await mkdir(config.runtimeDir, { recursive: true });
    await writeFile(path.join(config.runtimeDir, "sessions.json"), JSON.stringify({
      sessions: {
        "legacy-session": {
          codexThreadId: "legacy-private-thread",
          completedTurns: {
            "legacy-turn": {
              turnId: "legacy-turn",
              transcript: "Legacy transcript",
              replyText: "Legacy reply"
            }
          }
        }
      }
    }));

    const app = await buildApp(config, { logger: false });
    const historyText = await readFile(path.join(config.runtimeDir, "conversation-history.json"), "utf8");
    expect(JSON.parse(historyText)).toEqual({ version: 1, conversations: [] });
    expect(historyText).not.toContain("legacy");
    await app.close();
  });

  test("refuses startup with malformed conversation history without overwriting it", async () => {
    const { config } = await fixtureConfig();
    await mkdir(config.runtimeDir, { recursive: true });
    const historyPath = path.join(config.runtimeDir, "conversation-history.json");
    const malformed = '{"version":1,"unexpected":"private history content"}\n';
    await writeFile(historyPath, malformed);

    await expect(buildApp(config, { logger: false })).rejects.toThrow("Conversation history is invalid");
    expect(await readFile(historyPath, "utf8")).toBe(malformed);
  });

  test.each([
    ["audio/webm", "speech.webm"], ["audio/wav", "speech.wav"], ["audio/mp4", "speech.m4a"], ["audio/ogg", "speech.ogg"]
  ])("accepts and normalizes %s recordings", async (mimetype, filename) => {
    const { config, ffmpegCallsPath } = await fixtureConfig();
    const app = await buildApp(config, { logger: false });
    const { sessionId, auth } = await session(app, config);
    const boundary = "format-boundary";
    const response = await app.inject({ method: "POST", url: `/v1/sessions/${sessionId}/turns`,
      headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: audioMultipart(boundary, `turn-${filename}`, mimetype, filename, "fixture-audio") });
    expect(response.statusCode).toBe(200);
    const calls = (await readFile(ffmpegCallsPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(expect.arrayContaining(["-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le"]));
    for (const call of calls) {
      const sourcePath = call[call.indexOf("-i") + 1];
      expect(await missing(path.dirname(sourcePath))).toBe(true);
    }
    await app.close();
  });

  test("accepts a MediaRecorder WebM without container duration metadata", async () => {
    const { config, ffmpegCallsPath } = await fixtureConfig();
    await executable(config.ffmpegPath, `
      const fs = require("node:fs");
      const input = process.argv[process.argv.indexOf("-i") + 1];
      fs.appendFileSync(${JSON.stringify(ffmpegCallsPath)}, JSON.stringify(process.argv.slice(2)) + "\\n");
      if (process.argv.at(-1) === "-") {
        process.stderr.write("Duration: N/A\\nout_time_us=3000000\\nprogress=end\\n");
      } else {
        fs.copyFileSync(input, process.argv.at(-1));
      }
    `);
    const app = await buildApp(config, { logger: false });
    const { sessionId, auth } = await session(app, config);
    const boundary = "media-recorder-boundary";
    const response = await app.inject({ method: "POST", url: `/v1/sessions/${sessionId}/turns`,
      headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: audioMultipart(boundary, "turn-media-recorder", "audio/webm;codecs=opus", "recording.webm", "webm-audio") });

    expect(response.statusCode).toBe(200);
    const calls = (await readFile(ffmpegCallsPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(calls[0]).toEqual(expect.arrayContaining(["-progress", "pipe:2", "-nostats"]));
    await app.close();
  });

  test.each([
    ["missing_audio", undefined, "audio/wav", ""],
    ["empty_audio", "", "audio/wav", ""],
    ["unsupported_audio", "data", "audio/mpeg", ""],
    ["audio_too_large", Buffer.alloc(10 * 1024 * 1024 + 1), "audio/wav", ""]
  ])("rejects invalid upload with %s", async (code, content, mimetype) => {
    const { config } = await fixtureConfig();
    const app = await buildApp(config, { logger: false });
    const { sessionId, auth } = await session(app, config);
    const boundary = "invalid-boundary";
    const payload = content === undefined
      ? Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="turnId"\r\n\r\nturn-invalid\r\n--${boundary}--\r\n`)
      : audioMultipart(boundary, "turn-invalid", mimetype, "speech.bin", content);
    const response = await app.inject({ method: "POST", url: `/v1/sessions/${sessionId}/turns`,
      headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` }, payload });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.json().error).toMatchObject({ code, retryable: false });
    await app.close();
  });

  test.each([
    ["invalid_audio", "process.stderr.write('private diagnostic /secret/path'); process.exit(1)", undefined],
    ["audio_too_long", "process.stderr.write('Duration: 00:01:00.01\\n')", undefined],
    ["normalization_timeout", "process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000)", "ffmpeg"],
    ["normalization_timeout", "setTimeout(() => process.stderr.write('Duration: 00:00:01.00\\n'), 600)", "total-timeout"],
    ["normalization_failed", "process.stderr.write('Duration: 00:00:01.00\\n')", "normalize-fail"],
    ["transcription_failed", "process.stderr.write('Duration: 00:00:01.00\\n')", "whisper-fail"],
    ["empty_transcript", "process.stderr.write('Duration: 00:00:01.00\\n')", "whisper-empty"],
    ["transcription_timeout", "process.stderr.write('Duration: 00:00:01.00\\n')", "whisper-timeout"],
    ["codex_failed", "process.stderr.write('Duration: 00:00:01.00\\n')", "codex-fail"],
    ["codex_invalid_response", "process.stderr.write('Duration: 00:00:01.00\\n')", "codex-invalid"],
    ["codex_timeout", "process.stderr.write('Duration: 00:00:01.00\\n')", "codex-timeout"]
  ])("maps and cleans the %s terminal path", async (code, probeBehavior, whisperBehavior) => {
    const { config, ffmpegCallsPath } = await fixtureConfig();
    config.normalizationTimeoutMs = 1_000;
    config.transcriptionTimeoutMs = 1_000;
    await executable(config.ffmpegPath, `
      const fs = require("node:fs");
      const input = process.argv[process.argv.indexOf("-i") + 1];
      fs.appendFileSync(${JSON.stringify(ffmpegCallsPath)}, JSON.stringify(process.argv.slice(2)) + "\\n");
      if (process.argv.at(-1) === "-") { ${probeBehavior} }
      else { ${whisperBehavior === "normalize-fail" ? "process.stderr.write('private normalization diagnostic'); process.exit(1);" : whisperBehavior === "total-timeout" ? "process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000);" : "fs.copyFileSync(input, process.argv.at(-1));"} }
    `);
    if (whisperBehavior?.startsWith("whisper-")) await executable(config.whisperPath, `
      const fs = require("node:fs");
      const output = process.argv[process.argv.indexOf("-of") + 1];
      ${whisperBehavior === "whisper-fail" ? "process.stderr.write('private transcript diagnostic'); process.exit(1);" : ""}
      ${whisperBehavior === "whisper-empty" ? "fs.writeFileSync(output + '.txt', '');" : ""}
      ${whisperBehavior === "whisper-timeout" ? "process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000);" : ""}
    `);
    if (whisperBehavior === "codex-fail") await executable(config.codexPath, `
      process.stderr.write("private codex diagnostic");
      process.exit(1);
    `);
    if (whisperBehavior === "codex-invalid") await executable(config.codexPath, `process.stdout.write("not-json\\n");`);
    if (whisperBehavior === "codex-timeout") {
      config.codexTimeoutMs = 50;
      await executable(config.codexPath, `process.on("SIGTERM", () => process.exit(0)); setInterval(() => {}, 1000);`);
    }
    const logLines: string[] = [];
    const app = await buildApp(config, { logger: { level: "info", stream: { write: (line: string) => logLines.push(line) } } });
    const { sessionId, auth } = await session(app, config);
    const boundary = "failure-boundary";
    const requestStarted = Date.now();
    const response = await app.inject({ method: "POST", url: `/v1/sessions/${sessionId}/turns`,
      headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: audioMultipart(boundary, `turn-${code}`, "audio/wav", "speech.wav", "private raw audio") });
    if (whisperBehavior === "total-timeout") expect(Date.now() - requestStarted).toBeLessThan(1_200);
    expect(response.json().error).toMatchObject({ code });
    expect(response.body).not.toContain("private");
    expect(response.body).not.toContain(config.runtimeDir);
    const calls = (await readFile(ffmpegCallsPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    const sourcePath = calls[0][calls[0].indexOf("-i") + 1];
    expect(await missing(path.dirname(sourcePath))).toBe(true);
    const logs = logLines.join("");
    expect(logs).toContain(`\"errorCode\":\"${code}\"`);
    expect(logs).toContain("durationMs");
    expect(logs).not.toContain(config.accessToken);
    expect(logs).not.toContain("private raw audio");
    expect(logs).not.toContain("private diagnostic");
    expect(logs).not.toContain(config.runtimeDir);
    if (whisperBehavior?.startsWith("codex-")) {
      expect(logs).toContain('"stage":"codex"');
      expect(logs).toContain('"outcome":"failed"');
      expect(logs).not.toContain("private codex diagnostic");
    }
    const history = JSON.parse(await readFile(path.join(config.runtimeDir, "conversation-history.json"), "utf8"));
    expect(history.conversations).toEqual([]);
    await app.close();
  });

  test("cleans a partial upload after the client disconnects", async () => {
    const { config } = await fixtureConfig();
    const app = await buildApp(config, { logger: false });
    const { sessionId, auth } = await session(app, config);
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address");
    const before = new Set((await readdir(tmpdir())).filter((name) => name.startsWith("voice-turn-")));
    const boundary = "disconnect-boundary";
    await new Promise<void>((resolve) => {
      const request = http.request({ host: "127.0.0.1", port: address.port, method: "POST",
        path: `/v1/sessions/${sessionId}/turns`, headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` } });
      request.on("error", () => resolve());
      request.write(`--${boundary}\r\nContent-Disposition: form-data; name="turnId"\r\n\r\ndisconnected\r\n`);
      request.write(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="speech.wav"\r\nContent-Type: audio/wav\r\n\r\npartial`);
      setTimeout(() => request.destroy(), 25);
    });
    let remaining: string[] = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      remaining = (await readdir(tmpdir())).filter((name) => name.startsWith("voice-turn-") && !before.has(name));
      if (remaining.length === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(remaining).toEqual([]);
    await app.close();
  });
});
