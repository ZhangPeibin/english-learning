import {
  AudioLines, CircleStop, LoaderCircle, MessageCircle, Mic, Plus,
  RotateCcw, Upload, Volume2, VolumeX, createIcons
} from "lucide";
import { ApiError, VoiceApi, type TurnResult } from "./api";
import "./styles.css";

const api = new VoiceApi();
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const conversation = byId<HTMLElement>("conversation");
const messages = byId<HTMLDivElement>("messages");
const emptyState = byId<HTMLElement>("empty-state");
const recordButton = byId<HTMLButtonElement>("record");
const fileInput = byId<HTMLInputElement>("audio-file");
const newSessionButton = byId<HTMLButtonElement>("new-session");
const autoSpeakButton = byId<HTMLButtonElement>("auto-speak");
const recordingStatus = byId<HTMLSpanElement>("recording-status");
const recordingTime = byId<HTMLTimeElement>("recording-time");
const waveform = byId<HTMLDivElement>("waveform");
const errorBanner = byId<HTMLDivElement>("error-banner");
const errorMessage = byId<HTMLSpanElement>("error-message");
const retryButton = byId<HTMLButtonElement>("retry");
const connection = byId<HTMLSpanElement>("connection");
const connectionLabel = byId<HTMLSpanElement>("connection-label");

const icons = { AudioLines, CircleStop, LoaderCircle, MessageCircle, Mic, Plus, RotateCcw, Upload, Volume2, VolumeX };
const refreshIcons = () => createIcons({ icons });
for (let index = 0; index < 36; index += 1) waveform.append(document.createElement("span"));

interface PendingTurn { audio: Blob; filename: string; turnId: string }

let sessionId = sessionStorage.getItem("voice-session-id");
let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: BlobPart[] = [];
let startedAt = 0;
let recordingTimer: number | undefined;
let recordingDeadline: number | undefined;
let animationFrame: number | undefined;
let audioContext: AudioContext | undefined;
let analyser: AnalyserNode | undefined;
let pendingTurn: PendingTurn | null = null;
let busy = false;
let autoSpeak = localStorage.getItem("voice-auto-speak") !== "false";

function setConnection(online: boolean) {
  connection.classList.toggle("offline", !online);
  connectionLabel.textContent = online ? "Backend online" : "Backend offline";
}

function setBusy(value: boolean, label = "Ready") {
  busy = value;
  recordButton.disabled = value;
  fileInput.disabled = value;
  newSessionButton.disabled = value;
  recordingStatus.textContent = label;
  recordButton.classList.toggle("processing", value);
  recordButton.innerHTML = value
    ? '<i data-lucide="loader-circle"></i>'
    : '<i data-lucide="mic"></i>';
  recordButton.setAttribute("aria-label", value ? label : "Start recording");
  refreshIcons();
}

function updateAutoSpeak() {
  autoSpeakButton.setAttribute("aria-pressed", String(autoSpeak));
  autoSpeakButton.setAttribute("aria-label", autoSpeak ? "Disable automatic speech" : "Enable automatic speech");
  autoSpeakButton.title = autoSpeak ? "Disable automatic speech" : "Enable automatic speech";
  autoSpeakButton.innerHTML = autoSpeak
    ? '<i data-lucide="volume-2"></i>'
    : '<i data-lucide="volume-x"></i>';
  refreshIcons();
}

function showError(message: string, canRetry: boolean) {
  errorMessage.textContent = message;
  errorBanner.hidden = false;
  retryButton.hidden = !canRetry;
}

function clearError() {
  errorBanner.hidden = true;
  retryButton.hidden = true;
}

function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

function addTurn(turn: TurnResult) {
  emptyState.hidden = true;
  const learner = document.createElement("article");
  learner.className = "message learner-message";
  learner.innerHTML = `<span class="message-label">You</span><p></p>`;
  learner.querySelector("p")!.textContent = turn.transcript;

  const tutor = document.createElement("article");
  tutor.className = "message tutor-message";
  tutor.innerHTML = `
    <div class="message-heading">
      <span class="message-label">Tutor</span>
      <button class="speak-button" type="button" title="Speak reply" aria-label="Speak tutor reply">
        <i data-lucide="volume-2"></i>
      </button>
    </div>
    <p></p>`;
  tutor.querySelector("p")!.textContent = turn.replyText;
  tutor.querySelector("button")!.addEventListener("click", () => speak(turn.replyText));
  messages.append(learner, tutor);
  refreshIcons();
  requestAnimationFrame(() => conversation.scrollTo({ top: conversation.scrollHeight, behavior: "smooth" }));
}

async function ensureSession(): Promise<string> {
  if (sessionId) return sessionId;
  sessionId = await api.createSession();
  sessionStorage.setItem("voice-session-id", sessionId);
  return sessionId;
}

function errorCopy(error: unknown): string {
  if (!(error instanceof ApiError)) return "The backend could not be reached.";
  const copies: Record<string, string> = {
    session_busy: "The tutor is still finishing the previous turn.",
    audio_too_large: "That recording is larger than 10 MB.",
    audio_too_long: "That recording is longer than 60 seconds.",
    unsupported_audio: "That audio format is not supported.",
    empty_audio: "No audio was recorded.",
    empty_transcript: "No speech was recognized.",
    normalization_timeout: "Audio processing took too long.",
    transcription_timeout: "Speech recognition took too long.",
    codex_timeout: "The tutor took too long to reply.",
    unauthorized: "The local access token is not accepted."
  };
  return copies[error.code] ?? error.message;
}

async function sendTurn(turn: PendingTurn) {
  if (busy) return;
  clearError();
  setBusy(true, "Thinking");
  pendingTurn = turn;
  try {
    let activeSession = await ensureSession();
    let result: TurnResult;
    try {
      result = await api.submitTurn(activeSession, turn.turnId, turn.audio, turn.filename);
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== "session_not_found") throw error;
      sessionId = null;
      sessionStorage.removeItem("voice-session-id");
      activeSession = await ensureSession();
      result = await api.submitTurn(activeSession, turn.turnId, turn.audio, turn.filename);
    }
    pendingTurn = null;
    addTurn(result);
    if (autoSpeak) speak(result.replyText);
  } catch (error) {
    const canRetry = !(error instanceof ApiError) || error.retryable;
    showError(errorCopy(error), canRetry);
  } finally {
    setBusy(false);
  }
}

function preferredMimeType(): string | undefined {
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"]
    .find((type) => MediaRecorder.isTypeSupported(type));
}

function extensionFor(type: string): string {
  if (type.includes("mp4")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  return "webm";
}

function updateRecordingTime() {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  recordingTime.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function animateWaveform() {
  if (!analyser) return;
  const values = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(values);
  const bars = waveform.children;
  for (let index = 0; index < bars.length; index += 1) {
    const value = values[Math.floor(index * values.length / bars.length)] ?? 0;
    (bars[index] as HTMLElement).style.height = `${Math.max(4, Math.round(value / 5))}px`;
  }
  animationFrame = requestAnimationFrame(animateWaveform);
}

function releaseRecorder() {
  if (recordingTimer) window.clearInterval(recordingTimer);
  if (recordingDeadline) window.clearTimeout(recordingDeadline);
  if (animationFrame) cancelAnimationFrame(animationFrame);
  stream?.getTracks().forEach((track) => track.stop());
  void audioContext?.close();
  stream = null;
  audioContext = undefined;
  analyser = undefined;
  recordingTimer = undefined;
  recordingDeadline = undefined;
  recordingTime.textContent = "0:00";
  for (const bar of waveform.children) (bar as HTMLElement).style.height = "4px";
}

function stopRecording() {
  if (recorder?.state === "recording") recorder.stop();
}

async function startRecording() {
  if (busy || recorder?.state === "recording") return;
  clearError();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    const mimeType = preferredMimeType();
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      const type = recorder?.mimeType || mimeType || "audio/webm";
      const audio = new Blob(chunks, { type });
      releaseRecorder();
      recorder = null;
      recordButton.classList.remove("recording");
      recordButton.innerHTML = '<i data-lucide="mic"></i>';
      recordButton.setAttribute("aria-label", "Start recording");
      recordButton.title = "Start recording";
      recordingStatus.textContent = "Ready";
      refreshIcons();
      if (audio.size) void sendTurn({ audio, filename: `recording.${extensionFor(type)}`, turnId: crypto.randomUUID() });
      else showError("No audio was recorded.", false);
    });

    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    recorder.start(250);
    startedAt = Date.now();
    updateRecordingTime();
    recordingTimer = window.setInterval(updateRecordingTime, 250);
    recordingDeadline = window.setTimeout(stopRecording, 58_000);
    recordButton.classList.add("recording");
    recordButton.innerHTML = '<i data-lucide="circle-stop"></i>';
    recordButton.setAttribute("aria-label", "Stop recording");
    recordButton.title = "Stop recording";
    recordingStatus.textContent = "Listening";
    refreshIcons();
    animateWaveform();
  } catch {
    releaseRecorder();
    showError("Microphone access is unavailable.", false);
  }
}

recordButton.addEventListener("click", () => {
  if (recorder?.state === "recording") stopRecording();
  else void startRecording();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (!file) return;
  void sendTurn({ audio: file, filename: file.name, turnId: crypto.randomUUID() });
});

retryButton.addEventListener("click", () => {
  if (pendingTurn) void sendTurn(pendingTurn);
});

newSessionButton.addEventListener("click", async () => {
  if (busy || recorder?.state === "recording") return;
  clearError();
  window.speechSynthesis?.cancel();
  const oldSession = sessionId;
  sessionId = null;
  sessionStorage.removeItem("voice-session-id");
  messages.replaceChildren();
  emptyState.hidden = false;
  if (oldSession) {
    try { await api.deleteSession(oldSession); } catch { /* A new local session can still start. */ }
  }
});

autoSpeakButton.addEventListener("click", () => {
  autoSpeak = !autoSpeak;
  localStorage.setItem("voice-auto-speak", String(autoSpeak));
  if (!autoSpeak) window.speechSynthesis?.cancel();
  updateAutoSpeak();
});

updateAutoSpeak();
refreshIcons();
void api.health().then(setConnection);
