import { validateSimulationSpec } from "./validate.js";
import { SIMULATION_SPEC_VERSION } from "./simulationSpec.js";

/**
 * Parses user input (JSON SimulationSpec, shorthand JSON, key-value string, or physics prompt)
 * into a validated SimulationSpec.
 *
 * @param {string} raw - The raw user input.
 * @returns {import('./validate.js').ValidationResult}
 */
export function parseCustomSimulationInput(raw) {
  if (!raw || typeof raw !== "string") {
    return {
      valid: false,
      spec: null,
      errors: ["Please enter simulation configurations or data."],
      warnings: [],
    };
  }

  const text = raw.trim();
  if (!text) {
    return {
      valid: false,
      spec: null,
      errors: ["Please enter simulation configurations or data."],
      warnings: [],
    };
  }

  // 1. JSON candidate
  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    try {
      const parsed = JSON.parse(text);

      // Full SimulationSpec v1.0
      if (parsed.module && parsed.parameters) {
        return validateSimulationSpec(parsed);
      }

      // Wrapped parameters object
      if (parsed.parameters && typeof parsed.parameters === "object") {
        return validateSimulationSpec({
          version: parsed.version || SIMULATION_SPEC_VERSION,
          module: "projectileMotion",
          parameters: parsed.parameters,
          metadata: parsed.metadata || { source: "custom_ui" },
        });
      }

      // Flat dictionary of parameters
      const params = {};
      for (const [k, v] of Object.entries(parsed)) {
        const lk = k.toLowerCase().replace(/[-_]/g, "");
        if (["initialvelocity", "velocity", "v", "speed", "u"].includes(lk)) {
          params.initialVelocity = Number(v);
        } else if (["launchangledegrees", "angle", "launchangle", "theta", "deg", "degrees", "a"].includes(lk)) {
          params.launchAngleDegrees = Number(v);
        } else if (["gravity", "g", "grav"].includes(lk)) {
          params.gravity = Number(v);
        } else if (["launchheight", "height", "h", "initialheight"].includes(lk)) {
          params.launchHeight = Number(v);
        }
      }

      return validateSimulationSpec({
        version: SIMULATION_SPEC_VERSION,
        module: "projectileMotion",
        parameters: params,
        metadata: { source: "custom_ui" },
      });
    } catch (e) {
      return {
        valid: false,
        spec: null,
        errors: [`Invalid JSON syntax: ${e.message}`],
        warnings: [],
      };
    }
  }

  // 2. Key-value pairs (e.g. "velocity=45, angle=60, gravity=9.81" or "v: 45\na: 60\ng: 9.81")
  const kvMatches = text.match(/([a-zA-Z_]+)\s*[:=]\s*(-?[\d.]+)/g);
  if (kvMatches && kvMatches.length >= 2) {
    const params = {};
    for (const pair of kvMatches) {
      const parts = pair.split(/[:=]/);
      const lk = parts[0].trim().toLowerCase().replace(/[-_]/g, "");
      const num = Number(parts[1].trim());
      if (["initialvelocity", "velocity", "v", "speed", "u"].includes(lk)) {
        if (params.initialVelocity !== undefined && Math.abs(params.initialVelocity - num) > 1e-4) {
          return {
            valid: false,
            spec: null,
            errors: [`Contradiction detected: Conflicting initial velocities specified (${params.initialVelocity} and ${num}). Which value is correct?`],
            warnings: [],
          };
        }
        params.initialVelocity = num;
      } else if (["launchangledegrees", "angle", "launchangle", "theta", "deg", "degrees", "a"].includes(lk)) {
        if (params.launchAngleDegrees !== undefined && Math.abs(params.launchAngleDegrees - num) > 1e-4) {
          return {
            valid: false,
            spec: null,
            errors: [`Contradiction detected: Conflicting launch angles specified (${params.launchAngleDegrees}° and ${num}°). Which value is correct?`],
            warnings: [],
          };
        }
        params.launchAngleDegrees = num;
      } else if (["gravity", "g", "grav"].includes(lk)) {
        if (params.gravity !== undefined && Math.abs(params.gravity - num) > 1e-4) {
          return {
            valid: false,
            spec: null,
            errors: [`Contradiction detected: Conflicting gravity values specified (${params.gravity} and ${num}). Which value is correct?`],
            warnings: [],
          };
        }
        params.gravity = num;
      } else if (["launchheight", "height", "h", "initialheight"].includes(lk)) {
        params.launchHeight = num;
      }
    }

    if (params.initialVelocity !== undefined || params.launchAngleDegrees !== undefined) {
      return validateSimulationSpec({
        version: SIMULATION_SPEC_VERSION,
        module: "projectileMotion",
        parameters: params,
        metadata: { source: "custom_ui" },
      });
    }
  }

  // 3. Question / Natural Language extraction
  const params = {};

  // Check for multiple conflicting speeds in text (e.g. 144 km/h and 90 km/h)
  const speedMatches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:m\/s|ms\^-1|meters?\s+per\s+second|km\/h|kph|mph)\b/gi)];
  if (speedMatches.length >= 2) {
    const s1Raw = parseFloat(speedMatches[0][1]);
    const s1Unit = speedMatches[0][0].toLowerCase().includes("km") ? "km/h" : (speedMatches[0][0].toLowerCase().includes("mph") ? "mph" : "m/s");
    const s1Norm = s1Unit === "km/h" ? Math.round((s1Raw / 3.6) * 100) / 100 : (s1Unit === "mph" ? Math.round(s1Raw * 0.44704 * 100) / 100 : s1Raw);

    const s2Raw = parseFloat(speedMatches[1][1]);
    const s2Unit = speedMatches[1][0].toLowerCase().includes("km") ? "km/h" : (speedMatches[1][0].toLowerCase().includes("mph") ? "mph" : "m/s");
    const s2Norm = s2Unit === "km/h" ? Math.round((s2Raw / 3.6) * 100) / 100 : (s2Unit === "mph" ? Math.round(s2Raw * 0.44704 * 100) / 100 : s2Raw);

    if (Math.abs(s1Norm - s2Norm) > 1e-4) {
      return {
        valid: false,
        spec: null,
        errors: [
          `Contradiction detected: Conflicting initial speeds specified: ${speedMatches[0][0]} (${s1Norm} m/s) and ${speedMatches[1][0]} (${s2Norm} m/s). Which value is correct?`,
        ],
        warnings: [],
      };
    }
  }

  // Angle: e.g. "45 deg", "45 degrees", "45°", "angle of 45"
  const angleMatch =
    text.match(/(\d+(?:\.\d+)?)\s*(?:°|deg(?:rees)?)\b/i) ||
    text.match(/(?:angle(?:\s+of)?)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (angleMatch) params.launchAngleDegrees = Number(angleMatch[1]);

  // Velocity: e.g. "42 m/s", "42 ms^-1", "144 km/h", "velocity of 42", "speed 42"
  const velMatch =
    text.match(/(\d+(?:\.\d+)?)\s*(?:m\/s|ms\^-1|meters?\s+per\s+second)\b/i) ||
    text.match(/(\d+(?:\.\d+)?)\s*(?:km\/h|kph)\b/i) ||
    text.match(/(?:velocity|speed)\s*(?:of)?\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (velMatch) {
    const rawVal = Number(velMatch[1]);
    if (velMatch[0].toLowerCase().includes("km")) {
      params.initialVelocity = Math.round((rawVal / 3.6) * 100) / 100;
    } else {
      params.initialVelocity = rawVal;
    }
  }

  // Gravity: e.g. "9.81 m/s²", "gravity 9.81", or planet references
  const gravMatch =
    text.match(/(\d+(?:\.\d+)?)\s*(?:m\/s\^?2|ms\^-2|m\/s²)\b/i) ||
    text.match(/(?:gravity|g)\s*(?:of)?\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (gravMatch) {
    params.gravity = Number(gravMatch[1]);
  } else if (/moon/i.test(text)) {
    params.gravity = 1.62;
  } else if (/jupiter/i.test(text)) {
    params.gravity = 20;
  } else if (/earth/i.test(text)) {
    params.gravity = 9.81;
  }

  if (params.initialVelocity !== undefined || params.launchAngleDegrees !== undefined) {
    if (params.gravity === undefined) params.gravity = 9.81;
    return validateSimulationSpec({
      version: SIMULATION_SPEC_VERSION,
      module: "projectileMotion",
      parameters: params,
      metadata: { source: "custom_ui", description: text },
    });
  }

  return {
    valid: false,
    spec: null,
    errors: [
      'Could not parse configurations. Please enter formatted JSON (e.g. {"initialVelocity": 45, "launchAngleDegrees": 60, "gravity": 9.81}) or parameter shorthand (e.g. v=45, a=60, g=9.81).',
    ],
    warnings: [],
  };
}
