import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError, VoiceApi } from "../src/api";

afterEach(() => vi.unstubAllGlobals());

describe("VoiceApi", () => {
  test("creates a session through the same-origin proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessionId: "session-1" }), {
      status: 201,
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new VoiceApi().createSession()).resolves.toBe("session-1");
    expect(fetchMock).toHaveBeenCalledWith("/v1/sessions", { method: "POST" });
  });

  test("uploads audio with a stable client turn id", async () => {
    let submitted: FormData | undefined;
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      submitted = init.body as FormData;
      return new Response(JSON.stringify({ turnId: "turn-1", transcript: "Hello", replyText: "Hello there." }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const audio = new Blob(["audio"], { type: "audio/webm" });
    await expect(new VoiceApi().submitTurn("session/1", "turn-1", audio, "voice.webm")).resolves.toMatchObject({
      transcript: "Hello",
      replyText: "Hello there."
    });
    expect(fetchMock.mock.calls[0][0]).toBe("/v1/sessions/session%2F1/turns");
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ accept: "application/x-ndjson" });
    expect(submitted?.get("turnId")).toBe("turn-1");
    expect(submitted?.get("audio")).toBeInstanceOf(File);
  });

  test("submits typed text as a JSON turn", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      turnId: "text-turn-1",
      transcript: "Can we practise A?",
      replyText: "Yes. Let's start with A."
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new VoiceApi().submitText("session/1", "text-turn-1", "Can we practise A?"))
      .resolves.toMatchObject({ transcript: "Can we practise A?" });
    expect(fetchMock).toHaveBeenCalledWith("/v1/sessions/session%2F1/text-turns", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/x-ndjson" },
      body: JSON.stringify({ turnId: "text-turn-1", text: "Can we practise A?" })
    });
  });

  test("preserves stable backend errors for retry decisions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: "codex_timeout", message: "The tutor timed out.", retryable: true }
    }), { status: 502, headers: { "content-type": "application/json" } })));

    const result = new VoiceApi().submitTurn("session-1", "turn-1", new Blob(["audio"]), "voice.wav");
    await expect(result).rejects.toMatchObject({
      code: "codex_timeout",
      retryable: true,
      status: 502
    } satisfies Partial<ApiError>);
  });

  test("reads incremental replies across network chunks and returns the confirmed turn", async () => {
    const lines = [
      JSON.stringify({ type: "transcript", transcript: "Hi" }),
      JSON.stringify({ type: "partial", replyText: "Hello" }),
      JSON.stringify({ type: "partial", replyText: "Hello there" }),
      JSON.stringify({ type: "complete", turnId: "turn-1", transcript: "Hi", replyText: "Hello there" })
    ].join("\n") + "\n";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        const bytes = new TextEncoder().encode(lines);
        controller.enqueue(bytes.slice(0, 29));
        controller.enqueue(bytes.slice(29, 65));
        controller.enqueue(bytes.slice(65));
        controller.close();
      }
    }), { headers: { "content-type": "application/x-ndjson" } })));
    const progress: object[] = [];
    const result = await new VoiceApi().submitText("session-1", "turn-1", "Hi", (event) => progress.push(event));
    expect(progress).toEqual([{ transcript: "Hi" }, { replyText: "Hello" }, { replyText: "Hello there" }]);
    expect(result).toEqual({ turnId: "turn-1", transcript: "Hi", replyText: "Hello there" });
  });

  test("does not treat a partial reply or streamed error as a completed turn", async () => {
    const response = (events: object[]) => new Response(events.map((event) => JSON.stringify(event)).join("\n") + "\n",
      { headers: { "content-type": "application/x-ndjson" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response([{ type: "partial", replyText: "Hello" }]))
      .mockResolvedValueOnce(response([{ type: "error", error: { code: "codex_timeout", retryable: true } }])));
    const api = new VoiceApi();
    await expect(api.submitText("session-1", "turn-1", "Hi")).rejects.toMatchObject({ code: "invalid_response" });
    await expect(api.submitText("session-1", "turn-1", "Hi")).rejects.toMatchObject({ code: "codex_timeout", retryable: true });
  });
});
