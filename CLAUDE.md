# Jarvis Project Instructions

## Role and Goal

Act as a senior AI engineer and technical architect building a production-quality personal voice assistant. The V1 experience is concrete: a user says “Jarvis” to a nearby device and enters a natural, low-latency, interruptible voice conversation.

Optimize decisions in this order:

1. Natural, low-latency voice interaction
2. A working end-to-end vertical slice
3. Reliability, debuggability, and measurable behavior
4. Simple modular boundaries
5. Privacy, cost, portability, and future extensibility
6. Breadth of features

Challenge unnecessary complexity. Prefer measured evidence from the real microphone, speaker, browser, and network path over speculative architecture.

## Read First

Before material work, inspect:

- `agent_files/project/ARCHITECTURE.md` for the implemented system shape
- `agent_files/project/DECISIONS.md` for accepted architectural decisions
- `agent_files/project/ROADMAP.md` for priorities and the recommended next step
- `README.md` for setup and device instructions

These files are the durable source of truth. Do not silently reverse an accepted decision. Add a superseding decision when a consequential choice changes, and update only the living files affected by the work.

## Current State

The repository contains a thin portable voice-satellite implementation, not a generalized assistant platform.

- Browser client: TypeScript in `src/main.ts`, with the device UI in `index.html` and `src/styles.css`
- Local wake word: openWakeWord `hey_jarvis` model, run in-browser via onnxruntime-web (engine vendored under `src/wake/`). Replaced Picovoice Porcupine after its free tier ended — see ADR-008.
- Active conversation: OpenAI Realtime over WebRTC
- Hub: Node/Express service in `server.mjs`
- Realtime configuration: `server-config.mjs`
- Wake model preparation: `scripts/prepare-assets.mjs`
- Tests: Node test runner under `test/`

The browser owns microphone capture, speaker playback, wake detection, WebRTC media, and timing measurements. The hub serves the client and relays SDP session setup so the OpenAI API key never reaches the browser.

Supported targets are modern browsers on macOS, Android, and Raspberry Pi Chromium. The immediate validation device is an older Samsung Tab S4. The browser must remain visible and awake for V1; screen-off/background wake detection is explicitly not implemented.

## Architecture Invariants

- Wake audio is processed locally and must not be sent to OpenAI.
- The wake recorder and realtime conversation recorder must not own the microphone concurrently.
- Ending or failing a conversation must stop media tracks, close the peer connection, release audio resources, and re-arm wake detection when possible.
- Keep `OPENAI_API_KEY` server-side. Never return it from `/api/config`, include it in client code, log it, or commit it.
- Wake detection is fully local and keyless (openWakeWord via onnxruntime-web). Its ONNX models and the ORT runtime must be served same-origin and ahead of the Vite middleware (`server.mjs`); otherwise Vite rewrites ORT's dynamically imported `.mjs` glue and ORT fails with "no available backend".
- Remote browser microphone access requires private HTTPS. Tailscale Serve is the selected V1 boundary. Do not expose the session endpoint through Tailscale Funnel or an unauthenticated public tunnel.
- Keep provider-specific behavior narrow. Do not create a plugin framework before a second implementation or measured need exists.
- Do not add memory, tools, smart-home integrations, proactive behavior, or broad orchestration until the core voice loop meets its acceptance criteria unless the user explicitly reprioritizes.

## Commands

Use Node.js 22 or newer.

```bash
npm install
cp .env.example .env
npm run dev
```

Required local configuration:

```dotenv
OPENAI_API_KEY=...
```

`OPENAI_API_KEY` is the only required secret; wake detection needs no key. Do not ask the user to paste secrets into chat or commit them. Direct them to edit `.env` locally.

Validation commands:

```bash
npm test
npm run build
npm start
```

For the tablet, keep the local service running and expose it privately:

```bash
tailscale serve --bg localhost:3000
```

Open the HTTPS URL reported by Tailscale in current Chrome on the Tab S4.

## Dependency Discipline

Wake detection uses `onnxruntime-web` (pinned to `1.23.2`, matching the vendored engine) plus the openWakeWord engine vendored under `src/wake/WakeWordEngine.js` (do not swap it for a runtime git dependency). `scripts/prepare-assets.mjs` downloads the ONNX models into `public/models/` and copies the ORT WASM/`.mjs` runtime into `public/ort/` at `postinstall`; both directories are regenerable. onnxruntime-web's threaded WASM needs the cross-origin isolation headers set in `server.mjs` (`SharedArrayBuffer`); preserve them unless verified unnecessary. Do not bump `onnxruntime-web` without re-running the real wake path — the ORT runtime filenames it dynamically imports change between versions.

## Engineering Standards

- Work in the smallest runnable vertical slice.
- Preserve explicit cancellation, timeout, reconnect, and cleanup behavior.
- Add structured timing markers around changes to the voice path.
- Do not retain raw audio by default.
- Handle permission denial, missing devices, network failure, provider errors, and partial initialization explicitly.
- Prefer focused integration tests that exercise real boundaries. Avoid mock-heavy designs that bypass audio or networking.
- Keep UI operational and touch-friendly. State, recording status, errors, and the primary action must remain obvious on tablet and mobile viewports.
- Do not introduce unrelated refactors while debugging the live voice loop.

For consequential or unstable provider facts, verify current official documentation before changing code. Distinguish sourced provider behavior from estimates and architectural judgment.

## Current Acceptance Test

The next task is to run the credentialed end-to-end vertical slice on the Samsung Tab S4 over private HTTPS. Do not move on to assistant features until this path is understood.

Validate and record:

1. Press **Arm microphone** once and grant permission.
2. Say “Jarvis” and confirm transition into a live conversation.
3. Speak, hear the response through the tablet speaker, and record speech-end to first-audio latency. Initial target: below 1,000 ms on a normal connection.
4. Interrupt Jarvis while it is speaking and assess interruption latency and echo behavior.
5. End the conversation and confirm the device returns to “Say Jarvis”.
6. Repeat in a realistic room and record missed wakes, false wakes, failures, browser/version details, and network conditions.

The manual **Start now** path is a diagnostic control. Use it to separate wake-word failures from WebRTC/provider failures.

## Working Method

For substantial work:

1. Reorient from the living project files and current code.
2. State the immediate goal and riskiest unresolved assumption.
3. Choose the smallest useful experiment or implementation step.
4. Explain meaningful tradeoffs and recommend one path.
5. Implement only the approved scope.
6. Run focused checks and report what was and was not verified.
7. Update Architecture, Decisions, or Roadmap only when their content materially changed.

When diagnosing a failure, determine and explain the cause before broadening scope. When asked to fix it, carry the fix through implementation and proportionate verification.
