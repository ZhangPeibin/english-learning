export interface TurnResult {
  turnId: string;
  transcript: string;
  replyText: string;
}

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

  async submitTurn(sessionId: string, turnId: string, audio: Blob, filename: string): Promise<TurnResult> {
    const form = new FormData();
    form.set("turnId", turnId);
    form.set("audio", audio, filename);
    const response = await fetch(`${this.baseUrl}/v1/sessions/${encodeURIComponent(sessionId)}/turns`, {
      method: "POST",
      body: form
    });
    return this.read<TurnResult>(response);
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
