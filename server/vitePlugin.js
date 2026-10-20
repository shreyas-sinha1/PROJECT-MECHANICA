import { interpretPhysicsQuestion } from "./geminiService.js";

/**
 * Vite plugin that provides the server-side /api/interpret endpoint.
 * Keeps the Gemini API key strictly server-side.
 */
export function mechanicaGeminiApiPlugin() {
  function handleApiRequest(req, res) {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: false, error: "Method not allowed. Use POST." }));
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      // Guard against oversized payload (max 1MB)
      if (body.length > 1e6) {
        res.statusCode = 413;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ success: false, error: "Payload too large." }));
        req.destroy();
      }
    });

    req.on("end", async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const prompt = payload.prompt;

        const result = await interpretPhysicsQuestion(prompt);
        res.statusCode = result.success ? 200 : (result.code === "MISSING_API_KEY" ? 503 : 400);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: false,
            canLaunch: false,
            error: `Server error: ${err.message}`,
            errors: [err.message],
          })
        );
      }
    });
  }

  return {
    name: "mechanica-gemini-api",
    configureServer(server) {
      server.middlewares.use("/api/interpret", handleApiRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/interpret", handleApiRequest);
    },
  };
}
