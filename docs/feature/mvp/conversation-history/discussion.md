# Conversation History - Requirements Discussion

**Status:** ready-for-prd
**Release:** mvp
**Feature:** conversation-history

## Problem

The voice tutor persists completed turn text only inside the active application's session record. Starting a new session deletes that session record, and the client cannot retrieve prior turns. This prevents the learner and maintainer from reviewing recognition mistakes, tutor-response quality, and repeated teaching behaviour when improving the English Learning skill.

## Users and Outcomes

- The maintainer can inspect real learner transcripts and tutor replies to identify evidence-based improvements to the English Learning skill.
- Analysis records remain private local implementation data rather than a learner-facing history product.

## Current Experience

- Each successful turn is persisted in `VOICE_RUNTIME_DIR/sessions.json` by client-generated `turnId` with its recognized `transcript` and tutor `replyText`.
- The backend preserves these completed results across restarts for idempotent retries.
- Clicking New Session calls `DELETE /v1/sessions/:sessionId`, which removes the Codex-thread mapping and all completed turns for that session.
- The frontend stores only the active application session ID in per-tab `sessionStorage`; it does not reload or display persisted turns.
- Uploaded and normalized audio files are deleted after each terminal request path.
- Codex independently retains resumable thread history, while `LEARNING.md` retains selected learner progress; neither is an application history API.

## Scope

### In Scope

- Durable conversation records that survive session closure and backend restarts.
- Learner transcript, tutor reply, and timestamps for each confirmed completed turn.
- A structured local JSON record that another agent can read later.

### Out of Scope

- Retention of uploaded, normalized, or other raw audio recordings.
- A learner-facing history list, conversation restoration UI, or resuming an archived Codex conversation from history.
- A public or client-facing history API.
- Analysis commands, generated reports, automated recommendations, or automatic changes to the English Learning skill.
- Application-level deletion endpoints or UI for retained history.
- Transcript correction or annotation workflows.
- Migration of completed turns already present in `sessions.json`.
- Multi-user accounts, shared classrooms, or public history access.
- Automatic modification of the English Learning skill based on recorded conversations.
- Analytics infrastructure or a separate database unless file storage proves insufficient.

## Required Behaviour

- Starting a new session must not silently destroy retained conversation history.
- History must remain until the operator manually removes the private JSON history file.
- Retained history must preserve chronological turn order and enough timestamps to review a conversation.
- Uploaded and normalized audio must continue to be deleted on every terminal request path.
- Retained records must be available as structured local JSON without being exposed to the web client.
- Codex thread IDs, access tokens, dependency diagnostics, and local filesystem paths must remain private.
- History writes must remain atomic and retry-safe.

## Edge and Failure Cases

- A completed turn may be retried after its response was lost; history must not duplicate it.
- A turn may fail before or after Codex ambiguously advances; only confirmed completed application results can enter durable history.
- Existing `sessions.json` data must remain readable or be migrated safely.
- Missing or corrupt history state must fail safely without exposing private content.
- Ending an active session must not delete retained history or `LEARNING.md`.

## Constraints and Dependencies

- This remains a private, single-learner local service protected by the existing Bearer token.
- File-based persistence and atomic replacement are the established MVP storage model.
- Conversation text is private learner data and must remain under `VOICE_RUNTIME_DIR` with existing private-directory controls.
- The current privacy contract deletes temporary audio and excludes full transcripts and replies from operational logs.

## Decisions

- Release: `mvp`.
- Feature slug: `conversation-history`.
- Persist conversation history because it enables review of recognition failures and tutor behaviour, providing concrete evidence for improving the English Learning skill.
- Persist only confirmed learner transcripts, tutor replies, and timestamps; do not retain raw or normalized audio.
- Retain conversation history indefinitely by default.
- Starting a new conversation archives the previous conversation; it does not delete retained turns.
- Do not provide history deletion APIs or UI. The operator can clear all retained history by manually deleting the private history JSON file.
- Keep retained history backend-only for analysis and learning-flow optimization; do not add learner-facing history UI or resume behaviour.
- Limit this feature to recording structured JSON. Any later agent that reads or analyzes the file is outside this feature.
- Start the new history file empty when the feature is enabled; do not migrate existing `sessions.json` turns.
- Skill improvements remain a deliberate human-reviewed workflow; retained conversations do not automatically rewrite skill files.

## Open Questions

- None.

## Evidence

- `apps/voice-backend/src/state.ts` stores `completedTurns` under active session records and deletes the full record in `deleteSession()`.
- `apps/voice-backend/src/app.ts` removes temporary audio on every terminal path and exposes no history-read endpoint.
- `apps/voice-web/src/main.ts` clears visible messages and calls session deletion when the learner starts a new session.
- Existing backend requirements deliberately avoided a separate transcript archive; this feature explicitly revisits that boundary for review and skill improvement.

## Session Log

### 2026-09-18

- Requested durable recording of learner/tutor conversations.
- Identified skill optimization as the primary reason: inspect recognition errors and tutor replies before making deliberate changes to the English Learning skill.
- Confirmed that current completed-turn persistence is retry state, not durable user-visible history, because ending a session deletes it.
- Chose text-only history: retain transcript, reply, and timestamps while preserving the existing immediate audio-deletion policy.
- Chose indefinite retention with explicit single-conversation and clear-all deletion; starting a new conversation only archives the old one.
- Limited the feature to private backend analysis records; no web history list, client history API, or archived-session resume is needed.
- Further narrowed responsibility to recording structured JSON only. Analysis, reports, recommendations, and Skill modification will be handled separately by another agent when the user requests them.
- Removed application-level deletion from scope. History is cleared only by manually deleting its private JSON file; ending a session never removes retained history.
- Chose not to migrate existing `sessions.json` turns. Durable history begins when this feature is enabled.
- Confirmed the requirements analysis is ready to become a formal PRD.
