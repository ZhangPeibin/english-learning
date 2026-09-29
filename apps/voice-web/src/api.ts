export interface TurnResult {
  turnId: string;
  transcript: string;
  replyText: string;
}
export type TurnProgress = { transcript?: string; replyText?: string };

interface ErrorEnvelope {
  error?: { code?: string; message?: string; retryable?: boolean };
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly status: number
  ) {
    super(message);
  }
}

export class VoiceApi {
  constructor(private readonly baseUrl = "") {}

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok && (await response.json()).status === "ready";
    } catch {
      return false;
    }
  }

  async createSession(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/sessions`, { method: "POST" });
    const body = await this.read<{ sessionId?: string }>(response);
    if (!body.sessionId) throw new ApiError("invalid_response", "The tutor returned an invalid session.", true, response.status);
    return body.sessionId;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/v1/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) await this.read(response);
  }

  async submitTurn(sessionId: string, turnId: string, audio: Blob, filename: string, onProgress?: (progress: TurnProgress) => void): Promise<TurnResult> {
    const form = new FormData();
    form.set("turnId", turnId);
    form.set("audio", audio, filename);
    const response = await fetch(`${this.baseUrl}/v1/sessions/${encodeURIComponent(sessionId)}/turns`, {
      method: "POST",
      headers: { accept: "application/x-ndjson" },
      body: form
    });
    return this.readTurn(response, onProgress);
  }

  async submitText(sessionId: string, turnId: string, text: string, onProgress?: (progress: TurnProgress) => void): Promise<TurnResult> {
    const response = await fetch(`${this.baseUrl}/v1/sessions/${encodeURIComponent(sessionId)}/text-turns`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/x-ndjson" },
      body: JSON.stringify({ turnId, text })
    });
    return this.readTurn(response, onProgress);
  }

  private async readTurn(response: Response, onProgress?: (progress: TurnProgress) => void): Promise<TurnResult> {
    if (!response.ok || !response.headers.get("content-type")?.includes("application/x-ndjson")) {
      return this.read<TurnResult>(response);
    }
    if (!response.body) throw new ApiError("invalid_response", "The tutor stream is unavailable.", true, response.status);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: TurnResult | undefined;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 1);
        let event: any;
        try { event = JSON.parse(line); } catch {
          throw new ApiError("invalid_response", "The tutor stream is invalid.", true, response.status);
        }
        if (event.type === "transcript" && typeof event.transcript === "string") onProgress?.({ transcript: event.transcript });
        if (event.type === "partial" && typeof event.replyText === "string") onProgress?.({ replyText: event.replyText });
        if (event.type === "error") throw new ApiError(event.error?.code ?? "request_failed",
          event.error?.message ?? "The request could not be completed.", event.error?.retryable ?? false,
          typeof event.statusCode === "number" ? event.statusCode : 502);
        if (event.type === "complete") result = {
          turnId: event.turnId, transcript: event.transcript, replyText: event.replyText
        };
      }
    }
    if (buffer || !result || typeof result.turnId !== "string" || typeof result.replyText !== "string" || typeof result.transcript !== "string") {
      throw new ApiError("invalid_response", "The tutor stream ended early.", true, response.status);
    }
    return result;
  }

  private async read<T>(response: Response): Promise<T> {
    let body: T & ErrorEnvelope;
    try {
      body = await response.json() as T & ErrorEnvelope;
    } catch {
      throw new ApiError("invalid_response", "The tutor returned an unreadable response.", true, response.status);
    }
    if (!response.ok) {
      throw new ApiError(
        body.error?.code ?? "request_failed",
        body.error?.message ?? "The request could not be completed.",
        body.error?.retryable ?? false,
        response.status
      );
    }
    return body;
  }
}
