import { spawn } from "node:child_process";

export interface ProcessResult { stdout: string; stderr: string }

export class ProcessFailure extends Error {
  constructor(readonly kind: "failed" | "timeout" | "aborted") {
    super(kind);
  }
}

export async function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let termination: "timeout" | "aborted" | undefined;
    let forceKillTimer: NodeJS.Timeout | undefined;
    const finish = (error?: Error, result?: ProcessResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(forceKillTimer);
      options.signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(result!);
    };
    const stop = (reason: "timeout" | "aborted") => {
      if (termination) return;
      termination = reason;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 250);
      forceKillTimer.unref();
    };
    const abort = () => stop("aborted");
    const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => {
      stop("timeout");
    }, options.timeoutMs);
    timer?.unref();
    if (options.signal?.aborted) return abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    child.stdout.setEncoding("utf8").on("data", (data: string) => { stdout += data; });
    child.stderr.setEncoding("utf8").on("data", (data: string) => { stderr += data; });
    child.once("error", () => finish(new ProcessFailure("failed")));
    child.once("close", (code, signal) => {
      if (termination) return finish(new ProcessFailure(termination));
      if (code === 0) finish(undefined, { stdout, stderr });
      else finish(new ProcessFailure("failed"));
    });
  });
}
