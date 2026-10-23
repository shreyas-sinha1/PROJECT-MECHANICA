import { GoogleGenAI, Type } from "@google/genai";
import { SIMULATION_SPEC_VERSION } from "../spec/simulationSpec.js";
import { validateSimulationSpec } from "../spec/validate.js";
import dotenv from "dotenv";

// Load environment variables if not already loaded
dotenv.config();
dotenv.config({ path: ".env.local" });

export const SYSTEM_INSTRUCTION = `You are Mechanica's AI Intelligence Layer (Phase 1).
Mechanica is a physics visualization and simulation platform.
Your objective is to interpret natural-language physics questions or scenario descriptions and extract structured parameters for the 2D Projectile Motion simulation engine.

CURRENT ENGINE CAPABILITIES & CONSTRAINTS:
- Currently, Mechanica ONLY supports ideal 2D projectile motion under constant uniform gravity (flat horizontal ground, no air resistance, no drag, no spin, no crosswinds).
- Required parameters for simulation:
  1. initialVelocity: Launch speed in meters per second (m/s). Schema range: (0.01, 1000].
  2. launchAngleDegrees: Angle above the horizontal in degrees. Schema range: [0, 90].
  3. gravity: Gravitational acceleration in m/s². Schema range: (0.01, 100].
- Optional parameters:
  4. launchHeight: Initial vertical height above ground in meters (m). Schema range: [0, 1000]. Default: 0.

RULES FOR EXTRACTION & NORMALIZATION:
1. UNIT CONVERSIONS:
   Normalize all extracted quantities into Mechanica's canonical units:
   - Velocity: convert to m/s.
     * km/h or kph -> m/s: divide by 3.6 (e.g., 144 km/h = 40 m/s; 72 km/h = 20 m/s; 36 km/h = 10 m/s).
     * mph -> m/s: multiply by 0.44704.
     * ft/s or fps -> m/s: multiply by 0.3048.
     * cm/s -> m/s: divide by 100.
   - Angle: convert to degrees [0, 90].
     * radians -> degrees: rad * (180 / π) (e.g., π/4 rad = 45°).
     * "horizontal" or "launched horizontally" -> 0 degrees.
     * "vertical" or "launched vertically upwards" -> 90 degrees.
   - Gravity: convert to m/s².
     * ft/s² -> m/s²: multiply by 0.3048 (e.g., 32.2 ft/s² = 9.81 m/s²).
   - Height: convert to meters (m).
     * km -> m: multiply by 1000.
     * cm -> m: divide by 100.
     * ft -> m: multiply by 0.3048.
   Record every conversion in the 'unitConversions' list with original text, parameter name, converted value, and unit.

2. EXPLICITLY PERMITTED DEFAULTS:
   - launchHeight: Default is 0 meters if not mentioned.
   - gravity:
     * If Earth is stated or if NO planet/gravity is mentioned at all, use 9.81 m/s² (Earth gravity default).
     * If Moon is stated ("on the moon", "lunar"), use 1.62 m/s².
     * If Jupiter is stated ("on Jupiter"), use 20 m/s².
     * If an explicit value is given (e.g., "g = 10 m/s²", "take g = 9.8"), use that exact number.
   - launchAngleDegrees:
     * 0° ONLY IF explicitly stated as horizontal ("fired horizontally").
     * 90° ONLY IF explicitly stated as vertical ("fired straight up", "thrown vertically").
     * In ALL other cases, if the angle is not mentioned, it is MISSING. NEVER assume 45° or any other default.
   - initialVelocity:
     * THERE IS NO DEFAULT FOR INITIAL VELOCITY. If initial velocity is not explicitly provided, it is MISSING.

3. NEVER GUESS MISSING PARAMETERS:
   - DO NOT implement equation solving or the Parameter Determination Layer.
   - If a problem gives range = 50 m and launch angle = 45°, and asks "Find the initial velocity", initialVelocity is an UNKNOWN, NOT a known parameter!
   - You must NOT calculate initialVelocity. Set initialVelocity to null.
   - Add "initialVelocity" to 'missingRequiredParameters', 'unknowns', and 'requestedOutputs'.
   - The simulation CANNOT be launched when any required parameter is missing.

4. CONTRADICTIONS:
   - If the input contains conflicting values for the same parameter (e.g., conflicting initial speeds such as 144 km/h and 90 km/h, conflicting angles such as 30° and 60°, or horizontal launch at 45 degrees):
     * Set isContradictory = true.
     * In 'contradictionReason', clearly identify the conflicting values, include their normalized values in canonical units (e.g., 144 km/h = 40 m/s vs 90 km/h = 25 m/s), and ask the user which value is correct (e.g., "Conflicting initial speeds specified: 144 km/h (40 m/s) and 90 km/h (25 m/s). Which value is correct?").
     * In 'unitConversions', normalize ALL provided conflicting values into canonical units (e.g., both 144 km/h -> 40 m/s and 90 km/h -> 25 m/s).
     * In 'contradictionOptions', provide the conflicting options for the user to choose from (e.g., [{ parameter: "initialVelocity", label: "40 m/s (144 km/h)", value: 40, originalText: "144 km/h" }, { parameter: "initialVelocity", label: "25 m/s (90 km/h)", value: 25, originalText: "90 km/h" }]).
     * Do NOT list contradictory parameters under 'missingRequiredParameters'; conflicting parameters are contradictory, NOT missing.
     * Set canLaunch = false.

5. AMBIGUITY:
   - If values lack essential units (e.g., "speed of 30"), or terms are vague/underspecified without clear physical meaning (e.g., "thrown fast at an angle"), set isAmbiguous = true and explain in 'ambiguityReason'.

6. UNSUPPORTED PHYSICS:
   - If the scenario involves physics outside ideal 2D projectile motion, set isSupported = false and explain in 'unsupportedReason'.
   - Examples of unsupported physics:
     * Air resistance, drag force, drag coefficient (Cd), terminal velocity.
     * Crosswinds, wind gusts, or 3D lateral motion.
     * Ball spin, curveball, Magnus effect, aerodynamic lift.
     * Relativistic speeds, speed of light, quantum mechanics.
     * Varying gravity over orbital altitudes or space orbits.
     * Bouncing, collisions with moving bodies, coefficient of restitution.

7. EXTRACTED ENTITIES:
   - requestedOutputs: List what the user/problem is asking to find or calculate (e.g. "maximum height", "range", "flight time", "impact velocity").
   - unknowns: List all unknown quantities.
   - constraints: List physical constraints, obstacles, or conditions (e.g. "target at distance 100m", "clears 5m wall at x=20m").

8. CAN LAUNCH DETERMINATION:
   - Set canLaunch to true ONLY IF:
     * isPhysicsQuestion is true
     * isSupported is true
     * isAmbiguous is false
     * isContradictory is false
     * missingRequiredParameters is EMPTY
     * initialVelocity is a finite number > 0 and <= 1000
     * launchAngleDegrees is a finite number >= 0 and <= 90
     * gravity is a finite number > 0 and <= 100
     * launchHeight is a finite number >= 0 and <= 1000
   - Otherwise, canLaunch MUST be false.`;

export const GEMINI_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    isPhysicsQuestion: {
      type: Type.BOOLEAN,
      description: "True if the input is a physics problem, scenario, or projectile motion question.",
    },
    module: {
      type: Type.STRING,
      description: "The physics module, must be 'projectileMotion'.",
    },
    isSupported: {
      type: Type.BOOLEAN,
      description: "True if supported by ideal 2D projectile motion. False if drag, spin, 3D, relativity, etc. are involved.",
    },
    unsupportedReason: {
      type: Type.STRING,
      description: "Explanation of why the question is unsupported, or null/empty if supported.",
    },
    isAmbiguous: {
      type: Type.BOOLEAN,
      description: "True if underspecified, vague, or missing necessary units.",
    },
    ambiguityReason: {
      type: Type.STRING,
      description: "Explanation of the ambiguity, or null/empty if clear.",
    },
    isContradictory: {
      type: Type.BOOLEAN,
      description: "True if contradictory values or statements are present.",
    },
    contradictionReason: {
      type: Type.STRING,
      description: "Explanation of the contradiction identifying the conflicting values, their normalized forms, and asking the user which value is correct. Null/empty if consistent.",
    },
    contradictionOptions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          parameter: { type: Type.STRING },
          label: { type: Type.STRING },
          value: { type: Type.NUMBER },
          originalText: { type: Type.STRING },
        },
        required: ["parameter", "label", "value"],
      },
      description: "Clickable options for the user to resolve the contradiction if conflicting values were supplied.",
    },
    parameters: {
      type: Type.OBJECT,
      properties: {
        initialVelocity: {
          type: Type.NUMBER,
          description: "Initial speed normalized to m/s. null if unknown or not directly specified.",
        },
        launchAngleDegrees: {
          type: Type.NUMBER,
          description: "Launch angle above horizontal in degrees [0, 90]. null if unknown or not specified.",
        },
        gravity: {
          type: Type.NUMBER,
          description: "Gravitational acceleration in m/s². Defaults to 9.81 for Earth if not specified.",
        },
        launchHeight: {
          type: Type.NUMBER,
          description: "Initial height in meters. Defaults to 0 if not specified.",
        },
      },
      required: [],
    },
    missingRequiredParameters: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Names of missing required parameters (e.g. 'initialVelocity', 'launchAngleDegrees', 'gravity').",
    },
    requestedOutputs: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "What the question asks to compute or solve for (e.g. 'range', 'maximum height', 'flight time').",
    },
    unknowns: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of unknown quantities identified in the problem.",
    },
    constraints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Physical constraints or conditions specified in the scenario.",
    },
    unitConversions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          originalText: { type: Type.STRING },
          parameter: { type: Type.STRING },
          convertedValue: { type: Type.NUMBER },
          convertedUnit: { type: Type.STRING },
        },
        required: ["originalText", "parameter", "convertedValue", "convertedUnit"],
      },
      description: "List of unit conversions performed.",
    },
    canLaunch: {
      type: Type.BOOLEAN,
      description: "Whether all required parameters are available, valid, and supported so the simulation can launch.",
    },
    explanation: {
      type: Type.STRING,
      description: "Clear, concise human-readable summary of what was interpreted or why simulation cannot be launched.",
    },
  },
  required: [
    "isPhysicsQuestion",
    "module",
    "isSupported",
    "isAmbiguous",
    "isContradictory",
    "parameters",
    "missingRequiredParameters",
    "requestedOutputs",
    "unknowns",
    "constraints",
    "unitConversions",
    "canLaunch",
    "explanation",
  ],
};

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
 * Interprets a natural-language physics question using Gemini structured output,
 * validates against Mechanica's SimulationSpec schema, and returns the result.
 *
 * @param {string} prompt - The user's natural language physics question or prompt.
 * @param {Object} [options]
 * @param {string} [options.apiKey] - Optional custom API key.
 * @param {GoogleGenAI} [options.client] - Optional mock/custom Gemini client.
 * @param {string} [options.model] - Optional Gemini model override.
 * @returns {Promise<Object>} Structured interpretation result.
 */
export async function interpretPhysicsQuestion(prompt, options = {}) {
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return {
      success: false,
      canLaunch: false,
      spec: null,
      error: "Please enter a physics question or scenario description.",
      code: "EMPTY_INPUT",
      interpretation: null,
      errors: ["Input prompt cannot be empty."],
      warnings: [],
    };
  }

  const trimmedPrompt = prompt.trim();
  const modelName = options.model || process.env.GEMINI_MODEL || "gemini-3.8-flash";

  let client;
  try {
    client = options.client || getGeminiClient(options.apiKey);
  } catch (err) {
    return {
      success: false,
      canLaunch: false,
      spec: null,
      error: err.message,
      code: "MISSING_API_KEY",
      interpretation: null,
      errors: [err.message],
      warnings: [],
    };
  }

  let rawContent;
  try {
    const response = await client.models.generateContent({
      model: modelName,
      contents: [
        {
          role: "user",
          parts: [{ text: trimmedPrompt }],
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
      canLaunch: false,
      spec: null,
      error: `Gemini API request failed: ${err.message}`,
      code: "API_ERROR",
      interpretation: null,
      errors: [`Gemini API request failed: ${err.message}`],
      warnings: [],
    };
  }

  let parsed;
  try {
    parsed = typeof rawContent === "object" ? rawContent : JSON.parse(rawContent);
  } catch (err) {
    return {
      success: false,
      canLaunch: false,
      spec: null,
      error: `Failed to parse structured response from Gemini: ${err.message}`,
      code: "MALFORMED_RESPONSE",
      interpretation: null,
      errors: [`Malformed JSON from AI model: ${rawContent}`],
      warnings: [],
    };
  }

  // Sanitize and verify parsed entities
  const interpretation = {
    isPhysicsQuestion: !!parsed.isPhysicsQuestion,
    module: parsed.module || "projectileMotion",
    isSupported: parsed.isSupported !== false,
    unsupportedReason: parsed.unsupportedReason || null,
    isAmbiguous: !!parsed.isAmbiguous,
    ambiguityReason: parsed.ambiguityReason || null,
    isContradictory: !!parsed.isContradictory,
    contradictionReason: parsed.contradictionReason || null,
    parameters: {
      initialVelocity: parsed.parameters?.initialVelocity ?? null,
      launchAngleDegrees: parsed.parameters?.launchAngleDegrees ?? null,
      gravity: parsed.parameters?.gravity ?? 9.81,
      launchHeight: parsed.parameters?.launchHeight ?? 0,
    },
    missingRequiredParameters: Array.isArray(parsed.missingRequiredParameters)
      ? [...parsed.missingRequiredParameters]
      : [],
    requestedOutputs: Array.isArray(parsed.requestedOutputs)
      ? parsed.requestedOutputs
      : [],
    unknowns: Array.isArray(parsed.unknowns) ? parsed.unknowns : [],
    constraints: Array.isArray(parsed.constraints) ? parsed.constraints : [],
    unitConversions: Array.isArray(parsed.unitConversions)
      ? parsed.unitConversions
      : [],
    contradictionOptions: Array.isArray(parsed.contradictionOptions)
      ? parsed.contradictionOptions.map((opt) => ({
          parameter: opt.parameter,
          label: opt.label || `${opt.value} ${opt.parameter}`,
          value: Number(opt.value),
          originalText: opt.originalText || "",
        }))
      : [],
    explanation: parsed.explanation || "",
  };

  const errors = [];
  const warnings = [];

  // Independent strict verification
  if (!interpretation.isPhysicsQuestion) {
    errors.push("The input does not appear to be a physics problem or projectile motion question.");
  }

  if (!interpretation.isSupported) {
    errors.push(
      interpretation.unsupportedReason ||
        "The problem involves physics phenomena (e.g. air resistance, 3D motion, or spin) not currently supported by Mechanica's ideal 2D projectile motion engine."
    );
  }

  // Handle contradiction post-processing
  if (interpretation.isContradictory) {
    let reason = interpretation.contradictionReason || "Contradictory parameter values or physical statements were detected.";
    if (!reason.includes("?") && !reason.toLowerCase().includes("which")) {
      reason += " Which value is correct?";
    }
    interpretation.contradictionReason = reason;
    errors.push(reason);

    // Ensure all non-canonical units for conflicting values in prompt are normalized in unitConversions
    const speedMatches = [...trimmedPrompt.matchAll(/(\d+(?:\.\d+)?)\s*(km\/h|kph|mph)\b/gi)];
    for (const match of speedMatches) {
      const origText = match[0];
      const val = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      let convertedVal = val;
      if (unit === "km/h" || unit === "kph") convertedVal = Math.round((val / 3.6) * 100) / 100;
      else if (unit === "mph") convertedVal = Math.round(val * 0.44704 * 100) / 100;

      const alreadyRecorded = interpretation.unitConversions.some(
        (c) => c.originalText.toLowerCase() === origText.toLowerCase()
      );
      if (!alreadyRecorded) {
        interpretation.unitConversions.push({
          originalText: origText,
          parameter: "initialVelocity",
          convertedValue: convertedVal,
          convertedUnit: "m/s",
        });
      }
    }
  }

  if (interpretation.isAmbiguous) {
    errors.push(
      interpretation.ambiguityReason ||
        "The question is ambiguous or lacks necessary units/clarity."
    );
  }

  // Determine if a parameter is contradictory rather than genuinely missing
  const contradictionText = (interpretation.contradictionReason || "").toLowerCase();
  const isVelocityContradictory = interpretation.isContradictory && (
    contradictionText.includes("velocity") ||
    contradictionText.includes("speed") ||
    contradictionText.includes("km/h") ||
    contradictionText.includes("m/s") ||
    contradictionText.includes("mph") ||
    [...trimmedPrompt.matchAll(/\b\d+(?:\.\d+)?\s*(km\/h|kph|m\/s|mph)\b/gi)].length >= 2
  );
  const isAngleContradictory = interpretation.isContradictory && (
    contradictionText.includes("angle") ||
    contradictionText.includes("degree") ||
    contradictionText.includes("horizontal") ||
    contradictionText.includes("vertical") ||
    [...trimmedPrompt.matchAll(/\b\d+(?:\.\d+)?\s*(?:°|deg(?:rees)?)\b/gi)].length >= 2
  );
  const isGravityContradictory = interpretation.isContradictory && (
    contradictionText.includes("gravity") ||
    contradictionText.includes("m/s²") ||
    contradictionText.includes("ms^-2")
  );

  // If contradictionOptions not populated, synthesize from prompt
  if (interpretation.isContradictory && interpretation.contradictionOptions.length < 2) {
    if (isVelocityContradictory) {
      const speedMatchesAll = [...trimmedPrompt.matchAll(/(\d+(?:\.\d+)?)\s*(km\/h|kph|mph|m\/s)\b/gi)];
      if (speedMatchesAll.length >= 2) {
        interpretation.contradictionOptions = speedMatchesAll.map((m) => {
          const raw = parseFloat(m[1]);
          const unit = m[2].toLowerCase();
          let norm = raw;
          if (unit === "km/h" || unit === "kph") norm = Math.round((raw / 3.6) * 100) / 100;
          else if (unit === "mph") norm = Math.round(raw * 0.44704 * 100) / 100;
          const orig = m[0];
          const label = unit !== "m/s" ? `${norm} m/s (${orig})` : `${norm} m/s`;
          return {
            parameter: "initialVelocity",
            label,
            value: norm,
            originalText: orig,
          };
        });
      }
    } else if (isAngleContradictory) {
      const angleMatchesAll = [...trimmedPrompt.matchAll(/(\d+(?:\.\d+)?)\s*(?:°|deg(?:rees)?)\b/gi)];
      if (angleMatchesAll.length >= 2) {
        interpretation.contradictionOptions = angleMatchesAll.map((m) => {
          const val = Number(m[1]);
          return {
            parameter: "launchAngleDegrees",
            label: `${val}°`,
            value: val,
            originalText: m[0],
          };
        });
      }
    }
  }

  // Filter missingRequiredParameters to exclude contradictory parameters
  const params = interpretation.parameters;
  const missing = new Set(
    (interpretation.missingRequiredParameters || []).filter((param) => {
      if (param === "initialVelocity" && isVelocityContradictory) return false;
      if (param === "launchAngleDegrees" && isAngleContradictory) return false;
      if (param === "gravity" && isGravityContradictory) return false;
      return true;
    })
  );

  // Verify genuinely missing required parameters (only if not contradictory)
  if (!isVelocityContradictory) {
    if (params.initialVelocity === null || params.initialVelocity === undefined || !Number.isFinite(params.initialVelocity)) {
      missing.add("initialVelocity");
      errors.push("Missing required parameter: initialVelocity (launch speed). Mechanica cannot simulate without an initial velocity.");
    }
  }

  if (!isAngleContradictory) {
    if (params.launchAngleDegrees === null || params.launchAngleDegrees === undefined || !Number.isFinite(params.launchAngleDegrees)) {
      missing.add("launchAngleDegrees");
      errors.push("Missing required parameter: launchAngleDegrees. Mechanica cannot simulate without a launch angle.");
    }
  }

  if (!isGravityContradictory) {
    if (params.gravity === null || params.gravity === undefined || !Number.isFinite(params.gravity)) {
      missing.add("gravity");
      errors.push("Missing required parameter: gravity.");
    }
  }

  interpretation.missingRequiredParameters = Array.from(missing);

  // If there are errors or missing parameters, simulation launch is strictly prevented
  if (errors.length > 0 || interpretation.missingRequiredParameters.length > 0) {
    return {
      success: true,
      canLaunch: false,
      spec: null,
      interpretation,
      errors,
      warnings,
    };
  }

  // Construct canonical SimulationSpec v1.0
  const candidateSpec = {
    version: SIMULATION_SPEC_VERSION,
    module: "projectileMotion",
    parameters: {
      initialVelocity: params.initialVelocity,
      launchAngleDegrees: params.launchAngleDegrees,
      gravity: params.gravity,
      launchHeight: params.launchHeight ?? 0,
    },
    metadata: {
      source: "ai",
      description: trimmedPrompt,
      requestedOutputs: interpretation.requestedOutputs,
      unknowns: interpretation.unknowns,
      constraints: interpretation.constraints,
      unitConversions: interpretation.unitConversions,
      aiExplanation: interpretation.explanation,
    },
  };

  // Pass candidate spec through existing Mechanica validator
  const validationResult = validateSimulationSpec(candidateSpec);

  if (!validationResult.valid) {
    return {
      success: true,
      canLaunch: false,
      spec: null,
      interpretation,
      errors: [...errors, ...validationResult.errors],
      warnings: [...warnings, ...validationResult.warnings],
    };
  }

  return {
    success: true,
    canLaunch: true,
    spec: validationResult.spec,
    interpretation,
    errors: [],
    warnings: [...warnings, ...validationResult.warnings],
  };
}
