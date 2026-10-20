import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "events";
import { mechanicaGeminiApiPlugin } from "../../server/vitePlugin.js";
import * as geminiService from "../../server/geminiService.js";

function createMockReqRes(method, bodyString) {
  const req = new EventEmitter();
  req.method = method;
  req.destroy = vi.fn();

  const res = {
    statusCode: null,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(data) {
      this.body = data;
    },
  };

  const emitData = () => {
    if (bodyString) {
      req.emit("data", bodyString);
    }
    req.emit("end");
  };

  return { req, res, emitData };
}

describe("mechanicaGeminiApiPlugin Middleware", () => {
  const plugin = mechanicaGeminiApiPlugin();

  it("registers configureServer and configurePreviewServer hooks", () => {
    expect(plugin.name).toBe("mechanica-gemini-api");
    expect(typeof plugin.configureServer).toBe("function");
    expect(typeof plugin.configurePreviewServer).toBe("function");
  });

  it("rejects non-POST requests with 405 Method Not Allowed", () => {
    let capturedHandler;
    const serverMock = {
      middlewares: {
        use: (path, handler) => {
          if (path === "/api/interpret") capturedHandler = handler;
        },
      },
    };

    plugin.configureServer(serverMock);
    expect(capturedHandler).toBeDefined();

    const { req, res, emitData } = createMockReqRes("GET", "");
    capturedHandler(req, res);
    emitData();

    expect(res.statusCode).toBe(405);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Method not allowed");
  });

  it("routes POST requests to interpretPhysicsQuestion and returns JSON response", async () => {
    let capturedHandler;
    const serverMock = {
      middlewares: {
        use: (path, handler) => {
          if (path === "/api/interpret") capturedHandler = handler;
        },
      },
    };

    plugin.configureServer(serverMock);

    vi.spyOn(geminiService, "interpretPhysicsQuestion").mockResolvedValue({
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

    const { req, res, emitData } = createMockReqRes("POST", JSON.stringify({ prompt: "Cannonball at 40 m/s" }));
    capturedHandler(req, res);
    emitData();

    await new Promise((r) => setTimeout(r, 10));

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    const parsed = JSON.parse(res.body);
    expect(parsed.canLaunch).toBe(true);
    expect(parsed.spec.parameters.initialVelocity).toBe(40);
  });

  it("returns 503 when API key is missing", async () => {
    let capturedHandler;
    const serverMock = {
      middlewares: {
        use: (path, handler) => {
          if (path === "/api/interpret") capturedHandler = handler;
        },
      },
    };

    plugin.configureServer(serverMock);

    vi.spyOn(geminiService, "interpretPhysicsQuestion").mockResolvedValue({
      success: false,
      canLaunch: false,
      code: "MISSING_API_KEY",
      error: "API key is not configured.",
      errors: ["API key is not configured."],
    });

    const { req, res, emitData } = createMockReqRes("POST", JSON.stringify({ prompt: "Cannonball at 40 m/s" }));
    capturedHandler(req, res);
    emitData();

    await new Promise((r) => setTimeout(r, 10));

    expect(res.statusCode).toBe(503);
    const parsed = JSON.parse(res.body);
    expect(parsed.code).toBe("MISSING_API_KEY");
  });
});
