import { afterEach, expect, test } from "vitest";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import type { Config } from "../src/config.js";
import { askTutor, TutorError } from "../src/tutor.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function fixture(source: string): Promise<Config> {
  const root = await mkdtemp(path.join(tmpdir(), "voice-tutor-test-"));
  roots.push(root);
  await mkdir(path.join(root, "apps", "voice-backend"), { recursive: true });
  await writeFile(path.join(root, "apps", "voice-backend", "reply-schema.json"), "{}");
  const codexPath = path.join(root, "codex");
  await writeFile(codexPath, `#!/usr/bin/env node\n${source}`);
  await chmod(codexPath, 0o755);
  return {
    accessToken: "token", port: 0, runtimeDir: root, skillDir: root,
    ffmpegPath: codexPath, whisperPath: codexPath, whisperModelPath: codexPath, codexPath
  };
}

test("terminates a Codex turn at its configured deadline", async () => {
  const config = await fixture("process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000);");
  config.codexTimeoutMs = 50;
  await expect(askTutor(config, "hello")).rejects.toMatchObject<TutorError>({ code: "codex_timeout" });
});

test.each([
  ["not-json\n"],
  [JSON.stringify({ type: "thread.started", thread_id: "thread-1" }) + "\n"]
])("rejects malformed or incomplete Codex JSONL", async (stdout) => {
  const config = await fixture(`process.stdout.write(${JSON.stringify(stdout)});`);
  await expect(askTutor(config, "hello")).rejects.toMatchObject<TutorError>({ code: "codex_invalid_response" });
});
