import { spawn } from "node:child_process";

export interface ProcessResult { stdout: string; stderr: string }

export async function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string } = {}
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (data: string) => { stdout += data; });
    child.stderr.setEncoding("utf8").on("data", (data: string) => { stderr += data; });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Dependency failed (${code ?? signal ?? "unknown"})`));
    });
  });
}
