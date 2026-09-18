import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Config } from "./config.js";

export interface TurnResult { turnId: string; transcript: string; replyText: string }
export interface SessionRecord {
  codexThreadId?: string;
  completedTurns: Record<string, TurnResult>;
}
interface PersistedState { sessions: Record<string, SessionRecord> }

export class StateStore {
  readonly learningPath: string;
  private readonly statePath: string;
  private state: PersistedState = { sessions: {} };
  private pendingUpdate: Promise<void> = Promise.resolve();

  constructor(private readonly config: Config) {
    this.learningPath = path.join(config.runtimeDir, "LEARNING.md");
    this.statePath = path.join(config.runtimeDir, "sessions.json");
  }

  async initialize(): Promise<void> {
    await mkdir(this.config.runtimeDir, { recursive: true, mode: 0o700 });
    try {
      this.state = JSON.parse(await readFile(this.statePath, "utf8")) as PersistedState;
      for (const session of Object.values(this.state.sessions)) session.completedTurns ??= {};
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
    await this.update((state) => { state.sessions[id] = { completedTurns: {} }; });
    return id;
  }

  getSession(id: string): SessionRecord | undefined { return this.state.sessions[id]; }

  async completeTurn(id: string, codexThreadId: string, result: TurnResult): Promise<void> {
    await this.update((state) => {
      const session = state.sessions[id];
      if (!session) throw new Error("Session disappeared");
      session.codexThreadId = codexThreadId;
      session.completedTurns[result.turnId] = result;
    });
  }

  async deleteSession(id: string): Promise<boolean> {
    if (!this.state.sessions[id]) return false;
    await this.update((state) => { delete state.sessions[id]; });
    return true;
  }

  private async update(change: (state: PersistedState) => void): Promise<void> {
    const operation = this.pendingUpdate.then(async () => {
      const next = structuredClone(this.state);
      change(next);
      await this.persist(next);
      this.state = next;
    });
    this.pendingUpdate = operation.catch(() => {});
    return operation;
  }

  private async persist(state = this.state): Promise<void> {
    const temporary = `${this.statePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.statePath);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
}
