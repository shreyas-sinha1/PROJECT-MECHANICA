import { SYSTEM_INSTRUCTION, MECHANICA_JSON_SCHEMA } from "../interpretationCore.js";

export const DEFAULT_TINFOIL_MODEL = "deepseek-v4-1-flash";
export const DEFAULT_TINFOIL_BASE_URL = "https://inference.tinfoil.sh/v1";

/**
 * Calls Tinfoil AI's OpenAI-compatible inference endpoint with structured outputs.
 *
 * @param {string} prompt - User physics prompt.
 * @param {Object} [options]
 * @param {string} [options.apiKey] - Optional explicit API key.
 * @param {string} [options.model] - Optional model override (defaults to deepseek-v4-1-flash).
 * @param {string} [options.baseUrl] - Optional API base URL override.
 * @param {number} [options.timeoutMs] - Request timeout in milliseconds (default: 30000).
 * @param {Function} [options.fetch] - Custom fetch function for testing.
 * @returns {Promise<{ success: boolean, data?: Object, code?: string, error?: string, errors?: string[] }>}
 */
export async function callTinfoil(prompt, options = {}) {
  const apiKey = options.apiKey || process.env.TINFOIL_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      code: "MISSING_API_KEY",
      error: "TINFOIL_API_KEY is not configured in environment variables. Please set it in your .env or system environment.",
      errors: ["TINFOIL_API_KEY is not configured."],
    };
  }

  const model = options.model || process.env.TINFOIL_MODEL || DEFAULT_TINFOIL_MODEL;
  const baseUrl = (options.baseUrl || process.env.TINFOIL_BASE_URL || DEFAULT_TINFOIL_BASE_URL).replace(/\/+$/, "");
  const endpoint = `${baseUrl}/chat/completions`;
  const timeoutMs = options.timeoutMs ?? 30000;
  const fetchFn = options.fetch || globalThis.fetch;

  let response;
  let signal;

  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    signal = AbortSignal.timeout(timeoutMs);
  }

  try {
    response = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "mechanica_physics_spec",
            strict: true,
            schema: MECHANICA_JSON_SCHEMA,
          },
        },
        temperature: 0.1,
      }),
      signal,
    });
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return {
        success: false,
        code: "TIMEOUT",
        error: `Tinfoil API request timed out after ${timeoutMs}ms.`,
        errors: [`Tinfoil API request timed out: ${err.message}`],
      };
    }
    return {
      success: false,
      code: "NETWORK_ERROR",
      error: `Failed to connect to Tinfoil API: ${err.message}`,
      errors: [`Network error: ${err.message}`],
    };
  }

  // Handle HTTP status errors
  if (!response.ok) {
    let errorDetail = "";
    try {
      const errBody = await response.json();
      errorDetail = errBody?.error?.message || JSON.stringify(errBody);
    } catch {
      try {
        errorDetail = await response.text();
      } catch {
        errorDetail = `HTTP ${response.status}`;
      }
    }

    if (response.status === 401) {
      return {
        success: false,
        code: "INVALID_API_KEY",
        error: `Tinfoil API authentication failed: Invalid API key (401). ${errorDetail}`,
        errors: [`Tinfoil API authentication failed: ${errorDetail}`],
      };
    }

    if (response.status === 429) {
      return {
        success: false,
        code: "RATE_LIMITED",
        error: `Tinfoil API rate limit exceeded (429). Please wait before retrying. ${errorDetail}`,
        errors: [`Tinfoil API rate limit exceeded: ${errorDetail}`],
      };
    }

    if (response.status >= 500) {
      return {
        success: false,
        code: "SERVICE_UNAVAILABLE",
        error: `Tinfoil inference service unavailable (${response.status}). ${errorDetail}`,
        errors: [`Tinfoil inference server error (${response.status}): ${errorDetail}`],
      };
    }

    return {
      success: false,
      code: "API_ERROR",
      error: `Tinfoil API request failed (${response.status}): ${errorDetail}`,
      errors: [`Tinfoil API error (${response.status}): ${errorDetail}`],
    };
  }

  // Parse response payload
  let data;
  try {
    data = await response.json();
  } catch (err) {
    return {
      success: false,
      code: "MALFORMED_RESPONSE",
      error: `Failed to parse response body from Tinfoil: ${err.message}`,
      errors: [`Malformed response from Tinfoil API: ${err.message}`],
    };
  }

  const messageContent = data?.choices?.[0]?.message?.content;
  if (!messageContent) {
    return {
      success: false,
      code: "MALFORMED_RESPONSE",
      error: "Tinfoil response did not contain message content in choices[0].message.content.",
      errors: ["Empty or missing choices in Tinfoil response payload."],
    };
  }

  let parsedContent;
  try {
    parsedContent = typeof messageContent === "object" ? messageContent : JSON.parse(messageContent);
  } catch (err) {
    return {
      success: false,
      code: "MALFORMED_RESPONSE",
      error: `Failed to parse structured JSON from Tinfoil: ${err.message}`,
      errors: [`Malformed JSON content from model: ${messageContent}`],
    };
  }

  return {
    success: true,
    data: parsedContent,
    raw: data,
  };
}

