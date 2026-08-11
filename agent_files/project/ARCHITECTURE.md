# Architecture

## Status
Initial baseline for Jarvis V1. Update this file whenever implemented system boundaries, data flows, interfaces, or deployment assumptions change.

## V1 Goal
On a macOS computer, the user says “Hey Jarvis” and enters a natural, low-latency voice conversation.

## Current Constraints
- Primary platform: macOS
- Priority: perceived conversational latency and natural turn-taking
- Cloud services are acceptable for V1
- Start from a new codebase
- Memory, tools, and hardware integrations are future modules, not V1 prerequisites

## Implemented V1 System Shape
The first vertical slice uses a portable hub-and-satellite shape:

1. **Voice satellite web client** — runs in a supported browser on macOS, Android, or Raspberry Pi Chromium. It owns microphone capture, speaker playback, device state, and timing measurements.
2. **Wake-word boundary** — openWakeWord (its pretrained `hey_jarvis` model, run in-browser via onnxruntime-web) detects “Hey Jarvis” locally in the satellite. The engine is vendored under `src/wake/`; models and the ORT runtime are served same-origin from `public/models` and `public/ort`. Wake audio is not sent to the conversation provider. No client-side wake credential is required. See ADR-008.
3. **Audio session** — browser media APIs capture microphone audio with echo cancellation and play remote audio. The wake recorder and conversation recorder do not run concurrently.
4. **Realtime conversation adapter** — the satellite uses WebRTC to connect to OpenAI Realtime. Server VAD provides turn detection and WebRTC provides automatic interruption/truncation behavior.
5. **Hub service** — a small Node service serves the client and relays SDP session setup. The OpenAI API key remains server-side.
6. **Observability** — structured browser and server events record activation, connection, session-relay, speech-end-to-first-audio, errors, and cleanup without retaining audio.

## Deployment Shape
- On macOS development, the hub and satellite can run on one machine via `localhost`.
- For the Samsung Tab S4, the hub runs on a Mac, small server, or Raspberry Pi and the tablet opens its private HTTPS URL.
- Tailscale Serve is the recommended V1 HTTPS and access boundary. The hub binds to loopback by default.
- A Raspberry Pi can later run both hub and a Chromium kiosk satellite with attached microphone and speaker.
- The browser must remain active for wake detection. Screen-off/background wake is not implemented.

## V1 Data Flow
Local wake phrase → release wake recorder → open WebRTC session → stream user audio → stream model response audio → support interruption → close session → re-arm local wake recorder.

## Target Measurements
Define and measure at least:
- Wake detection latency
- Speech-end to first assistant audio latency
- Interruption response latency
- Session startup time
- Conversation failure rate

## Deferred Modules
Do not build these until the voice loop is credible:
- Long-term semantic memory
- Broad tool ecosystem
- Smart-home or custom hardware control
- Multi-device synchronization
- Complex plugin frameworks
- Autonomous background behavior

## Open Questions
- Acceptable “Jarvis” false-positive and false-negative rates on the tablet and in realistic room audio
- Audio session UX: push-to-stop, silence timeout, or explicit sleep phrase
- Packaging and permissions for a distributable macOS app
- Whether screen-off wake detection justifies a thin native Android foreground-service wrapper
