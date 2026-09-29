import { afterEach, expect, test } from "vitest";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import type { Config } from "../src/config.js";
import { askTutor, createTutor, TutorError } from "../src/tutor.js";

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

test("keeps one app-server process across turns and resumes the thread after restart", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "voice-app-server-test-"));
  roots.push(root);
  await mkdir(path.join(root, "apps", "voice-backend"), { recursive: true });
  await writeFile(path.join(root, "apps", "voice-backend", "reply-schema.json"), JSON.stringify({ type: "object" }));
  const eventsPath = path.join(root, "events.jsonl");
  const codexPath = path.join(root, "codex");
  await writeFile(codexPath, `#!/usr/bin/env node
const fs = require("node:fs");
const readline = require("node:readline");
fs.appendFileSync(${JSON.stringify(eventsPath)}, JSON.stringify({ event: "process", args: process.argv.slice(2) }) + "\\n");
const lines = readline.createInterface({ input: process.stdin });
let turn = 0;
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialized") return;
  fs.appendFileSync(${JSON.stringify(eventsPath)}, JSON.stringify({ event: "message", message }) + "\\n");
  if (message.method === "initialize") return send({ id: message.id, result: { userAgent: "fixture", codexHome: "/tmp", platformFamily: "unix", platformOs: "macos" } });
  if (message.method === "thread/start") return send({ id: message.id, result: { thread: { id: "thread-app-server" } } });
  if (message.method === "thread/resume") return send({ id: message.id, result: { thread: { id: message.params.threadId } } });
  if (message.method === "turn/start") {
    turn += 1;
    const turnId = "turn-" + turn;
    send({ id: message.id, result: { turn: { id: turnId, status: "inProgress" } } });
    const raw = JSON.stringify({ replyText: "reply " + turn + "\\nthere" });
    const split = raw.indexOf("\\\\n") + 1;
    send({ method: "item/agentMessage/delta", params: { turnId, delta: raw.slice(0, split) } });
    send({ method: "item/agentMessage/delta", params: { turnId, delta: raw.slice(split) } });
    send({ method: "item/completed", params: { threadId: message.params.threadId, turnId, item: { type: "agentMessage", text: raw } } });
    return send({ method: "turn/completed", params: { threadId: message.params.threadId, turn: { id: turnId, status: "completed", error: null } } });
  }
});
function send(message) { process.stdout.write(JSON.stringify(message) + "\\n"); }
`);
  await chmod(codexPath, 0o755);
  const config = {
    accessToken: "token", port: 0, runtimeDir: root, skillDir: root,
    ffmpegPath: codexPath, whisperPath: codexPath, whisperModelPath: codexPath, codexPath,
    codexTransport: "app-server" as const
  };

  const tutor = await createTutor(config);
  const partials: string[] = [];
  const first = await tutor.ask("hello", undefined, undefined, (text) => partials.push(text));
  const second = await tutor.ask("again", first.threadId);
  await tutor.close();
  const restartedTutor = await createTutor(config);
  const third = await restartedTutor.ask("after restart", first.threadId);
  await restartedTutor.close();

  expect(first).toEqual({ threadId: "thread-app-server", replyText: "reply 1\nthere" });
  expect(partials).toContain("reply 1");
  expect(partials).toContain("reply 1\nthere");
  expect(second).toEqual({ threadId: "thread-app-server", replyText: "reply 2\nthere" });
  expect(third).toEqual({ threadId: "thread-app-server", replyText: "reply 1\nthere" });
  const events = (await readFile(eventsPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  expect(events.filter((event) => event.event === "process")).toHaveLength(2);
  expect(events.filter((event) => event.message?.method === "thread/start")).toHaveLength(1);
  expect(events.filter((event) => event.message?.method === "thread/resume")).toHaveLength(1);
  expect(events.filter((event) => event.message?.method === "turn/start")).toHaveLength(3);
});

test("falls back to exec when app-server initialization fails", async () => {
  const config = await fixture(`
    if (process.argv[2] === "app-server") process.exit(1);
    console.log(JSON.stringify({ type: "thread.started", thread_id: "thread-exec-fallback" }));
    console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify({ replyText: "fallback reply" }) } }));
  `);
  config.codexTransport = "app-server";

  const tutor = await createTutor(config);
  await expect(tutor.ask("hello")).resolves.toEqual({
    threadId: "thread-exec-fallback",
    replyText: "fallback reply"
  });
  await tutor.close();
});

test("interrupts a timed-out app-server turn without replaying it", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "voice-app-server-timeout-"));
  roots.push(root);
  await mkdir(path.join(root, "apps", "voice-backend"), { recursive: true });
  await writeFile(path.join(root, "apps", "voice-backend", "reply-schema.json"), "{}");
  const eventsPath = path.join(root, "events.jsonl");
  const codexPath = path.join(root, "codex");
  await writeFile(codexPath, `#!/usr/bin/env node
const fs = require("node:fs");
const readline = require("node:readline");
const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialized") return;
  fs.appendFileSync(${JSON.stringify(eventsPath)}, JSON.stringify(message) + "\\n");
  if (message.method === "initialize") return send({ id: message.id, result: {} });
  if (message.method === "thread/start") return send({ id: message.id, result: { thread: { id: "thread-timeout" } } });
  if (message.method === "turn/start") return send({ id: message.id, result: { turn: { id: "turn-timeout", status: "inProgress" } } });
  if (message.method === "turn/interrupt") return send({ id: message.id, result: {} });
});
function send(message) { process.stdout.write(JSON.stringify(message) + "\\n"); }
`);
  await chmod(codexPath, 0o755);
  const config = {
    accessToken: "token", port: 0, runtimeDir: root, skillDir: root,
    ffmpegPath: codexPath, whisperPath: codexPath, whisperModelPath: codexPath, codexPath,
    codexTransport: "app-server" as const, codexTimeoutMs: 50
  };

  const tutor = await createTutor(config);
  await expect(tutor.ask("hello")).rejects.toMatchObject<TutorError>({ code: "codex_timeout" });
  await new Promise((resolve) => setTimeout(resolve, 25));
  await tutor.close();
  const events = (await readFile(eventsPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  expect(events.filter((event) => event.method === "turn/start")).toHaveLength(1);
  expect(events.filter((event) => event.method === "turn/interrupt")).toHaveLength(1);
  expect(events.some((event) => event.method === "exec")).toBe(false);
});
