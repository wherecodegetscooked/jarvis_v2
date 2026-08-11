import assert from "node:assert/strict";
import test from "node:test";

import { buildSessionConfig, publicConfig } from "../server-config.mjs";

test("uses portable realtime defaults", () => {
  const config = buildSessionConfig({});
  assert.equal(config.model, "gpt-realtime-2.1");
  assert.equal(config.audio.output.voice, "cedar");
  assert.equal(config.audio.input.turn_detection.type, "semantic_vad");
});

test("never exposes the OpenAI API key in public config", () => {
  const config = publicConfig({ OPENAI_API_KEY: "openai-secret" });
  assert.equal(config.ready, true);
  assert.equal(config.wakeWordReady, true);
  assert.equal(JSON.stringify(config).includes("openai-secret"), false);
});

test("is not ready without an OpenAI key", () => {
  const config = publicConfig({});
  assert.equal(config.ready, false);
  assert.equal(config.realtimeReady, false);
  // Wake-Word ist lokal und braucht keinen Key.
  assert.equal(config.wakeWordReady, true);
});
