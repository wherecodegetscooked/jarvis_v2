import { access, copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Bereitet die lokal ausgelieferten Wake-Word-Assets vor:
//  1. Die openWakeWord-ONNX-Modelle unter public/models/ (Mel, Embedding, VAD,
//     hey_jarvis). Fehlende werden aus der gepinnten Quelle nachgeladen.
//  2. Die onnxruntime-web WASM-Binaries unter public/ort/. Der Client ist
//     cross-origin-isoliert (COEP require-corp), daher muessen die WASM-Dateien
//     same-origin liegen; ein CDN wuerde blockiert.
const modelsDir = path.resolve("public/models");
const ortDir = path.resolve("public/ort");
const modelBaseUrl =
  process.env.OWW_MODELS_URL ||
  "https://raw.githubusercontent.com/dnavarrom/openwakeword_wasm/main/models";
const requiredModels = [
  "melspectrogram.onnx",
  "embedding_model.onnx",
  "silero_vad.onnx",
  "hey_jarvis_v0.1.onnx",
];

// ONNX-Dateien beginnen als protobuf mit Feld 1 (ir_version), also Byte 0x08.
// Daran erkennen wir echte Modelle und verwerfen HTML-Fehlerseiten.
function looksLikeOnnx(buffer) {
  return buffer.byteLength > 10_000 && buffer[0] === 0x08;
}

async function ensureModels() {
  await mkdir(modelsDir, { recursive: true });
  for (const name of requiredModels) {
    const destination = path.join(modelsDir, name);
    try {
      await access(destination);
      continue;
    } catch {
      // fehlt -> laden
    }
    const url = `${modelBaseUrl}/${name}`;
    console.log(`Lade Modell: ${url}`);
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) {
      throw new Error(`Modell-Download fehlgeschlagen (${name}, HTTP ${response.status})`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!looksLikeOnnx(buffer)) {
      throw new Error(`Heruntergeladene Datei ist kein gueltiges ONNX-Modell: ${name}`);
    }
    await writeFile(destination, buffer);
    console.log(`  Modell bereit: ${destination} (${buffer.byteLength} Bytes)`);
  }
}

async function ensureOrtRuntime() {
  const source = path.resolve("node_modules/onnxruntime-web/dist");
  try {
    await access(source);
  } catch {
    console.warn("onnxruntime-web ist nicht installiert, ueberspringe WASM-Kopie.");
    return;
  }
  await mkdir(ortDir, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  let copied = 0;
  for (const entry of entries) {
    // Zur Laufzeit laedt onnxruntime-web ueber wasmPaths die WASM-Binaries UND
    // die zugehoerige .mjs-Loader-Glue (z. B. ort-wasm-simd-threaded.jsep.mjs)
    // dynamisch nach. Fehlt die .mjs, scheitert ORT mit "no available backend".
    // Die Library-Entrypoints (ort.*.mjs) buendelt Vite selbst, die kopieren wir
    // bewusst nicht.
    const isRuntimeAsset =
      entry.name.startsWith("ort-wasm-") &&
      (entry.name.endsWith(".wasm") || entry.name.endsWith(".mjs"));
    if (entry.isFile() && isRuntimeAsset) {
      await copyFile(path.join(source, entry.name), path.join(ortDir, entry.name));
      copied += 1;
    }
  }
  console.log(`onnxruntime-web Runtime bereit: ${copied} Datei(en) in ${ortDir}`);
}

await ensureModels();
await ensureOrtRuntime();
