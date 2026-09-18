import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Config } from "./config.js";

export interface TurnResult { turnId: string; transcript: string; replyText: string }
export interface CompletedTurn extends TurnResult { completedAt?: string; historyRecorded?: boolean }
export interface SessionRecord {
  codexThreadId?: string;
  startedAt?: string;
  completedTurns: Record<string, CompletedTurn>;
}
interface PersistedState { sessions: Record<string, SessionRecord> }
interface HistoryTurn extends TurnResult { completedAt: string }
interface ConversationHistory {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  turns: HistoryTurn[];
}
interface PersistedHistory { version: 1; conversations: ConversationHistory[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isHistory(value: unknown): value is PersistedHistory {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.conversations)) return false;
  return value.conversations.every((conversation) => isRecord(conversation)
    && typeof conversation.sessionId === "string"
    && isTimestamp(conversation.startedAt)
    && (conversation.endedAt === undefined || isTimestamp(conversation.endedAt))
    && Array.isArray(conversation.turns)
    && conversation.turns.every((turn) => isRecord(turn)
      && typeof turn.turnId === "string"
      && isTimestamp(turn.completedAt)
      && typeof turn.transcript === "string"
      && typeof turn.replyText === "string"));
}

export class StateStore {
  readonly learningPath: string;
  private readonly statePath: string;
  private readonly historyPath: string;
  private state: PersistedState = { sessions: {} };
  private history: PersistedHistory = { version: 1, conversations: [] };
  private pendingUpdate: Promise<void> = Promise.resolve();

  constructor(private readonly config: Config) {
    this.learningPath = path.join(config.runtimeDir, "LEARNING.md");
    this.statePath = path.join(config.runtimeDir, "sessions.json");
    this.historyPath = path.join(config.runtimeDir, "conversation-history.json");
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
      const history: unknown = JSON.parse(await readFile(this.historyPath, "utf8"));
      if (!isHistory(history)) throw new Error("Conversation history is invalid");
      this.history = history;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.persistHistory();
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
    await this.update((state) => {
      state.sessions[id] = { startedAt: new Date().toISOString(), completedTurns: {} };
    });
    return id;
  }

  getSession(id: string): SessionRecord | undefined { return this.state.sessions[id]; }

  async completeTurn(id: string, codexThreadId: string, result: TurnResult): Promise<CompletedTurn> {
    const completed = { ...result, completedAt: new Date().toISOString(), historyRecorded: false };
    await this.update((state) => {
      const session = state.sessions[id];
      if (!session) throw new Error("Session disappeared");
      session.codexThreadId = codexThreadId;
      session.completedTurns[result.turnId] = completed;
    });
    await this.ensureHistoryTurn(id, completed);
    return completed;
  }

  async ensureHistoryTurn(id: string, turn: CompletedTurn): Promise<void> {
    const session = this.state.sessions[id];
    if (!session || !turn.completedAt || turn.historyRecorded) return;
    await this.updateHistory((history) => {
      let conversation = history.conversations.find((item) => item.sessionId === id);
      if (!conversation) {
        conversation = { sessionId: id, startedAt: session.startedAt ?? turn.completedAt!, turns: [] };
        history.conversations.push(conversation);
      }
      if (conversation.turns.some((item) => item.turnId === turn.turnId)) return false;
      conversation.turns.push({
        turnId: turn.turnId,
        completedAt: turn.completedAt!,
        transcript: turn.transcript,
        replyText: turn.replyText
      });
      return true;
    });
    await this.update((state) => {
      const stored = state.sessions[id]?.completedTurns[turn.turnId];
      if (stored && stored.completedAt === turn.completedAt) stored.historyRecorded = true;
    });
  }

  async deleteSession(id: string): Promise<boolean> {
    if (!this.state.sessions[id]) return false;
    await this.updateHistory((history) => {
      const conversation = history.conversations.find((item) => item.sessionId === id);
      if (!conversation || conversation.endedAt) return false;
      conversation.endedAt = new Date().toISOString();
      return true;
    });
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
    await this.persistFile(this.statePath, state);
  }

  private async updateHistory(change: (history: PersistedHistory) => boolean): Promise<void> {
    const operation = this.pendingUpdate.then(async () => {
      const next = structuredClone(this.history);
      if (!change(next)) return;
      await this.persistHistory(next);
      this.history = next;
    });
    this.pendingUpdate = operation.catch(() => {});
    return operation;
  }

  private async persistHistory(history = this.history): Promise<void> {
    await this.persistFile(this.historyPath, history);
  }

  private async persistFile(filePath: string, value: unknown): Promise<void> {
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, filePath);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
}
