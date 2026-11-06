/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Swimmable areas for fish and ducks, transcribed from the legacy
 * waterBoundsCheckUtils.js (sampled from the island with a dev tool).
 *
 * Each area is a stack of [x0, x1] spans spaced 0.25 m along a sampled axis
 * starting at yStart. For the river (vertical sampling) a = world x and
 * b = world z; for the pond a = world z and b = world x.
 */

const SEGMENT = 0.25;

export interface WaterArea {
  vertical: boolean;
  yStart: number;
  /** Flattened [x0, x1] pairs. */
  spans: Float32Array;
}

const area = (vertical: boolean, yStart: number, spans: number[]): WaterArea => ({
  vertical,
  yStart,
  spans: new Float32Array(spans),
});

export const WATER_AREAS = {
  river: area(
    true,
    -13.5,
    [
      -44.121, -44.016, -44.988, -43.155, -45.458, -42.793, -45.731, -42.509, -45.953, -42.225, -46.115, -42.029,
      -46.277, -41.914, -46.427, -41.799, -46.486, -41.688, -46.545, -41.696, -46.605, -41.704, -46.664, -41.711,
      -46.723, -41.773, -46.785, -41.848, -46.853, -41.924, -46.921, -41.999, -46.989, -42.074, -47.057, -42.149,
      -47.156, -42.224, -47.283, -42.322, -47.41, -42.427, -47.536, -42.531, -47.663, -42.635, -47.758, -42.74, -47.824,
      -42.844, -47.891, -42.949, -47.958, -43.053, -48.024, -43.158, -48.091, -43.262, -48.158, -43.364, -48.224,
      -43.449, -48.291, -43.534, -48.358, -43.618, -48.424, -43.703, -48.491, -43.788, -48.538, -43.873, -48.578,
      -43.964, -48.618, -44.073, -48.659, -44.182, -48.699, -44.291, -48.74, -44.401, -48.78, -44.51, -48.82, -44.619,
      -48.861, -44.728, -48.901, -44.837, -48.942, -44.947, -48.975, -45.056, -48.999, -45.187, -49.022, -45.319,
      -49.046, -45.452, -49.07, -45.585, -49.093, -45.644, -49.117, -45.691, -49.141, -45.738, -49.164, -45.785,
      -49.188, -45.832, -49.211, -45.879, -49.233, -45.926, -49.248, -45.973, -49.263, -46.02, -49.278, -46.067,
      -49.293, -46.113, -49.308, -46.16, -49.323, -46.207, -49.339, -46.299, -49.354, -46.419, -49.369, -46.539,
      -49.384, -46.659, -49.411, -46.78, -49.483, -46.9, -49.555, -46.982, -49.627, -47.04, -49.699, -47.097, -49.771,
      -47.155, -49.843, -47.213, -49.915, -47.27, -49.987, -47.328, -50.059, -47.385, -50.131, -47.415, -50.203,
      -47.339, -50.253, -47.263, -50.298, -47.187, -50.343, -47.111, -50.387, -47.035, -50.432, -46.959, -50.477,
      -46.883, -50.521, -46.807, -50.566, -46.731, -50.611, -46.655, -50.655, -46.629, -50.7, -46.638, -50.745, -46.646,
      -50.754, -46.655, -50.763, -46.707, -50.772, -46.785, -50.782, -46.863, -50.791, -46.942, -50.709, -47.02,
      -50.555, -47.278, -50.401, -47.566, -50.247, -47.855, -49.887, -48.24,
    ],
  ),
  pond: area(
    false,
    -4.5,
    [
      22.873, 25.142, 22.402, 25.679, 22.095, 26.04, 21.981, 26.321, 21.92, 26.482, 21.86, 26.623, 21.795, 26.739,
      21.723, 26.834, 21.645, 26.9, 21.554, 26.962, 21.463, 26.996, 21.365, 27.026, 21.247, 27.045, 21.116, 27.063,
      20.974, 27.077, 20.833, 27.074, 20.724, 27.056, 20.616, 26.997, 20.493, 26.933, 20.368, 26.86, 20.259, 26.779,
      20.137, 26.682, 19.983, 26.578, 19.865, 26.471, 19.755, 26.313, 19.623, 26.133, 19.513, 25.93, 19.34, 25.797,
      19.22, 25.651, 19.086, 25.489, 19.001, 25.295, 18.872, 25.036, 18.721, 24.732, 18.607, 24.497, 18.484, 24.357,
      18.376, 24.271, 18.293, 24.254, 18.206, 24.288, 18.105, 24.349, 18.024, 24.425, 17.917, 24.511, 17.832, 24.617,
      17.769, 24.702, 17.709, 24.731, 17.635, 24.757, 17.563, 24.794, 17.491, 24.849, 17.43, 24.904, 17.37, 24.96,
      17.311, 25.016, 17.255, 25.072, 17.199, 25.128, 17.156, 25.179, 17.114, 25.229, 17.081, 25.281, 17.052, 25.336,
      17.028, 25.392, 17.006, 25.447, 16.991, 25.503, 16.986, 25.599, 16.982, 25.705, 16.979, 25.81, 16.986, 25.915,
      16.992, 26.021, 17.001, 26.097, 17.014, 26.16, 17.027, 26.225, 17.04, 26.294, 17.053, 26.363, 17.075, 26.416,
      17.103, 26.462, 17.131, 26.51, 17.162, 26.579, 17.193, 26.648, 17.225, 26.702, 17.256, 26.736, 17.319, 26.758,
      17.383, 26.74, 17.446, 26.684, 17.509, 26.601, 17.594, 26.521, 17.684, 26.442, 17.774, 26.37, 17.885, 26.316,
      18.047, 26.26, 18.209, 26.149, 18.377, 26.038, 18.59, 25.948, 18.802, 25.863, 19.015, 25.778, 19.388, 25.61,
      19.869, 25.411, 20.405, 25.161, 20.938, 24.831, 21.535, 24.276, 22.567, 23.076,
    ],
  ),
} as const;

const layers = (area: WaterArea) => area.spans.length / 2;

/** Signed distances to the two span edges at (a, b), or NaN outside the stack. */
function sides(a: number, b: number, area: WaterArea, out: [number, number]): boolean {
  const t = (b - area.yStart) / SEGMENT;
  if (t < 0 || t >= layers(area) - 1) return false;
  const i0 = Math.floor(t);
  const f1 = t - i0;
  const f0 = 1 - f1;
  const s = area.spans;
  const e0 = f0 * s[i0 * 2] + f1 * s[i0 * 2 + 2];
  const e1 = f0 * s[i0 * 2 + 1] + f1 * s[i0 * 2 + 3];
  out[0] = a - e0;
  out[1] = e1 - a;
  return true;
}

const tmp: [number, number] = [0, 0];

export function isInArea(a: number, b: number, area: WaterArea): boolean {
  return sides(a, b, area, tmp) && tmp[0] * tmp[1] > 0;
}

/** Legacy estimate of the distance to the shore along (da, db). */
export function distanceToShore(a: number, b: number, da: number, db: number, area: WaterArea): number {
  if (!sides(a, b, area, tmp) || tmp[0] * tmp[1] <= 0) return 0;
  const aSide = Math.abs(da > 0 ? tmp[0] : tmp[1]);
  let probe = db > 0 ? Math.ceil(b) : Math.floor(b);
  let guard = 0;
  while (isInArea(a, probe, area) && guard++ < 400) probe += db > 0 ? SEGMENT : -SEGMENT;
  const bSide = Math.abs(probe - b);
  if (aSide * bSide === 0) return 0;
  return (aSide * bSide) / Math.sqrt(aSide * aSide + bSide * bSide);
}

export function randomPointInArea(area: WaterArea, out: [number, number]): void {
  const segment = Math.floor(Math.random() * (layers(area) - 1));
  const b = (segment + Math.random()) * SEGMENT + area.yStart;
  sides(0, b, area, tmp);
  // sides() returned -e0 and e1 for a = 0.
  const e0 = -tmp[0];
  const e1 = tmp[1];
  const k = Math.random();
  out[0] = e0 * k + e1 * (1 - k);
  out[1] = b;
}
