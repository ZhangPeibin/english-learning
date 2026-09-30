# Voice Tutor Backend - Requirements Discussion

**Status:** ready-for-prd
**Release:** mvp
**Feature:** voice-tutor-backend

## Problem

The existing `english-learning` project runs as a Codex skill and supports text-based tutoring with local progress tracking. It does not expose a backend that can accept microphone input, transcribe speech, continue a Codex tutoring session, and return a structured text response to a client.

The requested MVP is to build that backend first, followed by a simple web client. A native app may replace or extend the web client later.

## Users and Outcomes

- A learner can speak to the English tutor from a client and hear its response.
- The tutor reuses the existing `english-learning` skill, curriculum, and learning state.
- The backend provides a stable boundary that a simple web client and a future native app can both use.

## Current Experience

- Learning currently happens inside an interactive Codex session using text.
- The installed Codex CLI supports non-interactive `codex exec`, JSONL output, and continuing a saved session with `codex exec resume <session-id>`.
- The project has no application runtime, backend framework, audio pipeline, or client.

## Scope

### In Scope

- A voice-tutor backend under `apps/voice-backend/` in this repository.
- Speech-to-text input, Codex session orchestration, structured text output, and learning-state integration.
- An API boundary reusable by a later web client and native app.

### Out of Scope

- Continuous or full-duplex audio streaming, automatic end-of-speech detection, and interruption.
- Server-side text-to-speech and generated reply audio.
- Registration, accounts, multi-learner isolation, and shared classrooms.
- Pronunciation scoring, phoneme analysis, and accent grading.
- The simple web client, native mobile app, and production client interfaces. The simple web client is the next feature after this backend.
- Long-term raw-audio storage or a separate transcript archive.
- Production scaling, high availability, and cloud deployment automation.

## Required Behaviour

- Keep the existing root-level Codex skill structure intact.
- Run each learner turn through the same learner-specific Codex conversation.
- Return the recognized learner transcript and Codex response text.
- Keep learner progress associated with the correct learner and conversation.
- Do not expose Codex, its credentials, or unrestricted filesystem access directly to clients.
- Accept common device audio formats and normalize them before transcription.
- Serialize turns within a session and return the same result for a repeated client turn ID.
- Preserve the active application-session-to-Codex-thread mapping across backend restarts.
- Return stable machine-readable errors without leaking commands, paths, credentials, or model internals.

## Edge and Failure Cases

- Microphone input may be empty, noisy, too long, or in an unsupported format.
- Audio normalization, speech recognition, or Codex may fail independently.
- A Codex conversation may expire, disappear, or become inconsistent with stored learner state.
- Concurrent requests for the same learner may arrive out of order.
- A client may disconnect while a turn is being processed.
- A client may retry after the backend completed a turn but before its response arrived.
- Codex may update learner state but fail to produce a valid structured reply.

## Constraints and Dependencies

- The first implementation runs Codex CLI on the same machine as the backend.
- Codex accepts and produces text, so the backend requires speech recognition while each client requires a speech-synthesis capability.
- The MVP delegates speech synthesis to the client: browser SpeechSynthesis for the initial web client and native TTS for future apps.
- Codex app-server and exec-server interfaces are currently experimental; the CLI path is the conservative MVP integration.
- The current repository contains uncommitted workflow documentation and user-provided Join In course files. This feature must not modify or commit those course files unintentionally.
- Suitability of Codex account authentication for public or multi-user deployment must be checked before production use.
- Local development currently has Node.js `v22.23.1`, npm `10.9.8`, FFmpeg `8.1.2`, `whisper-cli`, and `codex-cli 0.154.0`. A deployment host must provide configured equivalents.
- Resumable Codex sessions persist local conversation history. The backend will not create another transcript archive, but transcript text remains in Codex session storage and selected learning evidence may remain in learner state.

## Decisions

- Release: `mvp`.
- Feature slug: `voice-tutor-backend`.
- Keep the skill and applications in one repository but separate directories.
- Preserve the existing root-level skill files and add the backend at `apps/voice-backend/`.
- Reserve `apps/voice-web/` for the simple web client that follows the backend.
- Build the backend before the web client; preserve an API usable by a future native app.
- Implement the backend with Node.js and TypeScript. Client compatibility is provided through standard HTTP/WebSocket contracts rather than coupling the server to a web-only client.
- Limit the MVP to one configured learner. Do not build registration, accounts, or multi-learner isolation yet; protect the backend with a server-configured access token.
- Use local `whisper.cpp` for MVP speech-to-text. Keep it behind a replaceable backend interface so a faster or hosted recognizer can be adopted later without changing client contracts.
- Return text only from the MVP backend. Client devices own speech synthesis; server-side TTS may be added later as an optional, backward-compatible capability.
- Use turn-based push-to-talk recording for the MVP: the client uploads one completed utterance per request. Streaming audio, automatic end-of-speech detection, and interruption are deferred.
- Keep MVP persistence file-based. Store `LEARNING.md` and the application-session-to-Codex-thread mapping in a private, ignored learner runtime directory; uploaded audio is deleted after transcription. Do not add a database or a separate transcript archive yet.
- On first startup, initialize runtime `LEARNING.md` from the repository's existing local `LEARNING.md` when present; otherwise copy `templates/LEARNING.md`. After initialization, runtime `LEARNING.md` is authoritative for backend sessions.
- Expose a device-neutral versioned API with application-owned session IDs: `POST /v1/sessions`, `POST /v1/sessions/:sessionId/turns`, `DELETE /v1/sessions/:sessionId`, and unauthenticated `GET /health`. Do not expose Codex thread IDs to clients. A completed turn returns at least `transcript` and `replyText`.
- Protect every `/v1/*` endpoint with a static Bearer token supplied through a server environment variable. Keep `/health` unauthenticated and free of sensitive details. Refuse startup when the token is missing, and never persist or log it.
- Implement the HTTP service with Fastify and TypeScript.
- Accept WebM/Opus, WAV, M4A/MP4, and OGG. Limit each utterance to 60 seconds and 10 MB, normalize with FFmpeg to mono 16 kHz PCM WAV, and remove source and normalized temporary files on every terminal path.
- Require a client-generated `turnId`. Persist completed results in private session state so a duplicate `turnId` returns the same response without calling Codex twice.
- Permit one active turn per session. Reject another turn with HTTP 409 `session_busy` instead of silently queuing it.
- Apply subprocess deadlines of 30 seconds for normalization, 120 seconds for transcription, and 180 seconds for a Codex turn. Kill timed-out children, clean temporary files, and return a retryable timeout error.
- Do not automatically retry Codex turns. Client retries use `turnId` idempotency to avoid advancing the conversation twice.
- Run Codex with `workspace-write` and no interactive approvals inside the private learner runtime directory, never at the repository root. Skill and curriculum content are read-only inputs; only runtime learner data is writable.
- Invoke binaries without a shell, parse Codex JSONL, require a structured final response, and keep replies concise for client speech synthesis.
- Configure and validate binary paths, Whisper model path, runtime-data path, skill path, port, and access token through environment variables. Readiness fails when a required dependency is unavailable.
- Deleting an application session removes its Codex-thread mapping but does not erase accumulated learner progress.
- Log request IDs, durations, dependency outcomes, and error codes, but never authorization headers, raw audio, full transcripts, or full tutor replies.

## Open Questions

- Before public or multi-user deployment, confirm that the chosen Codex authentication and usage arrangement permits the intended service model. This does not block the personal MVP.

## Evidence

- Root `SKILL.md` defines the existing tutoring workflow.
- `templates/LEARNING.md` defines the current single-file learner-state shape.
- Local `codex-cli 0.154.0` exposes `codex exec --json` and `codex exec resume <session-id>`.
- Root `AGENTS.md` currently describes the repository as a Markdown-based Codex skill with no application runtime.
- Local inspection on 2026-09-18 confirmed Node.js `v22.23.1`, npm `10.9.8`, FFmpeg `8.1.2`, `/opt/homebrew/bin/whisper-cli`, and `codex-cli 0.154.0`.

## Session Log

## Implementation Coordination

- Integration target: `main`
- Base commit: `14510dfba0aff30a3850cd1584fed5c60261a220`
- Feature branch: `feature/voice-tutor-backend`
- Feature worktree: `/Users/peibin/code/personal/english-learning/.worktrees/voice-tutor-backend`
- Related prerequisite checkpoint: none; uncommitted course materials and workflow documentation in the main checkout remain excluded from the feature worktree.
- Ticket order: `#2`, then `#3` and `#4` in parallel, then `#5`.
- Accepted tickets: `#2` at `e822d183e0f9714a1737e68e17243be0b2af3c8d`; `#3` at `95857e03420dfa0076bf0f1ae9f7fdd7549bad86`; `#4` at `dd27176423b2c58444ec87a7e3a01c3e7fbf2adc`; `#5` at `6a8ebb19de94667db9e5118f8b5543d63e53cc3d`.
- `#2` evidence: `npm test` passed 2 files/4 tests; `npm run build` exited 0; `git diff HEAD^ --check` exited 0. Evidence was inspected against the clean feature worktree at the accepted commit.
- `#3` evidence: `npm test` passed 3 files/23 tests; `npm run build` and `git diff HEAD^ --check` exited 0. Retained logs: `/tmp/issue-3-95857e0-{test,build,diff-check,tested-head}.log`.
- `#4` evidence: `npx vitest run test/app.test.ts` passed 22 tests; `npm run build` and `git diff HEAD^ --check` exited 0. Retained logs: `/tmp/issue-4-dd27176-{test,build,diff-check,tested-head}.log`.
- `#5` evidence: `npm test` passed 4 files/35 tests; `npm run build` and `git diff HEAD^ --check` exited 0; real FFmpeg, whisper.cpp, Codex, and HTTP smoke returned 200 with non-empty transcript/reply. Retained logs: `/tmp/issue-5-6a8ebb1-{test,build,diff-check,tested-head,real-smoke}.log`.
- Worker states: `issue_2_voice_turn`, `issue_3_audio_safety`, `issue_4_durable_sessions`, and `issue_5_operability` ended with no owned process; host release API unavailable.
- Local integration: feature tree merged into `main` at `13543796261f8c787ecb14a17eb964d33dc4af06`; `main` is not pushed.

### 2026-09-18

- Defined the goal as a voice-tutor backend first, followed by a simple web client and potentially a native app.
- Chose a single repository with separate application directories rather than a separate backend repository.
- Preserved the existing root-level skill layout and reserved `apps/voice-backend/` and `apps/voice-web/`.
- Selected Node.js and TypeScript for the backend because the MVP is primarily an I/O and process-orchestration service; its HTTP/WebSocket API remains usable by web, mobile, and device clients.
- Scoped the MVP to one configured learner with token-protected access, deferring account management and multi-learner isolation.
- Selected local `whisper.cpp` for speech-to-text to avoid an additional API dependency and keep recordings on the server; accepted turn-level rather than true realtime transcription for the MVP.
- Chose client-side speech synthesis for the MVP. The backend returns transcript and reply text; browser or native clients speak the reply, with server-side TTS deferred until its quality or consistency benefits are needed.
- Chose one completed audio upload per learner turn. This matches local `whisper.cpp` and keeps the first backend deterministic; realtime streaming and interruption remain later optimizations.
- Retained `LEARNING.md` as the single-learner progress format and deferred a database. Backend sessions use a private runtime copy initialized from existing local progress when available; temporary recordings are removed after transcription and no separate transcript archive is kept.
- Defined an application session API independent of Codex internals. Clients create and end sessions and upload one audio turn at a time; responses contain the recognized transcript and tutor reply text.
- Chose a static environment-configured Bearer token for the single-learner MVP, deferring accounts and short-lived user credentials.
- Delegated the remaining MVP design choices to the recommended minimal implementation.
- Added common-format audio normalization with size and duration limits, turn idempotency, one-turn-at-a-time concurrency, bounded subprocess execution, and privacy-conscious logging.
- Moved backend learner state into an ignored runtime directory so spoken input cannot grant Codex write access to source files. Clarified that resumable Codex sessions retain conversation text even though the backend creates no separate transcript archive.
- The user confirmed that the analysis is ready to become a formal PRD.
