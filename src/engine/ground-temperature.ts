import { GroundTemperatureError } from "./errors";
import type { GroundTemperatureResult } from "./types";

function finite(name: string, value: number): number {
  if (!Number.isFinite(value)) throw new GroundTemperatureError(`${name} must be finite`);
  return value;
}

function validateDepth(name: string, depthM: number, minimumDepthM: number): number {
  const depth = finite(name, depthM);
  const minimum = finite("minimumDepthM", minimumDepthM);
  if (depth < minimum) {
    throw new GroundTemperatureError(`${name} must be at least ${minimum} m`);
  }
  return depth;
}

export function groundTemperatureFromSurfaceGradient(
  surfaceTemperatureC: number,
  gradientCPerM: number,
  targetDepthM: number,
  minimumDepthM: number,
  shallowWarningDepthM: number,
): GroundTemperatureResult {
  const surface = finite("surfaceTemperatureC", surfaceTemperatureC);
  const gradient = finite("gradientCPerM", gradientCPerM);
  const depth = validateDepth("targetDepthM", targetDepthM, minimumDepthM);
  const warningDepth = finite("shallowWarningDepthM", shallowWarningDepthM);
  const ground = surface + gradient * depth;
  const warnings =
    depth < warningDepth
      ? ["Target depth is shallower than the configured seasonal-stability warning depth."]
      : [];
  return {
    mode: "surface_gradient",
    groundTemperatureC: ground,
    targetDepthM: depth,
    surfaceTemperatureC: surface,
    gradientCPerM: gradient,
    boreholeTemperatureC: null,
    boreholeDepthM: null,
    extrapolated: false,
    warnings,
    trace: {
      equation: "T_z = T_s + g * z",
      surfaceTemperatureC: surface,
      gradientCPerM: gradient,
      targetDepthM: depth,
    },
  };
}

export function groundTemperatureFromInterpolation(
  surfaceTemperatureC: number,
  boreholeTemperatureC: number,
  boreholeDepthM: number,
  targetDepthM: number,
  minimumDepthM: number,
  shallowWarningDepthM: number,
  allowExtrapolationBelowBorehole: boolean,
  absoluteTolerance: number,
): GroundTemperatureResult {
  const surface = finite("surfaceTemperatureC", surfaceTemperatureC);
  const boreholeTemperature = finite("boreholeTemperatureC", boreholeTemperatureC);
  const boreholeDepth = validateDepth("boreholeDepthM", boreholeDepthM, minimumDepthM);
  const targetDepth = validateDepth("targetDepthM", targetDepthM, minimumDepthM);
  const tolerance = Math.abs(finite("absoluteTolerance", absoluteTolerance));
  if (boreholeDepth <= tolerance) {
    throw new GroundTemperatureError("boreholeDepthM must be greater than zero");
  }
  const extrapolated = targetDepth > boreholeDepth + tolerance;
  if (extrapolated && !allowExtrapolationBelowBorehole) {
    throw new GroundTemperatureError(
      "targetDepthM exceeds boreholeDepthM and extrapolation is disabled",
    );
  }
  const gradient = (boreholeTemperature - surface) / boreholeDepth;
  const ground = surface + ((boreholeTemperature - surface) * targetDepth) / boreholeDepth;
  const warnings: string[] = [];
  if (targetDepth < shallowWarningDepthM) {
    warnings.push(
      "Target depth is shallower than the configured seasonal-stability warning depth.",
    );
  }
  if (extrapolated) {
    warnings.push("Ground temperature is extrapolated below the borehole observation.");
  }
  return {
    mode: "surface_borehole_interpolation",
    groundTemperatureC: ground,
    targetDepthM: targetDepth,
    surfaceTemperatureC: surface,
    gradientCPerM: gradient,
    boreholeTemperatureC: boreholeTemperature,
    boreholeDepthM: boreholeDepth,
    extrapolated,
    warnings,
    trace: {
      equation: "T_z = T_s + (T_b - T_s) * z / z_b",
      surfaceTemperatureC: surface,
      boreholeTemperatureC: boreholeTemperature,
      boreholeDepthM: boreholeDepth,
      targetDepthM: targetDepth,
    },
  };
}

export function directGroundTemperature(groundTemperatureC: number): GroundTemperatureResult {
  const ground = finite("groundTemperatureC", groundTemperatureC);
  return {
    mode: "direct",
    groundTemperatureC: ground,
    targetDepthM: null,
    surfaceTemperatureC: null,
    gradientCPerM: null,
    boreholeTemperatureC: null,
    boreholeDepthM: null,
    extrapolated: false,
    warnings: [],
    trace: { equation: "T_z = user_input", groundTemperatureC: ground },
  };
}
