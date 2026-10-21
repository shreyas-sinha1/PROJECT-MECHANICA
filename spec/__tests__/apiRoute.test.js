import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "events";
import handler from "../../api/interpret.js";
import * as geminiService from "../../server/geminiService.js";

function createMockReqRes({ method = "POST", body = undefined, streamBody = null } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.body = body;
  req.destroy = vi.fn();

  const res = {
    statusCode: null,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(data) {
      this.body = data || "";
    },
  };

  const emitStream = () => {
    if (streamBody !== null) {
      req.emit("data", streamBody);
    }
    req.emit("end");
  };

  return { req, res, emitStream };
}

describe("api/interpret.js Serverless Function Handler", () => {
  it("handles OPTIONS preflight request with 204 and CORS headers", async () => {
    const { req, res } = createMockReqRes({ method: "OPTIONS" });
    await handler(req, res);

    expect(res.statusCode).toBe(204);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(res.headers["Access-Control-Allow-Methods"]).toContain("POST");
  });

  it("rejects GET requests with 405 and valid JSON error", async () => {
    const { req, res } = createMockReqRes({ method: "GET" });
    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers["Content-Type"]).toBe("application/json");
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error).toContain("Method not allowed");
  });

  it("handles Vercel parsed body (req.body as object)", async () => {
    vi.spyOn(geminiService, "interpretPhysicsQuestion").mockResolvedValueOnce({
      success: true,
      canLaunch: true,
      spec: {
        version: "1.0",
        module: "projectileMotion",
        parameters: { initialVelocity: 25, launchAngleDegrees: 30, gravity: 9.81 },
      },
      interpretation: { unitConversions: [] },
      errors: [],
      warnings: [],
    });

    const { req, res } = createMockReqRes({
      method: "POST",
      body: { prompt: "Throw a stone at 25 m/s at 30 degrees" },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.canLaunch).toBe(true);
    expect(json.spec.parameters.initialVelocity).toBe(25);
  });

  it("handles streaming body (Node / Vite Connect stream)", async () => {
    vi.spyOn(geminiService, "interpretPhysicsQuestion").mockResolvedValueOnce({
      success: true,
      canLaunch: true,
      spec: {
        version: "1.0",
        module: "projectileMotion",
        parameters: { initialVelocity: 40, launchAngleDegrees: 45, gravity: 9.81 },
      },
      interpretation: { unitConversions: [] },
      errors: [],
      warnings: [],
    });

    const payloadStr = JSON.stringify({ prompt: "Fire a cannon at 40 m/s" });
    const { req, res, emitStream } = createMockReqRes({
      method: "POST",
      streamBody: payloadStr,
    });

    const handlerPromise = handler(req, res);
    emitStream();
    await handlerPromise;

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.spec.parameters.launchAngleDegrees).toBe(45);
  });

  it("returns 503 when GEMINI_API_KEY is missing", async () => {
    vi.spyOn(geminiService, "interpretPhysicsQuestion").mockResolvedValueOnce({
      success: false,
      canLaunch: false,
      code: "MISSING_API_KEY",
      error: "GEMINI_API_KEY is not configured.",
      errors: ["GEMINI_API_KEY is not configured."],
    });

    const { req, res } = createMockReqRes({
      method: "POST",
      body: { prompt: "Launch ball at 20 m/s" },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(503);
    const json = JSON.parse(res.body);
    expect(json.code).toBe("MISSING_API_KEY");
  });

  it("returns 400 when question has missing parameters or unsupported physics", async () => {
    vi.spyOn(geminiService, "interpretPhysicsQuestion").mockResolvedValueOnce({
      success: false,
      canLaunch: false,
      code: "MISSING_PARAMETERS",
      error: "Missing required parameters.",
      interpretation: {
        missingRequiredParameters: ["initialVelocity"],
      },
      errors: ["Initial velocity missing."],
    });

    const { req, res } = createMockReqRes({
      method: "POST",
      body: { prompt: "A ball thrown at 45 degrees" },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.canLaunch).toBe(false);
    expect(json.interpretation.missingRequiredParameters).toContain("initialVelocity");
  });

  it("returns 413 when payload exceeds 1MB", async () => {
    const hugeChunk = "x".repeat(1000001);
    const { req, res, emitStream } = createMockReqRes({
      method: "POST",
      streamBody: hugeChunk,
    });

    const handlerPromise = handler(req, res);
    emitStream();
    await handlerPromise;

    expect(res.statusCode).toBe(413);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("Payload too large");
  });

  it("returns 500 when server throws unexpected error", async () => {
    vi.spyOn(geminiService, "interpretPhysicsQuestion").mockRejectedValueOnce(
      new Error("Unexpected internal crash")
    );

    const { req, res } = createMockReqRes({
      method: "POST",
      body: { prompt: "Test crash" },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    const json = JSON.parse(res.body);
    expect(json.error).toContain("Unexpected internal crash");
  });
});
