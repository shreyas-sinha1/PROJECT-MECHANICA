import { describe, it, expect } from "vitest";
import { solver, computeProjectileMotion } from "../../modules/projectileMotion/index.js";
import { createEngine } from "../../core/engine.js";
import { loadSimulationSpec } from "../adapter.js";
import { scene } from "../../scene/scene.js";

describe("Launch Height Physics & Simulation Pipeline", () => {
  const g = 9.81;

  describe("Solver Kinematic Equations with launchHeight", () => {
    it("computes correct flight time and range for horizontal launch from cliff", () => {
      const h0 = 45;
      const vx = 30;
      // For horizontal launch (vy = 0): t = sqrt(2 * h0 / g)
      const expectedTime = Math.sqrt((2 * h0) / g);
      const expectedRange = vx * expectedTime;

      const motion = computeProjectileMotion({
        initialVelocity: vx,
        launchAngleDegrees: 0,
        gravity: g,
        launchHeight: h0,
      });

      expect(motion.flightMetrics.totalFlightTime).toBeCloseTo(expectedTime, 4);
      expect(motion.flightMetrics.range).toBeCloseTo(expectedRange, 3);
      expect(motion.flightMetrics.maximumHeight).toBe(h0);
      expect(motion.initialPoint.yPosition).toBe(h0);
      expect(motion.initialPoint.xPosition).toBe(0);

      // Verify trajectory starts at h0 and ends at ground
      const first = motion.trajectory[0];
      const last = motion.trajectory[motion.trajectory.length - 1];
      expect(first.yPosition).toBe(h0);
      expect(last.yPosition).toBeCloseTo(0, 1);
      expect(last.xPosition).toBeCloseTo(expectedRange, 1);
    });

    it("computes correct maximum height and quadratic flight time for angled launch with initial height", () => {
      const h0 = 20;
      const v = 50;
      const angleDeg = 30;
      const vy = v * Math.sin((angleDeg * Math.PI) / 180); // 25 m/s
      const vx = v * Math.cos((angleDeg * Math.PI) / 180);

      // t = (vy + sqrt(vy^2 + 2*g*h0)) / g
      const expectedTime = (vy + Math.sqrt(vy * vy + 2 * g * h0)) / g;
      const expectedMaxHeight = h0 + (vy * vy) / (2 * g);
      const expectedRange = vx * expectedTime;

      const motion = computeProjectileMotion({
        initialVelocity: v,
        launchAngleDegrees: angleDeg,
        gravity: g,
        launchHeight: h0,
      });

      expect(motion.flightMetrics.totalFlightTime).toBeCloseTo(expectedTime, 4);
      expect(motion.flightMetrics.maximumHeight).toBeCloseTo(expectedMaxHeight, 3);
      expect(motion.flightMetrics.range).toBeCloseTo(expectedRange, 2);

      // Trajectory apex should equal maximumHeight
      const peakY = Math.max(...motion.trajectory.map((p) => p.yPosition));
      expect(peakY).toBeCloseTo(expectedMaxHeight, 2);
    });
  });

  describe("Engine & Adapter Propagation", () => {
    it("propagates launchHeight from SimulationSpec into engine state", () => {
      const engine = createEngine(scene);
      const spec = {
        version: "1.0",
        module: "projectileMotion",
        parameters: {
          initialVelocity: 40,
          launchAngleDegrees: 25,
          gravity: 9.81,
          launchHeight: 18.5,
        },
      };

      const res = loadSimulationSpec(engine, spec, { autoLaunch: false });
      expect(res.valid).toBe(true);

      const state = engine.getState();
      expect(state.parameters.launchHeight).toBe(18.5);
      expect(state.currentPoint.yPosition).toBe(18.5);
      expect(state.predictedTrajectory[0].yPosition).toBe(18.5);
    });

    it("engine.setParameters updates launchHeight and recalculates trajectory", () => {
      const engine = createEngine(scene);
      engine.setParameters({ launchHeight: 32 });

      const state = engine.getState();
      expect(state.parameters.launchHeight).toBe(32);
      expect(state.currentPoint.yPosition).toBe(32);
      expect(state.predictedTrajectory[0].yPosition).toBe(32);
    });
  });
});

