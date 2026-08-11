export function buildSessionConfig(env) {
  return {
    type: "realtime",
    model: env.JARVIS_MODEL || "gpt-realtime-2.1",
    output_modalities: ["audio"],
    instructions:
      "You are Jarvis, a concise and capable personal voice assistant. " +
      "Respond naturally for speech. Keep routine answers brief unless detail is requested.",
    audio: {
      input: {
        turn_detection: { type: "semantic_vad" },
      },
      output: {
        voice: env.JARVIS_VOICE || "marin",
      },
    },
  };
}

export function publicConfig(env) {
  // Wake-Word laeuft lokal (openWakeWord/onnxruntime-web), Assets liegen
  // same-origin unter /models und /ort. Es gibt keinen client-seitigen Key mehr
  // und keine Provider-Voraussetzung ausser den lokalen Assets, daher immer true.
  return {
    ready: Boolean(env.OPENAI_API_KEY),
    realtimeReady: Boolean(env.OPENAI_API_KEY),
    wakeWordReady: true,
  };
}
