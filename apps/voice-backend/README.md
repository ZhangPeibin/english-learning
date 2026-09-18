# Voice Tutor Backend

This local, single-learner service accepts recorded speech and returns a transcript plus a text tutor reply. Clients own speech synthesis. It binds to `127.0.0.1`; place a separately secured gateway in front of it only after reviewing the deployment warning below.

## Host prerequisites

- Node.js 22 or later and npm.
- FFmpeg. On macOS, install it with `brew install ffmpeg`. On Debian or Ubuntu, use `sudo apt install ffmpeg`.
- `whisper-cli` from [whisper.cpp](https://github.com/ggerganov/whisper.cpp), plus a multilingual local model such as `ggml-base.bin`. Build or install whisper.cpp using its upstream instructions; model files are not included here.
- An installed and authenticated Codex CLI. Run `codex login` as the operating-system account that will run this service.
- A private, writable runtime directory outside the source checkout. Give only the service account access (for example, mode `0700`).

Install JavaScript dependencies with `npm ci` in this directory. Resolve executable locations with `command -v ffmpeg`, `command -v whisper-cli`, and `command -v codex`.

## Configuration

Set every required value as an environment variable. Paths must be absolute. Startup creates `VOICE_RUNTIME_DIR` when absent, then verifies that all configured files and directories are usable.

```sh
export VOICE_ACCESS_TOKEN='generate-a-long-random-secret'
export VOICE_RUNTIME_DIR='/private/path/voice-tutor-runtime'
export VOICE_SKILL_DIR='/absolute/path/english-learning'
export VOICE_FFMPEG_PATH='/absolute/path/ffmpeg'
export VOICE_WHISPER_PATH='/absolute/path/whisper-cli'
export VOICE_WHISPER_MODEL_PATH='/private/path/ggml-base.bin'
export VOICE_CODEX_PATH='/absolute/path/codex'
export VOICE_PORT='3000'
```

`VOICE_SOURCE_LEARNING_PATH` is optional. When set, it must be a readable learner-state file and initializes runtime progress on first startup. Otherwise the backend uses `VOICE_SKILL_DIR/LEARNING.md` when present, then the bundled template. Runtime progress is authoritative after initialization.

Keep the token out of shell history, source control, service definitions readable by other users, and logs. A host secret manager or a mode-`0600` environment file loaded by the service manager is preferable.

## Start, check, and stop

Build and start the foreground service:

```sh
npm run build
npm start
```

Use the operating system's service manager for unattended operation. Configure it to send `SIGTERM` for shutdown and restart only on unexpected failure. Do not run the service from the repository root or point `VOICE_RUNTIME_DIR` into the repository.

The public health endpoint is intentionally nonsensitive:

```sh
curl --fail --silent http://127.0.0.1:3000/health
# {"status":"ready"}
```

The process refuses startup unless its token, port, runtime and skill directories, schema/template files, executables, and Whisper model are usable. Consequently, a running process reports ready; failed prerequisites leave no listening service. Application endpoints under `/v1/` require `Authorization: Bearer <token>`.

Stop a foreground process with `Ctrl-C`, or have the service manager send `SIGTERM`. FFmpeg, Whisper, and Codex calls are bounded to 30, 120, and 180 seconds respectively. A timeout terminates the child process and returns a retryable stage-specific error. Codex turns are never replayed automatically.

Whisper automatically detects English and Chinese for every turn. Use a multilingual model; `.en` model files cannot recognize Chinese.

## Real stack smoke check

The smoke check is explicit and non-default. It is not part of `npm test` or CI. It starts the backend on a temporary loopback port, sends one real recording through FFmpeg, whisper.cpp, Codex, and the English Learning skill, and prints the transcript and reply.

Before running it, complete all configuration above, authenticate Codex, install the selected local Whisper model, and record a short utterance in WAV, WebM, M4A, MP4, or OGG format. The command uses the configured runtime and therefore creates real learner/session state and local Codex history.

```sh
VOICE_SMOKE_AUDIO='/absolute/path/short-utterance.wav' npm run smoke
```

A successful result contains non-empty `transcript` and `replyText` fields. This check depends on local binaries, the selected model, machine performance, and Codex credentials, so it must not become a deterministic test gate.

## Data, logs, and privacy

Uploaded and normalized temporary audio is deleted after every success or failure path. Backend logs contain request IDs, durations, dependency stages/outcomes, and safe error codes; they omit authorization values, raw audio, complete transcripts, complete replies, dependency diagnostics, and configured filesystem paths.

`VOICE_RUNTIME_DIR` contains learner progress, application session mappings, completed-turn results, and durable conversation history. Back it up as private learner data. Ending an application session preserves learner progress and conversation history. Resumable Codex sessions also retain conversation history in the Codex CLI's local storage, and selected learning evidence can remain in `LEARNING.md`. Apply the same access and retention controls to both locations.

The backend also writes confirmed conversation text to `conversation-history.json` in `VOICE_RUNTIME_DIR`. This mode-`0600` JSON file contains a schema version and chronologically ordered conversations with application session IDs, timestamps, learner transcripts, and tutor replies. It excludes raw audio, Codex thread IDs, tokens, commands, and local paths. Failed turns and turns completed before this feature was enabled are not added.

To clear the retained history, stop the backend, delete `conversation-history.json`, and start the backend again. It recreates an empty file. There is no history API, web view, export, analysis, or automatic skill modification.

## Troubleshooting

- Startup names the unusable environment variable or required skill asset. Check absolute paths, file type, permissions, and execute bits under the service account.
- `normalization_*` or `invalid_audio`: run the configured FFmpeg against the recording and confirm the format is supported and no longer than 60 seconds.
- `transcription_*` or `empty_transcript`: confirm the model matches the installed whisper.cpp build, is readable, and the host has enough memory and time for it.
- `codex_failed`: verify `VOICE_CODEX_PATH`, the service account's Codex login, network access, and runtime-directory permissions.
- `codex_timeout`: inspect host load and Codex availability, then retry with the same `turnId`; the backend does not automatically replay the call.
- `codex_invalid_response`: confirm the installed Codex CLI supports `exec --json`, `exec resume`, and `--output-schema` as used by this backend.
- HTTP `401`: send exactly `Authorization: Bearer <VOICE_ACCESS_TOKEN>` and do not log the header.
- HTTP `409 session_busy`: wait for the current turn to finish and retry; turns are not queued.

Public or multi-user deployment is outside this MVP. Before exposing it beyond a private single-learner host, separately confirm that the selected Codex authentication and usage arrangement permits that service model, and add transport security, user isolation, rate limits, and production access controls.
