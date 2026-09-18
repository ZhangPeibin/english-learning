import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Config } from "./config.js";

export interface SessionRecord { codexThreadId?: string }
interface PersistedState { sessions: Record<string, SessionRecord> }

export class StateStore {
  readonly learningPath: string;
  private readonly statePath: string;
  private state: PersistedState = { sessions: {} };

  constructor(private readonly config: Config) {
    this.learningPath = path.join(config.runtimeDir, "LEARNING.md");
    this.statePath = path.join(config.runtimeDir, "sessions.json");
  }

  async initialize(): Promise<void> {
    await mkdir(this.config.runtimeDir, { recursive: true, mode: 0o700 });
    try {
      this.state = JSON.parse(await readFile(this.statePath, "utf8")) as PersistedState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.persist();
    }
    try {
      await readFile(this.learningPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const template = path.join(this.config.skillDir, "templates", "LEARNING.md");
      const progress = this.config.sourceLearningPath ?? path.join(this.config.skillDir, "LEARNING.md");
      let source = template;
      try { await readFile(progress); source = progress; } catch {}
      await copyFile(source, this.learningPath);
    }
  }

  async createSession(): Promise<string> {
    const id = randomUUID();
    this.state.sessions[id] = {};
    await this.persist();
    return id;
  }

  getSession(id: string): SessionRecord | undefined { return this.state.sessions[id]; }

  async setThread(id: string, codexThreadId: string): Promise<void> {
    const session = this.state.sessions[id];
    if (!session) throw new Error("Session disappeared");
    session.codexThreadId = codexThreadId;
    await this.persist();
  }

  async deleteSession(id: string): Promise<boolean> {
    if (!this.state.sessions[id]) return false;
    delete this.state.sessions[id];
    await this.persist();
    return true;
  }

  private async persist(): Promise<void> {
    const temporary = `${this.statePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.statePath);
  }
}
