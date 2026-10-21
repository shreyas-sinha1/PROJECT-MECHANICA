import handler from "../api/interpret.js";

/**
 * Vite plugin that provides the server-side /api/interpret endpoint.
 * Keeps the Gemini API key strictly server-side in local dev and preview.
 */
export function mechanicaGeminiApiPlugin() {
  return {
    name: "mechanica-gemini-api",
    configureServer(server) {
      server.middlewares.use("/api/interpret", handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/interpret", handler);
    },
  };
}

