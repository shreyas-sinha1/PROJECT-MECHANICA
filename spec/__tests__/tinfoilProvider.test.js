import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callTinfoil, DEFAULT_TINFOIL_MODEL, DEFAULT_TINFOIL_BASE_URL } from "../../server/providers/tinfoilProvider.js";

describe("Tinfoil AI Provider (server/providers/tinfoilProvider.js)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns MISSING_API_KEY error when TINFOIL_API_KEY is not set", async () => {
    delete process.env.TINFOIL_API_KEY;
    const result = await callTinfoil("A ball thrown at 20 m/s");

    expect(result.success).toBe(false);
    expect(result.code).toBe("MISSING_API_KEY");
    expect(result.error).toContain("TINFOIL_API_KEY is not configured");
  });

  it("constructs correct request payload and headers for Tinfoil API", async () => {
    process.env.TINFOIL_API_KEY = "tk_test_key_12345";
    let capturedUrl = "";
    let capturedOptions = {};

    const mockFetch = vi.fn().mockImplementation(async (url, opts) => {
      capturedUrl = url;
      capturedOptions = opts;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  isPhysicsQuestion: true,
                  module: "projectileMotion",
                  isSupported: true,
                  parameters: { initialVelocity: 25, launchAngleDegrees: 45, gravity: 9.81, launchHeight: 0 },
                }),
              },
            },
          ],
        }),
      };
    });

    const result = await callTinfoil("Launch at 25 m/s at 45 degrees", { fetch: mockFetch });

    expect(result.success).toBe(true);
    expect(capturedUrl).toBe(`${DEFAULT_TINFOIL_BASE_URL}/chat/completions`);
    expect(capturedOptions.headers["Authorization"]).toBe("Bearer tk_test_key_12345");
    expect(capturedOptions.headers["Content-Type"]).toBe("application/json");

    const sentBody = JSON.parse(capturedOptions.body);
    expect(sentBody.model).toBe(DEFAULT_TINFOIL_MODEL);
    expect(sentBody.messages).toHaveLength(2);
    expect(sentBody.messages[0].role).toBe("system");
    expect(sentBody.messages[1].content).toBe("Launch at 25 m/s at 45 degrees");
    expect(sentBody.response_format.type).toBe("json_schema");
    expect(sentBody.response_format.json_schema.name).toBe("mechanica_physics_spec");
    expect(sentBody.response_format.json_schema.strict).toBe(true);
  });

  it("handles 401 authentication errors with INVALID_API_KEY", async () => {
    process.env.TINFOIL_API_KEY = "tk_invalid_key";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Incorrect API key provided.", code: "invalid_api_key" } }),
    });

    const result = await callTinfoil("Launch ball", { fetch: mockFetch });

    expect(result.success).toBe(false);
    expect(result.code).toBe("INVALID_API_KEY");
    expect(result.error).toContain("401");
    expect(result.error).toContain("Incorrect API key provided.");
  });

  it("handles 429 rate limit errors with RATE_LIMITED", async () => {
    process.env.TINFOIL_API_KEY = "tk_valid_key";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "Rate limit reached. Please wait 1s." } }),
    });

    const result = await callTinfoil("Launch ball", { fetch: mockFetch });

    expect(result.success).toBe(false);
    expect(result.code).toBe("RATE_LIMITED");
    expect(result.error).toContain("429");
    expect(result.error).toContain("Rate limit reached");
  });

  it("handles 500/502/503 server errors with SERVICE_UNAVAILABLE", async () => {
    process.env.TINFOIL_API_KEY = "tk_valid_key";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: "Inference enclave restarting." } }),
    });

    const result = await callTinfoil("Launch ball", { fetch: mockFetch });

    expect(result.success).toBe(false);
    expect(result.code).toBe("SERVICE_UNAVAILABLE");
    expect(result.error).toContain("503");
  });

  it("handles malformed JSON response content with MALFORMED_RESPONSE", async () => {
    process.env.TINFOIL_API_KEY = "tk_valid_key";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: "{ not valid json ...",
            },
          },
        ],
      }),
    });

    const result = await callTinfoil("Launch ball", { fetch: mockFetch });

    expect(result.success).toBe(false);
    expect(result.code).toBe("MALFORMED_RESPONSE");
    expect(result.error).toContain("Failed to parse structured JSON");
  });

  it("handles missing message content with MALFORMED_RESPONSE", async () => {
    process.env.TINFOIL_API_KEY = "tk_valid_key";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [] }),
    });

    const result = await callTinfoil("Launch ball", { fetch: mockFetch });

    expect(result.success).toBe(false);
    expect(result.code).toBe("MALFORMED_RESPONSE");
  });

  it("handles network timeouts gracefully with TIMEOUT", async () => {
    process.env.TINFOIL_API_KEY = "tk_valid_key";
    const timeoutErr = new Error("The operation was aborted due to timeout");
    timeoutErr.name = "TimeoutError";

    const mockFetch = vi.fn().mockRejectedValue(timeoutErr);

    const result = await callTinfoil("Launch ball", { fetch: mockFetch });

    expect(result.success).toBe(false);
    expect(result.code).toBe("TIMEOUT");
    expect(result.error).toContain("timed out");
  });

  it("handles general network errors with NETWORK_ERROR", async () => {
    process.env.TINFOIL_API_KEY = "tk_valid_key";
    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await callTinfoil("Launch ball", { fetch: mockFetch });

    expect(result.success).toBe(false);
    expect(result.code).toBe("NETWORK_ERROR");
    expect(result.error).toContain("ECONNREFUSED");
  });
});

