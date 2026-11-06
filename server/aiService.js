import { validatePromptInput, processRawInterpretation } from "./interpretationCore.js";
import { callTinfoil } from "./providers/tinfoilProvider.js";
import { callGemini } from "./providers/geminiProvider.js";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: ".env.local" });

/**
 * Flag for automatic failover.
 * PER SPECIFICATION: Built into architecture but NOT ACTIVATED YET.
 * Manual provider selection only (AI_PROVIDER=tinfoil or AI_PROVIDER=gemini).
 */
export const ENABLE_AUTOMATIC_FAILOVER = false;

/**
 * Resolves which AI provider to invoke based on options and environment.
 * Primary: Tinfoil AI (deepseek-v4-1-flash)
 * Secondary: Google Gemini
 *
 * @param {Object} [options]
 * @returns {"tinfoil" | "gemini"}
 */
export function resolveProvider(options = {}) {
  if (options.provider) {
    const norm = String(options.provider).toLowerCase();
    if (norm === "gemini" || norm === "tinfoil") return norm;
  }

  // If a mock or custom GoogleGenAI client is supplied, route to gemini
  if (options.client) {
    return "gemini";
  }

  if (process.env.AI_PROVIDER) {
    const envProvider = process.env.AI_PROVIDER.trim().toLowerCase();
    if (envProvider === "gemini" || envProvider === "tinfoil") {
      return envProvider;
    }
  }

  // Default primary provider is Tinfoil AI
  return "tinfoil";
}

/**
 * Provider-independent physics prompt interpretation.
 *
 * @param {string} prompt - User physics problem or scenario.
 * @param {Object} [options]
 * @param {"tinfoil" | "gemini"} [options.provider] - Manual provider override.
 * @param {string} [options.apiKey] - Provider API key override.
 * @param {string} [options.model] - Model identifier override.
 * @param {Object} [options.client] - Custom client (for Gemini).
 * @param {Function} [options.fetch] - Custom fetch (for Tinfoil).
 * @returns {Promise<Object>} Structured interpretation result adhering to Mechanica contract.
 */
export async function interpretWithAI(prompt, options = {}) {
  const { valid, trimmed, errorResult } = validatePromptInput(prompt);
  if (!valid) {
    return errorResult;
  }

  const activeProvider = resolveProvider(options);

  let providerResult;
  let modelName;
  let providerLabel;

  if (activeProvider === "gemini") {
    modelName = options.model || process.env.GEMINI_MODEL || "gemini-3.8-flash";
    providerLabel = `Gemini AI (${modelName})`;
    providerResult = await callGemini(trimmed, options);
  } else {
    modelName = options.model || process.env.TINFOIL_MODEL || "deepseek-v4-1-flash";
    providerLabel = `Tinfoil AI (${modelName})`;
    providerResult = await callTinfoil(trimmed, options);
  }

  // Failover hook (extensible for future activation once both pass equivalence tests)
  if (!providerResult.success && ENABLE_AUTOMATIC_FAILOVER && !options.provider) {
    const backupProvider = activeProvider === "tinfoil" ? "gemini" : "tinfoil";
    console.warn(`[Mechanica AI] ${activeProvider} failed (${providerResult.code}). Attempting failover to ${backupProvider}...`);
    if (backupProvider === "gemini") {
      providerResult = await callGemini(trimmed, options);
    } else {
      providerResult = await callTinfoil(trimmed, options);
    }
  }

  // If the provider returned an error, report it directly (no silent fallback per specification)
  if (!providerResult.success) {
    return {
      success: false,
      canLaunch: false,
      spec: null,
      interpretation: null,
      code: providerResult.code || "API_ERROR",
      error: providerResult.error || "AI provider failed to generate interpretation.",
      errors: providerResult.errors || [providerResult.error || "AI provider failed."],
      warnings: [],
      provider: activeProvider,
      model: modelName,
      providerLabel,
    };
  }

  // Process raw structured data through Mechanica's domain validation & spec builder
  const processed = processRawInterpretation(providerResult.data, trimmed);
  if (processed.spec && processed.spec.metadata) {
    processed.spec.metadata.aiProvider = activeProvider;
    processed.spec.metadata.aiModel = modelName;
  }

  return {
    ...processed,
    provider: activeProvider,
    model: modelName,
    providerLabel,
  };
}

