import "dotenv/config";

import express from "express";
import { createServer as createViteServer } from "vite";

import { buildSessionConfig, publicConfig } from "./server-config.mjs";

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

app.use((_request, response, next) => {
  response.set("Permissions-Policy", "microphone=(self)");
  response.set("X-Content-Type-Options", "nosniff");
  response.set("Referrer-Policy", "no-referrer");
  // onnxruntime-web nutzt threaded WASM und damit SharedArrayBuffer. Das verlangt
  // einen cross-origin-isolierten Kontext. Alle Subressourcen sind same-origin,
  // require-corp ist daher unkritisch. Ohne diese Header initialisiert ORT nicht.
  response.set("Cross-Origin-Opener-Policy", "same-origin");
  response.set("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

// Wake-Word-Assets (ONNX-Modelle, onnxruntime-web Runtime) statisch und VOR der
// Vite-Middleware ausliefern. Sonst schleust Vite im Dev-Modus die dynamisch
// importierten ORT-.mjs-Dateien durch seine Modul-Pipeline (?import) und liefert
// 404 -> "no available backend". Der Query-String wird von express.static
// ignoriert, die Datei also roh serviert.
app.use("/models", express.static("public/models"));
app.use("/ort", express.static("public/ort"));

app.get("/api/config", (_request, response) => {
  response.set("Cache-Control", "no-store");
  response.json(publicConfig(process.env));
});

app.post(
  "/api/realtime/session",
  express.text({ type: ["application/sdp", "text/plain"], limit: "1mb" }),
  async (request, response) => {
    if (!process.env.OPENAI_API_KEY) {
      response.status(503).json({ error: "OPENAI_API_KEY is not configured" });
      return;
    }
    if (typeof request.body !== "string" || !request.body.trim()) {
      response.status(400).json({ error: "An SDP offer is required" });
      return;
    }

    const form = new FormData();
    form.set("sdp", request.body);
    form.set("session", JSON.stringify(buildSessionConfig(process.env)));

    const startedAt = performance.now();
    try {
      const upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "OpenAI-Safety-Identifier": "jarvis-personal-device",
        },
        body: form,
        signal: AbortSignal.timeout(15_000),
      });
      const body = await upstream.text();
      console.log(
        JSON.stringify({
          event: "realtime.session_relay",
          status: upstream.status,
          durationMs: Math.round(performance.now() - startedAt),
        }),
      );
      response.status(upstream.status).type(upstream.ok ? "application/sdp" : "text/plain").send(body);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "realtime.session_relay_failed",
          durationMs: Math.round(performance.now() - startedAt),
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      response.status(502).json({ error: "Realtime service is unavailable" });
    }
  },
);

if (process.env.NODE_ENV === "production") {
  app.use(express.static("dist"));
  app.get("/{*path}", (_request, response) => response.sendFile("index.html", { root: "dist" }));
} else {
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

app.listen(port, host, () => {
  console.log(`Jarvis voice satellite: http://localhost:${port}`);
});
