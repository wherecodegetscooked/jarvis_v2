# Decisions

Record durable architectural and product decisions here. Add new entries rather than rewriting history; mark superseded decisions explicitly.

## ADR-001 — macOS is the V1 host
- **Status:** Accepted
- **Context:** The first milestone needs a concrete audio and packaging target.
- **Decision:** Build and validate the initial “Hey Jarvis” experience on macOS.
- **Consequences:** We may use macOS-native audio and permission APIs. Cross-platform abstraction is deferred until the voice loop works.

## ADR-002 — Optimize V1 for lowest perceived latency
- **Status:** Accepted
- **Context:** Voice quality depends more on responsiveness and interruption handling than breadth of features.
- **Decision:** Prefer the architecture that minimizes time to first audio and supports streaming, even when it uses cloud services.
- **Consequences:** Local-only processing is not a V1 requirement. Privacy boundaries and data retention must still be explicit.

## ADR-003 — Start from a new codebase
- **Status:** Accepted
- **Context:** There is no existing implementation to preserve.
- **Decision:** Create a small vertical-slice codebase rather than a generalized assistant platform.
- **Consequences:** Add abstractions only when a second implementation or measured need justifies them.

## ADR-004 — Defer memory, tools, and hardware integration
- **Status:** Accepted
- **Context:** These are strategic goals but can obscure the core voice risk.
- **Decision:** Design clean seams for them, but do not implement them before the voice loop meets its latency and reliability bar.
- **Consequences:** V1 interfaces should be replaceable without becoming a plugin framework.

## ADR-005 — Use portable browser voice satellites with a private hub
- **Status:** Accepted
- **Context:** The first device is a Mac, but the intended runtime includes an older Samsung Tab S4, a small server, and Raspberry Pi-class hardware. A Mac-specific desktop implementation would create migration work before validating the voice loop.
- **Decision:** Build the V1 device experience as a browser client served by a small Node hub. Each satellite owns microphone, speaker, local wake detection, and WebRTC media. The hub protects provider credentials and relays realtime session setup.
- **Alternatives considered:** Electron offers convenient macOS packaging but is a poor fit for Android. A native Swift client has strong macOS integration but cannot run on the tablet. A Python daemon is portable to Linux but requires manual audio buffering, playback, echo control, and device-specific UI work.
- **Consequences:** One client can run on macOS, Android, and Raspberry Pi Chromium. Remote devices require private HTTPS. Browser background suspension means V1 wake detection requires the page to remain active; a native wrapper remains a measured future option.

## ADR-006 — Select Porcupine wake detection and OpenAI Realtime over WebRTC for the spike
- **Status:** Partially superseded by ADR-008 (wake detection only; the OpenAI Realtime over WebRTC choice still stands)
- **Context:** V1 needs local wake detection, low perceived latency, echo handling, and interruption without building an audio transport stack.
- **Decision:** Use Picovoice Porcupine’s built-in “Jarvis” model locally and OpenAI Realtime over WebRTC for the active conversation.
- **Alternatives considered:** Browser speech recognition is not a reliable local always-on wake detector. OpenAI Realtime over WebSocket would require manual audio encoding, jitter handling, playback, cancellation, and truncation. Fully local speech and language models add hardware and latency risk before the interaction is validated.
- **Consequences:** Two service credentials are required. Wake audio stays local, while active conversation audio is processed by OpenAI. Provider adapters remain deliberately narrow and can be replaced after measured evidence.

## ADR-007 — Provision the Porcupine acoustic model at install and require cross-origin isolation
- **Status:** Partially superseded by ADR-008 (the model-provisioning half is obsolete; the cross-origin-isolation requirement still holds, now for onnxruntime-web)
- **Context:** The Porcupine web SDK was pinned to 4.0.1 (the 3.0.4 range in package.json was never a published version and blocked installation). Two facts of Porcupine 4 were unmet in the code: (1) the built-in keyword models are bundled as base64, but the shared acoustic model `porcupine_params.pv` is no longer shipped as a raw file inside the npm package, so `scripts/prepare-assets.mjs` could not find it; (2) the SDK uses pthreads WASM and therefore `SharedArrayBuffer`, which requires a cross-origin-isolated browsing context — but `server.mjs` set no COOP/COEP headers.
- **Decision:** Fetch `porcupine_params.pv` from the official Picovoice repository into `public/` during `postinstall` (`scripts/prepare-assets.mjs`, overridable via `PICOVOICE_PARAMS_URL`, header-validated), and set `Cross-Origin-Opener-Policy: same-origin` plus `Cross-Origin-Embedder-Policy: require-corp` on all hub responses. All page subresources are same-origin, so `require-corp` is safe.
- **Alternatives considered:** Committing the ~1 MB model into the repo (rejected: keeps a redistributed binary in git, still needs a documented source); COEP `credentialless` (unnecessary since nothing loads cross-origin no-cors).
- **Consequences:** A clean install needs network access to fetch the model once. The wake path can only run in a secure, cross-origin-isolated context (localhost or the Tailscale HTTPS URL). The downloaded model self-reports `porcupine4.0.0`, matching the 4.0.x SDK. Still unverified: that the browser actually reports `crossOriginIsolated === true` and detects the wake word end-to-end — that is the pending credentialed test.

## ADR-008 — Replace Picovoice Porcupine with openWakeWord running in-browser via onnxruntime-web
- **Status:** Accepted (supersedes the wake-detection choice in ADR-006 and the model-provisioning half of ADR-007)
- **Context:** Picovoice discontinued its free tier on 30 June 2026 and disabled existing free AccessKeys; paid plans start around $899/month. Porcupine is therefore no longer viable for a personal, non-commercial project. The wake engine is the only part of the slice that depended on it — the OpenAI Realtime conversation path is unaffected.
- **Decision:** Detect the wake phrase locally in the browser with [openWakeWord](https://github.com/dscripka/openWakeWord) (Apache-2.0), using its pretrained `hey_jarvis` model and running inference through `onnxruntime-web` (MIT). The wake phrase becomes “Hey Jarvis”. The browser-first engine (mel → embedding → Silero VAD → keyword classifier, AudioWorklet at 16 kHz) is vendored from [`dnavarrom/openwakeword_wasm`](https://github.com/dnavarrom/openwakeword_wasm) (MIT) into `src/wake/WakeWordEngine.js` rather than taken as a runtime git dependency, so the wake path stays reviewable and pinned. The four ONNX models live under `public/models/`; the onnxruntime-web WASM/`.mjs` runtime is copied from the npm package into `public/ort/` at `postinstall`. Both are served **same-origin and ahead of the Vite middleware** in `server.mjs`, because otherwise Vite rewrites ORT’s dynamically imported `.mjs` glue (`?import`) and returns 404 (“no available backend”). The cross-origin-isolation headers from ADR-007 are retained — onnxruntime-web’s threaded WASM also needs `SharedArrayBuffer`.
- **Alternatives considered:** Adopting Home Assistant Assist (the productized free equivalent, also openWakeWord-based) — rejected for V1 because it replaces the low-latency speech-to-speech loop with an STT→LLM→TTS pipeline, giving up the project’s primary differentiator. A button-only assistant with no wake word — rejected as it abandons the North-Star experience. Depending on `openwakeword_wasm` as a runtime git dependency — rejected on supply-chain grounds in favour of vendoring.
- **Consequences:** No client-side wake credential remains; `OPENAI_API_KEY` is the only required secret, and `PICOVOICE_ACCESS_KEY` is removed everywhere. The client bundle shrank from ~3.5 MB to ~0.42 MB (ORT WASM is loaded on demand, ~12 MB, cached). Verified in a real browser: `crossOriginIsolated === true`, onnxruntime-web initializes, and all four models load; still unverified: live “Hey Jarvis” detection on real microphone audio and speech-end-to-first-audio latency — the pending credentialed device test.
