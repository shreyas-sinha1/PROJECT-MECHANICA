import { interpretPhysicsQuestion } from "../server/geminiService.js";

/**
 * Extracts and parses the request body across environments:
 * - Vercel Serverless (where req.body may already be a parsed object or string)
 * - Node / Connect HTTP stream (where chunks must be accumulated)
 *
 * @param {import("http").IncomingMessage} req
 * @returns {Promise<Object>}
 */
export async function parseRequestBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    if (typeof req.body === "object") {
      return req.body;
    }
  }

  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      // Guard against oversized payload (max 1MB)
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error("PAYLOAD_TOO_LARGE"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", (err) => reject(err));
  });
}

/**
 * Vercel Serverless Function & Vite dev middleware handler for /api/interpret.
 * Securely reads GEMINI_API_KEY from server environment variables.
 *
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 */
export default async function handler(req, res) {
  // CORS & Preflight headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, error: "Method not allowed. Use POST." }));
    return;
  }

  let payload;
  try {
    payload = await parseRequestBody(req);
  } catch (err) {
    if (err.message === "PAYLOAD_TOO_LARGE") {
      res.statusCode = 413;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: false, error: "Payload too large." }));
      return;
    }
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, error: "Invalid JSON payload." }));
    return;
  }

  try {
    const prompt = payload?.prompt;
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
}
