import { SYSTEM_INSTRUCTION, GEMINI_RESPONSE_SCHEMA } from "./interpretationCore.js";
import { getGeminiClient, callGemini } from "./providers/geminiProvider.js";
import { interpretWithAI } from "./aiService.js";

export { SYSTEM_INSTRUCTION, GEMINI_RESPONSE_SCHEMA, getGeminiClient, callGemini };

/**
 * Backward-compatible wrapper for Gemini interpretation service.
 * Direct calls to geminiService default to "gemini" provider unless options.provider is specified.
 *
 * @param {string} prompt - Physics problem or scenario description.
 * @param {Object} [options] - Options (apiKey, client, model, provider).
 * @returns {Promise<Object>} Mechanica interpretation response.
 */
export async function interpretPhysicsQuestion(prompt, options = {}) {
  const provider = options.provider || "gemini";
  return interpretWithAI(prompt, { ...options, provider });
}
