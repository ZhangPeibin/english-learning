import { afterEach, expect, test } from "vitest";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import type { Config } from "../src/config.js";
import { recognizeAudio } from "../src/audio.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

test("asks Whisper to auto-detect English and Chinese", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "voice-language-test-"));
  roots.push(root);
  await mkdir(root, { recursive: true });
  const callsPath = path.join(root, "calls.json");
  const whisperPath = path.join(root, "whisper-cli");
  await writeFile(whisperPath, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(callsPath)}, JSON.stringify(args));
fs.writeFileSync(args[args.indexOf("-of") + 1] + ".txt", "你好, tutor");
`);
  await chmod(whisperPath, 0o755);
  const config = { whisperPath, whisperModelPath: path.join(root, "model.bin") } as Config;

  await expect(recognizeAudio(config, path.join(root, "audio.wav"), path.join(root, "transcript"),
    new AbortController().signal, () => {})).resolves.toBe("你好, tutor");
  expect(JSON.parse(await readFile(callsPath, "utf8"))).toEqual(expect.arrayContaining(["-l", "auto"]));
});
