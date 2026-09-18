import { afterEach, describe, expect, test } from "vitest";
import { chmod, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import type { Config } from "../src/config.js";
import { buildApp } from "../src/app.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function executable(filePath: string, source: string): Promise<void> {
  await writeFile(filePath, `#!/usr/bin/env node\n${source}`);
  await chmod(filePath, 0o755);
}

async function fixtureConfig(): Promise<{ config: Config; callsPath: string }> {
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
  const sourceLearningPath = path.join(root, "LEARNING.md");
  await writeFile(sourceLearningPath, "existing learner progress\n");
  const whisperModelPath = path.join(root, "model.bin");
  await writeFile(whisperModelPath, "fixture");
  const callsPath = path.join(root, "codex-calls.jsonl");
  const ffmpegPath = path.join(binDir, "ffmpeg");
  const whisperPath = path.join(binDir, "whisper-cli");
  const codexPath = path.join(binDir, "codex");
  await executable(ffmpegPath, `
    const fs = require("node:fs");
    const input = process.argv[process.argv.indexOf("-i") + 1];
    fs.copyFileSync(input, process.argv.at(-1));
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
    config: {
      accessToken: "test-secret-token",
      port: 0,
      runtimeDir,
      skillDir,
      sourceLearningPath,
      ffmpegPath,
      whisperPath,
      whisperModelPath,
      codexPath
    }
  };
}

function wavMultipart(boundary: string, turnId: string): Buffer {
  const prefix = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="turnId"',
    "",
    turnId,
    `--${boundary}`,
    'Content-Disposition: form-data; name="audio"; filename="speech.wav"',
    "Content-Type: audio/wav",
    "",
    "RIFF-fixture-wave",
    `--${boundary}--`,
    ""
  ].join("\r\n");
  return Buffer.from(prefix);
}

describe("voice tutor API", () => {
  test("protects the API and completes then resumes a private tutor session", async () => {
    const { config, callsPath } = await fixtureConfig();
    let app = await buildApp(config);
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ready" });

    for (const authorization of [undefined, "Bearer wrong"]) {
      const denied = await app.inject({ method: "POST", url: "/v1/sessions", headers: authorization ? { authorization } : {} });
      expect(denied.statusCode).toBe(401);
      expect(denied.json().error.code).toBe("unauthorized");
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
    expect(await readFile(path.join(config.runtimeDir, "LEARNING.md"), "utf8")).toBe("existing learner progress\n");

    await app.close();
    app = await buildApp(config);
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
    const gone = await app.inject({ method: "DELETE", url: `/v1/sessions/${sessionId}`, headers: auth });
    expect(gone.statusCode).toBe(404);
    await app.close();
  });
});
