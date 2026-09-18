import { afterEach, expect, test } from "vitest";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { ProcessFailure, runProcess } from "../src/process.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

test("escalates a timed-out child that ignores SIGTERM", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "voice-process-test-"));
  roots.push(root);
  const executable = path.join(root, "stuck");
  const pidPath = path.join(root, "pid");
  await writeFile(executable, `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`);
  await chmod(executable, 0o755);
  await expect(runProcess(executable, [], { timeoutMs: 1_000 })).rejects.toMatchObject<ProcessFailure>({ kind: "timeout" });
  const pid = Number(await readFile(pidPath, "utf8"));
  expect(() => process.kill(pid, 0)).toThrow();
});
