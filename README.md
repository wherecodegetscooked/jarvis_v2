# Jarvis Voice Satellite

A portable first slice of Jarvis: arm a device once, say “Jarvis”, and enter an interruptible speech-to-speech conversation. The same browser client is intended for macOS, Android tablets, and Raspberry Pi Chromium.

## Architecture

- The browser owns microphone capture, speaker playback, local wake-word detection, and WebRTC media.
- The Node service serves the client and relays session setup so the OpenAI key never reaches the browser.
- Porcupine processes “Jarvis” locally. Conversation audio is sent to OpenAI only after activation.
- Tailscale Serve provides private HTTPS when the client and server are different devices.

## Run on the server

Requirements: Node.js 22 or newer and accounts for the OpenAI API and Picovoice Console.

```bash
npm install
cp .env.example .env
```

Add `OPENAI_API_KEY` and `PICOVOICE_ACCESS_KEY` to `.env`, then run:

```bash
npm run dev
```

On the same computer, open `http://localhost:3000`. Select **Arm microphone**, grant access, and say “Jarvis”. **Start now** bypasses wake detection when debugging.

## Use the Samsung tablet

Browser microphone access requires HTTPS when the page is hosted on another machine. A private Tailscale connection is the recommended V1 path:

1. Install Tailscale on the server and tablet and sign into the same private network.
2. Keep Jarvis running on port 3000.
3. On the server, run `tailscale serve --bg localhost:3000`.
4. Open the HTTPS URL printed by Tailscale in current Chrome on the tablet.
5. Grant microphone access, keep the tablet plugged in, and leave the Jarvis page visible.

Do not use Tailscale Funnel or an unauthenticated public tunnel. The session endpoint can create billable realtime sessions.

Android can suspend browsers when the screen is off. For this slice, use Android’s screen-timeout setting or a kiosk browser to keep the page awake. A foreground Android wrapper is the later path if screen-off wake detection becomes a requirement.

## Validate

```bash
npm test
npm run build
npm start
```

Acceptance checks:

- The device returns to “Say Jarvis” after ending a conversation.
- Speaking while Jarvis responds interrupts playback promptly.
- The “First audio” measurement is below 1,000 ms on a normal connection.
- The OpenAI key never appears in `/api/config`, browser storage, or the built client.
