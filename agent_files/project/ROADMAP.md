# Roadmap

## North Star
A simple, magical moment: say “Hey Jarvis” on a Mac and immediately have a fluid, interruptible voice conversation.

## Phase 0 — Validate the riskiest assumptions
- [x] Define an initial speech-end to first-audio target below 1,000 ms.
- [x] Select Porcupine for the wake-word spike and OpenAI Realtime WebRTC for conversation.
- [x] Select a portable browser satellite and private Node hub deployment shape.
- [ ] Validate microphone, speaker, echo, wake reliability, and interruption on the Samsung Tab S4.

## Phase 1 — Thin voice vertical slice
- [x] Start a new codebase with a minimal runnable web satellite and Node hub.
- [x] Implement browser capture/playback with explicit cleanup.
- [x] Implement the OpenAI Realtime WebRTC session path.
- [x] Instrument speech-end to first remote-audio energy.
- [x] Implement cancellation, re-arming, timeouts, and basic errors.
- [ ] Run the credentialed end-to-end path and record measurements.

## Phase 2 — “Hey Jarvis” loop
- [x] Add local “Hey Jarvis” wake-word detection (openWakeWord in-browser; replaced Picovoice after its free tier ended — see ADR-008).
- [x] Transition from idle to conversation without manual UI steps.
- [x] Use WebRTC/server VAD interruption and automatic truncation.
- Define sleep, timeout, and reactivation behavior.
- Test false activations and missed wakes in realistic rooms.

## Phase 3 — Productize the V1 experience
- Package a repeatable macOS build.
- Add structured logs and lightweight diagnostics.
- Add privacy controls and clear recording indicators.
- Run latency and reliability tests across representative networks and microphones.

## Later — Only after V1 is credible
- Modular long-term memory
- Tool execution with explicit safety boundaries
- Smart-home and hardware adapters
- Additional devices and operating systems
- Proactive or scheduled behaviors

## Next Recommended Step
Run the credentialed vertical slice on the Samsung Tab S4 over private HTTPS. Record connection time, speech-end to first-audio latency, interruption response, missed wakes, and false wakes before adding any assistant features.
