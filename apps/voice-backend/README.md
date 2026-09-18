# Voice Tutor Backend

The backend exposes a local, single-learner HTTP API. It returns text only;
clients own speech synthesis.

## Prerequisites

- Node.js 22 or later
- FFmpeg
- `whisper-cli` and a compatible Whisper model
- An authenticated Codex CLI

Install dependencies with `npm install`, then configure:

```text
VOICE_ACCESS_TOKEN=<private bearer token>
VOICE_RUNTIME_DIR=<private writable directory>
VOICE_SKILL_DIR=<absolute path to this repository>
VOICE_SOURCE_LEARNING_PATH=<optional existing LEARNING.md>
VOICE_FFMPEG_PATH=<absolute ffmpeg executable path>
VOICE_WHISPER_PATH=<absolute whisper-cli executable path>
VOICE_WHISPER_MODEL_PATH=<absolute model path>
VOICE_CODEX_PATH=<absolute codex executable path>
VOICE_PORT=3000
```

Run `npm run build && npm start`. `GET /health` is public. Every `/v1/*`
request requires `Authorization: Bearer <token>`.

Codex stores resumable conversation history in its own local storage. The
backend additionally stores only learner progress and private session-to-thread
mappings in `VOICE_RUNTIME_DIR`; it does not maintain a transcript archive.
