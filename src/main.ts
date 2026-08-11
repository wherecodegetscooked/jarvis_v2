import { WakeWordEngine } from "./wake/WakeWordEngine.js";

type DeviceState = "offline" | "arming" | "armed" | "connecting" | "listening" | "thinking" | "speaking" | "error";

type PublicConfig = {
  ready: boolean;
  realtimeReady: boolean;
  wakeWordReady: boolean;
};

// Wake-Word laeuft lokal via openWakeWord (onnxruntime-web). "hey_jarvis" ist das
// vortrainierte Modell; die Assets liegen same-origin (COEP require-corp).
const WAKE_KEYWORD = "hey_jarvis";

const elements = {
  connection: document.querySelector<HTMLElement>("#connectionLabel")!,
  detail: document.querySelector<HTMLElement>("#stateDetail")!,
  error: document.querySelector<HTMLElement>("#errorMessage")!,
  eyebrow: document.querySelector<HTMLElement>("#eyebrow")!,
  input: document.querySelector<HTMLElement>("#inputLabel")!,
  latency: document.querySelector<HTMLElement>("#latencyLabel")!,
  presence: document.querySelector<HTMLElement>("#presence")!,
  primary: document.querySelector<HTMLButtonElement>("#primaryButton")!,
  remoteAudio: document.querySelector<HTMLAudioElement>("#remoteAudio")!,
  stop: document.querySelector<HTMLButtonElement>("#stopButton")!,
  title: document.querySelector<HTMLElement>("#stateTitle")!,
};

const stateCopy: Record<DeviceState, { eyebrow: string; title: string; detail: string; connection: string }> = {
  offline: {
    eyebrow: "Voice satellite",
    title: "Ready to configure",
    detail: "Add your service keys, then arm this device.",
    connection: "Offline",
  },
  arming: {
    eyebrow: "Microphone permission",
    title: "Preparing this device",
    detail: "Keep this page open while the local wake detector loads.",
    connection: "Starting",
  },
  armed: {
    eyebrow: "Local wake detection",
    title: "Say “Hey Jarvis”",
    detail: "The wake phrase stays on this device. Conversation audio starts after detection.",
    connection: "Armed",
  },
  connecting: {
    eyebrow: "Realtime session",
    title: "Connecting",
    detail: "Opening a low-latency audio path.",
    connection: "Connecting",
  },
  listening: {
    eyebrow: "Conversation active",
    title: "I’m listening",
    detail: "Speak naturally. You can interrupt while Jarvis is answering.",
    connection: "Live",
  },
  thinking: {
    eyebrow: "Conversation active",
    title: "Thinking",
    detail: "Preparing the next spoken response.",
    connection: "Live",
  },
  speaking: {
    eyebrow: "Conversation active",
    title: "Speaking",
    detail: "Start talking at any time to interrupt.",
    connection: "Live",
  },
  error: {
    eyebrow: "Device needs attention",
    title: "Couldn’t start Jarvis",
    detail: "Check the message below, then try again.",
    connection: "Error",
  },
};

let config: PublicConfig;
let state: DeviceState = "offline";
let wakeEngine: WakeWordEngine | null = null;
let peer: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let audioFrame = 0;
let speechStoppedAt: number | null = null;

function logTiming(event: string, fields: Record<string, unknown> = {}) {
  console.info(JSON.stringify({ event, at: new Date().toISOString(), ...fields }));
}

function setState(next: DeviceState) {
  state = next;
  const copy = stateCopy[next];
  elements.eyebrow.textContent = copy.eyebrow;
  elements.title.textContent = copy.title;
  elements.detail.textContent = copy.detail;
  elements.connection.textContent = copy.connection;
  elements.presence.dataset.state = next;

  const inConversation = ["connecting", "listening", "thinking", "speaking"].includes(next);
  elements.stop.hidden = !inConversation;
  elements.primary.hidden = inConversation;
  elements.primary.disabled = next === "arming";
  elements.primary.textContent = next === "armed" ? "Start now" : next === "error" ? "Try again" : "Arm microphone";
}

function showError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  elements.error.textContent = message;
  elements.error.hidden = false;
  setState("error");
  console.error(error);
}

function clearError() {
  elements.error.hidden = true;
  elements.error.textContent = "";
}

async function initializeWakeWord() {
  if (!config.wakeWordReady) {
    throw new Error("Wake-word assets are unavailable on the server");
  }
  if (!wakeEngine) {
    // Schwelle und Debug per URL-Parameter tunebar (?wakeThreshold=0.35&wakeDebug),
    // damit wir die Empfindlichkeit ohne Rebuild an echten Scores kalibrieren.
    // Niedriger = empfindlicher (mehr Treffer, aber auch mehr Fehlausloesungen).
    const params = new URLSearchParams(location.search);
    const requested = Number(params.get("wakeThreshold"));
    const detectionThreshold = Number.isFinite(requested) && requested > 0 && requested < 1 ? requested : 0.4;
    wakeEngine = new WakeWordEngine({
      keywords: [WAKE_KEYWORD],
      baseAssetUrl: "/models",
      ortWasmPath: "/ort/",
      detectionThreshold,
      debug: params.has("wakeDebug"),
    });
    logTiming("wake_word.config", { detectionThreshold, debug: params.has("wakeDebug") });
    wakeEngine.on("detect", (detection) => {
      logTiming("wake_word.detected", { keyword: detection.keyword, score: Number(detection.score.toFixed(3)) });
      void activateConversation("wake_word");
    });
    wakeEngine.on("error", (error) => showError(error));
    await wakeEngine.load();
  }
  await resumeWakeWord();
}

// Der Wake-Detektor besitzt hier das Mikrofon. Er muss vor der Realtime-Session
// vollstaendig gestoppt werden (pauseWakeWord) und wird danach neu gestartet.
async function resumeWakeWord() {
  if (wakeEngine) await wakeEngine.start();
  const devices = await navigator.mediaDevices.enumerateDevices();
  const input = devices.find((device) => device.kind === "audioinput" && device.deviceId === "default")
    ?? devices.find((device) => device.kind === "audioinput");
  elements.input.textContent = input?.label || "System default";
  setState("armed");
}

async function pauseWakeWord() {
  if (wakeEngine) await wakeEngine.stop();
}

async function armDevice() {
  clearError();
  setState("arming");
  try {
    await initializeWakeWord();
    logTiming("wake_word.armed");
  } catch (error) {
    showError(error);
  }
}

async function activateConversation(trigger: "wake_word" | "manual") {
  if (peer) return;
  clearError();
  setState("connecting");
  const activatedAt = performance.now();
  logTiming("conversation.activation", { trigger });

  try {
    if (!config.realtimeReady) throw new Error("OPENAI_API_KEY is missing from .env");
    await pauseWakeWord();

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    peer = new RTCPeerConnection();
    localStream.getTracks().forEach((track) => peer!.addTrack(track, localStream!));

    peer.ontrack = ({ streams }) => {
      elements.remoteAudio.srcObject = streams[0];
      void monitorRemoteAudio(streams[0]);
    };
    peer.onconnectionstatechange = () => {
      if (peer?.connectionState === "failed" || peer?.connectionState === "disconnected") {
        showError(new Error(`Realtime connection ${peer.connectionState}`));
        void endConversation(false);
      }
    };

    const events = peer.createDataChannel("oai-events");
    events.addEventListener("open", () => {
      logTiming("conversation.connected", { durationMs: Math.round(performance.now() - activatedAt) });
      setState("listening");
    });
    events.addEventListener("message", (message) => handleRealtimeEvent(message.data));

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const response = await fetch("/api/realtime/session", {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: offer.sdp,
    });
    if (!response.ok) throw new Error((await response.text()) || `Session setup failed (${response.status})`);
    await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
  } catch (error) {
    await endConversation(false);
    showError(error);
  }
}

function handleRealtimeEvent(raw: string) {
  try {
    const event = JSON.parse(raw) as { type?: string; error?: { message?: string } };
    if (event.type === "input_audio_buffer.speech_started") setState("listening");
    if (event.type === "input_audio_buffer.speech_stopped") {
      speechStoppedAt = performance.now();
      setState("thinking");
    }
    if (event.type === "response.output_audio_transcript.delta") setState("speaking");
    if (event.type === "response.done") setState("listening");
    if (event.type === "error") showError(new Error(event.error?.message || "Realtime session error"));
  } catch (error) {
    console.warn("Ignored malformed realtime event", error);
  }
}

async function monitorRemoteAudio(stream: MediaStream) {
  audioContext = new AudioContext();
  await audioContext.resume();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);

  const measure = () => {
    analyser.getByteTimeDomainData(samples);
    let energy = 0;
    for (const sample of samples) energy += Math.abs(sample - 128);
    if (speechStoppedAt !== null && energy / samples.length > 1.5) {
      const durationMs = Math.round(performance.now() - speechStoppedAt);
      elements.latency.textContent = `${durationMs} ms`;
      logTiming("conversation.first_audio", { durationMs });
      speechStoppedAt = null;
      setState("speaking");
    }
    audioFrame = requestAnimationFrame(measure);
  };
  measure();
}

async function endConversation(rearm = true) {
  cancelAnimationFrame(audioFrame);
  speechStoppedAt = null;
  peer?.close();
  peer = null;
  localStream?.getTracks().forEach((track) => track.stop());
  localStream = null;
  elements.remoteAudio.srcObject = null;
  if (audioContext) await audioContext.close();
  audioContext = null;
  logTiming("conversation.ended");

  if (rearm && wakeEngine) {
    try {
      await resumeWakeWord();
    } catch (error) {
      showError(error);
    }
  }
}

elements.primary.addEventListener("click", () => {
  if (state === "armed") void activateConversation("manual");
  else void armDevice();
});
elements.stop.addEventListener("click", () => void endConversation());
window.addEventListener("beforeunload", () => {
  peer?.close();
  localStream?.getTracks().forEach((track) => track.stop());
  void wakeEngine?.stop();
});

async function bootstrap() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (!response.ok) throw new Error("Jarvis server configuration is unavailable");
    config = (await response.json()) as PublicConfig;
    if (config.ready) {
      elements.title.textContent = "Ready on this device";
      elements.detail.textContent = "Arm the microphone once, then say “Hey Jarvis”.";
    } else {
      elements.detail.textContent = "Add OPENAI_API_KEY to .env, then restart the server.";
    }
  } catch (error) {
    showError(error);
  }
}

void bootstrap();
