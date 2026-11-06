import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION, GEMINI_RESPONSE_SCHEMA } from "../interpretationCore.js";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

/**
 * Returns a Gemini API client instance.
 * Reads API key from options or process.env.GEMINI_API_KEY.
 *
 * @param {string} [customApiKey]
 * @returns {GoogleGenAI}
 */
export function getGeminiClient(customApiKey) {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured in environment variables. Please set it in your .env or system environment."
    );
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Calls Google Gemini API with structured outputs.
 *
 * @param {string} prompt - User physics prompt.
 * @param {Object} [options]
 * @param {string} [options.apiKey] - Optional custom API key.
 * @param {GoogleGenAI} [options.client] - Optional mock/custom Gemini client.
 * @param {string} [options.model] - Optional Gemini model override.
 * @returns {Promise<{ success: boolean, data?: Object, code?: string, error?: string, errors?: string[] }>}
 */
export async function callGemini(prompt, options = {}) {
  let client;
  try {
    client = options.client || getGeminiClient(options.apiKey);
  } catch (err) {
    return {
      success: false,
      code: "MISSING_API_KEY",
      error: err.message,
      errors: [err.message],
    };
  }

  const modelName = options.model || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

  let rawContent;
  try {
    const response = await client.models.generateContent({
      model: modelName,
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA,
        temperature: 0.1,
      },
    });

    rawContent = response.text;
  } catch (err) {
    return {
      success: false,
      code: "API_ERROR",
      error: `Gemini API request failed: ${err.message}`,
      errors: [`Gemini API request failed: ${err.message}`],
    };
  }

  let parsed;
  try {
    parsed = typeof rawContent === "object" ? rawContent : JSON.parse(rawContent);
  } catch (err) {
    return {
      success: false,
      code: "MALFORMED_RESPONSE",
      error: `Failed to parse structured response from Gemini: ${err.message}`,
      errors: [`Malformed JSON from AI model: ${rawContent}`],
    };
  }

  return {
    success: true,
    data: parsed,
  };
}

