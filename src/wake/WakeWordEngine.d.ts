// Typdeklarationen fuer die vendorte WakeWordEngine (plain JS), damit der
// strikte TypeScript-Build den Import ohne implizites any akzeptiert. Nur die
// tatsaechlich genutzte Oberflaeche ist deklariert.

export interface WakeWordDetection {
  keyword: string;
  score: number;
  at: number;
}

export interface WakeWordEngineOptions {
  keywords?: string[];
  modelFiles?: Record<string, string>;
  baseAssetUrl?: string;
  ortWasmPath?: string;
  frameSize?: number;
  sampleRate?: number;
  vadHangoverFrames?: number;
  detectionThreshold?: number;
  cooldownMs?: number;
  executionProviders?: string[];
  embeddingWindowSize?: number;
  debug?: boolean;
}

export type WakeWordEvent = "ready" | "detect" | "speech-start" | "speech-end" | "error";

export class WakeWordEngine {
  constructor(options?: WakeWordEngineOptions);
  on(event: "detect", handler: (detection: WakeWordDetection) => void): () => void;
  on(event: "error", handler: (error: unknown) => void): () => void;
  on(event: WakeWordEvent, handler: (payload?: unknown) => void): () => void;
  off(event: WakeWordEvent, handler: (payload?: unknown) => void): void;
  load(): Promise<void>;
  start(options?: { deviceId?: string; gain?: number }): Promise<void>;
  stop(): Promise<void>;
  setActiveKeywords(keywords: string[]): void;
  setGain(value: number): void;
}

export const MODEL_FILE_MAP: Record<string, string>;
export default WakeWordEngine;
