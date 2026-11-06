/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Plant growth profiles, transcribed from the legacy PlantConfigs.js.
 *
 * Each animated key drives one PD spring: root scales the whole plant, and
 * x, y, z and w scale the four art-defined segments about their pivots.
 * Variants of one species share a profile.
 */

export type GrowthKey = 'root' | 'x' | 'y' | 'z' | 'w';
export const GROWTH_KEYS: readonly GrowthKey[] = ['root', 'x', 'y', 'z', 'w'];

export interface SpringStage {
  /** Fraction of the growth duration before this key starts. */
  delay: number;
  damping: number;
  frequency: number;
  /** Random +/- range around the target value of 1. */
  margin: number;
}

export interface GrowthProfile {
  baselineScale: number;
  heightMargin: number;
  growthDuration: number;
  rotationRange: [number, number];
  growth: Record<GrowthKey, SpringStage>;
  convergenceDuration: number;
  convergenceFrequency: number;
  convergenceDamping: number;
  shrinkDuration: number;
  shrink: Record<GrowthKey, SpringStage>;
}

const stage = (delay: number, damping: number, frequency: number, margin = 0): SpringStage => ({
  delay,
  damping,
  frequency,
  margin,
});

export const GROWTH_PROFILES = {
  default: {
    baselineScale: 3,
    heightMargin: 0.15,
    growthDuration: 1,
    rotationRange: [0, 6.283185],
    growth: {
      root: stage(0, 0.8, 0.9, 0.2),
      x: stage(0, 0.8, 0.9),
      y: stage(0, 0.8, 0.9),
      z: stage(0, 0.8, 0.9),
      w: stage(0, 0.8, 0.9),
    },
    convergenceDuration: 0.25,
    convergenceFrequency: 5,
    convergenceDamping: 2,
    shrinkDuration: 1,
    shrink: {
      root: stage(0, 0.8, 0.9),
      x: stage(0, 0.8, 0.9),
      y: stage(0, 0.8, 0.9),
      z: stage(0, 0.8, 0.9),
      w: stage(0, 0.8, 0.9),
    },
  },
  pansy_a: {
    baselineScale: 1.3,
    heightMargin: 0.15,
    growthDuration: 1.5,
    rotationRange: [0, 6.283185],
    growth: {
      root: stage(0, 0.35, 2.5, 0.1),
      x: stage(0.5, 0.3, 3, 0.2),
      y: stage(0.65, 0.3, 3, 0.2),
      z: stage(0.8, 0.25, 3, 0.2),
      w: stage(0.15, 0.4, 2.5, 0.1),
    },
    convergenceDuration: 0.55,
    convergenceFrequency: 5,
    convergenceDamping: 2,
    shrinkDuration: 1,
    shrink: {
      root: stage(0, 0.8, 0.9),
      x: stage(0, 0.8, 0.9),
      y: stage(0, 0.8, 0.9),
      z: stage(0, 0.8, 0.9),
      w: stage(0, 0.8, 0.9),
    },
  },
  tulip_a: {
    baselineScale: 0.75,
    heightMargin: 0,
    growthDuration: 1.5,
    rotationRange: [0, 6.283185],
    growth: {
      root: stage(0, 0.35, 3, 0.05),
      x: stage(0.8, 0.25, 3, 0.1),
      y: stage(0.2, 0.35, 3, 0.05),
      z: stage(0.6, 0.35, 3, 0.05),
      w: stage(0.4, 0.35, 3, 0.05),
    },
    convergenceDuration: 0.75,
    convergenceFrequency: 5,
    convergenceDamping: 2,
    shrinkDuration: 1.5,
    shrink: {
      root: stage(0, 0.8, 0.8),
      x: stage(0.3, 0.8, 2),
      y: stage(0.4, 0.8, 2),
      z: stage(0, 0.8, 3),
      w: stage(0.5, 0.8, 2),
    },
  },
  carnation_a: {
    baselineScale: 0.8,
    heightMargin: 0,
    growthDuration: 1.5,
    rotationRange: [0, 6.283185],
    growth: {
      root: stage(0, 0.45, 2, 0.05),
      x: stage(0.725, 0.15, 3, 0.3),
      y: stage(0.65, 0.15, 3, 0.3),
      z: stage(0.325, 0.2, 3, 0.25),
      w: stage(0.25, 0.2, 3, 0.25),
    },
    convergenceDuration: 0.75,
    convergenceFrequency: 5,
    convergenceDamping: 2,
    shrinkDuration: 1.5,
    shrink: {
      root: stage(0, 0.8, 0.8),
      x: stage(0.3, 0.8, 2),
      y: stage(0.4, 0.8, 2),
      z: stage(0, 0.8, 3),
      w: stage(0.5, 0.8, 2),
    },
  },
  daffodil_a: {
    baselineScale: 0.65,
    heightMargin: 0.1,
    growthDuration: 1.2,
    rotationRange: [0, 6.283185],
    growth: {
      root: stage(0, 0.4, 1.8, 0.05),
      x: stage(0.75, 0.15, 3, 0.2),
      y: stage(0.7, 0.15, 3, 0.2),
      z: stage(0.65, 0.15, 3, 0.2),
      w: stage(0.2, 0.5, 2, 0.02),
    },
    convergenceDuration: 0.75,
    convergenceFrequency: 2,
    convergenceDamping: 1,
    shrinkDuration: 1.5,
    shrink: {
      root: stage(0, 0.8, 0.8),
      x: stage(0.3, 0.8, 2),
      y: stage(0.4, 0.8, 2),
      z: stage(0, 0.8, 3),
      w: stage(0.5, 0.8, 2),
    },
  },
  succulent_a: {
    baselineScale: 4.5,
    heightMargin: 0.1,
    growthDuration: 1.7,
    rotationRange: [0, 6.283185],
    growth: {
      root: stage(0, 0.5, 2, 0.25),
      x: stage(0.27, 0.35, 2, 0.2),
      y: stage(0.15, 0.4, 2, 0.25),
      z: stage(0.67, 0.15, 3.5, 0.1),
      w: stage(0.55, 0.275, 2.5, 0.15),
    },
    convergenceDuration: 0.75,
    convergenceFrequency: 5,
    convergenceDamping: 2,
    shrinkDuration: 1.5,
    shrink: {
      root: stage(0, 0.8, 0.8),
      x: stage(0.3, 0.8, 2),
      y: stage(0.4, 0.8, 2),
      z: stage(0, 0.8, 3),
      w: stage(0.5, 0.8, 2),
    },
  },
  allium_a: {
    baselineScale: 1.3,
    heightMargin: 0,
    growthDuration: 1.5,
    rotationRange: [0, 6.283185],
    growth: {
      root: stage(0, 0.6, 1.85, 0.1),
      x: stage(0.1, 0.6, 2, 0.05),
      y: stage(0.2, 0.6, 2, 0.05),
      z: stage(0.55, 0.4, 1.7, 0.15),
      w: stage(0.3, 0.6, 2, 0.05),
    },
    convergenceDuration: 0.75,
    convergenceFrequency: 5,
    convergenceDamping: 2,
    shrinkDuration: 1.5,
    shrink: {
      root: stage(0, 0.8, 0.8),
      x: stage(0.3, 0.8, 2),
      y: stage(0.4, 0.8, 2),
      z: stage(0, 0.8, 3),
      w: stage(0.5, 0.8, 2),
    },
  },
  sunflower_a: {
    baselineScale: 3.25,
    heightMargin: 0,
    growthDuration: 1.5,
    rotationRange: [3.926991, 5.183628],
    growth: {
      root: stage(0, 0.8, 1.5, 0.05),
      x: stage(0.15, 0.4, 2, 0.05),
      y: stage(0.6, 0.6, 1.4, 0.1),
      z: stage(0.3, 0.4, 2, 0.05),
      w: stage(0.45, 0.4, 2, 0.05),
    },
    convergenceDuration: 0.75,
    convergenceFrequency: 5,
    convergenceDamping: 2,
    shrinkDuration: 1.5,
    shrink: {
      root: stage(0, 0.8, 0.8),
      x: stage(0.3, 0.8, 2),
      y: stage(0.4, 0.8, 2),
      z: stage(0, 0.8, 3),
      w: stage(0.5, 0.8, 2),
    },
  },
  lavender_a: {
    baselineScale: 0.9,
    heightMargin: 0,
    growthDuration: 1.5,
    rotationRange: [0, 6.283185],
    growth: {
      root: stage(0, 0.4, 1.7, 0.1),
      x: stage(0.56, 0.53, 1.6, 0.05),
      y: stage(0.3, 0.5, 1.6, 0.05),
      z: stage(0.42, 0.5, 1.6, 0.15),
      w: stage(0.7, 0.55, 1.6, 0.05),
    },
    convergenceDuration: 0.75,
    convergenceFrequency: 5,
    convergenceDamping: 2,
    shrinkDuration: 1.5,
    shrink: {
      root: stage(0, 0.8, 0.8),
      x: stage(0.3, 0.8, 2),
      y: stage(0.4, 0.8, 2),
      z: stage(0, 0.8, 3),
      w: stage(0.5, 0.8, 2),
    },
  },
  nasturtium_a: {
    baselineScale: 1.85,
    heightMargin: 0.1,
    growthDuration: 1.5,
    rotationRange: [0, 6.283185],
    growth: {
      root: stage(0, 0.4, 1.7, 0.1),
      x: stage(0.3, 0.5, 1.6),
      y: stage(0.42, 0.5, 1.6),
      z: stage(0.56, 0.53, 1.6),
      w: stage(0.7, 0.55, 1.6, 0.01),
    },
    convergenceDuration: 1.75,
    convergenceFrequency: 5,
    convergenceDamping: 2,
    shrinkDuration: 1.5,
    shrink: {
      root: stage(0, 0.8, 0.8),
      x: stage(0.3, 0.8, 2),
      y: stage(0.4, 0.8, 2),
      z: stage(0, 0.8, 3),
      w: stage(0.5, 0.8, 2),
    },
  },
  rose_a: {
    baselineScale: 0.9,
    heightMargin: 0.1,
    growthDuration: 1.5,
    rotationRange: [0, 6.283185],
    growth: {
      root: stage(0, 0.7, 1.7),
      x: stage(0, 0.5, 1, 0.05),
      y: stage(0.1, 0.5, 1, 0.05),
      z: stage(0.2, 0.5, 1, 0.05),
      w: stage(0.3, 0.5, 1, 0.05),
    },
    convergenceDuration: 2,
    convergenceFrequency: 5,
    convergenceDamping: 2,
    shrinkDuration: 1.5,
    shrink: {
      root: stage(0, 0.8, 0.8),
      x: stage(0.3, 0.8, 2),
      y: stage(0.4, 0.8, 2),
      z: stage(0, 0.8, 3),
      w: stage(0.5, 0.8, 2),
    },
  },
  fir: {
    baselineScale: 0.35,
    heightMargin: 0.05,
    growthDuration: 1.75,
    rotationRange: [0, 6.283185],
    growth: {
      root: stage(0, 0.975, 0.5, 0.05),
      x: stage(0.1, 0.8, 2),
      y: stage(0.2, 0.8, 2),
      z: stage(0.3, 0.8, 2),
      w: stage(0.4, 0.8, 2),
    },
    convergenceDuration: 0.75,
    convergenceFrequency: 5,
    convergenceDamping: 2,
    shrinkDuration: 1.5,
    shrink: {
      root: stage(0, 0.8, 0.8),
      x: stage(0.3, 0.8, 2),
      y: stage(0.4, 0.8, 2),
      z: stage(0, 0.8, 3),
      w: stage(0.5, 0.8, 2),
    },
  },
  cherryblossom: {
    baselineScale: 0.55,
    heightMargin: 0,
    growthDuration: 2.75,
    rotationRange: [0, 6.283185],
    growth: {
      root: stage(0, 0.75, 0.6),
      x: stage(0.06, 0.75, 0.7),
      y: stage(0.13, 0.75, 0.7),
      z: stage(0.38, 0.8, 0.9),
      w: stage(0.41, 0.8, 0.9),
    },
    convergenceDuration: 0.75,
    convergenceFrequency: 5,
    convergenceDamping: 2,
    shrinkDuration: 1.5,
    shrink: {
      root: stage(0, 0.8, 0.8),
      x: stage(0.3, 0.8, 2),
      y: stage(0.4, 0.8, 2),
      z: stage(0, 0.8, 3),
      w: stage(0.5, 0.8, 2),
    },
  },
  sugarpine: {
    baselineScale: 0.6,
    heightMargin: 0.1,
    growthDuration: 1.75,
    rotationRange: [0, 6.283185],
    growth: {
      root: stage(0, 0.95, 0.35, 0.1),
      x: stage(0.65, 0.65, 2.25, 0.05),
      y: stage(0.5, 0.6, 2.25, 0.05),
      z: stage(0.35, 0.35, 2.25, 0.1),
      w: stage(0.2, 0.3, 2.5, 0.1),
    },
    convergenceDuration: 0.75,
    convergenceFrequency: 5,
    convergenceDamping: 2,
    shrinkDuration: 1.5,
    shrink: {
      root: stage(0, 0.8, 0.8),
      x: stage(0.3, 0.8, 2),
      y: stage(0.4, 0.8, 2),
      z: stage(0, 0.8, 3),
      w: stage(0.5, 0.8, 2),
    },
  },
  oak: {
    baselineScale: 0.55,
    heightMargin: 0.05,
    growthDuration: 1.75,
    rotationRange: [0, 6.283185],
    growth: {
      root: stage(0, 0.9, 0.7),
      x: stage(0.04, 0.85, 0.7),
      y: stage(0.14, 0.85, 1),
      z: stage(0.24, 0.85, 1),
      w: stage(0.24, 0.95, 1.2),
    },
    convergenceDuration: 0.75,
    convergenceFrequency: 5,
    convergenceDamping: 2,
    shrinkDuration: 1.5,
    shrink: {
      root: stage(0, 0.8, 0.8),
      x: stage(0.3, 0.8, 2),
      y: stage(0.4, 0.8, 2),
      z: stage(0, 0.8, 3),
      w: stage(0.5, 0.8, 2),
    },
  },
} satisfies Record<string, GrowthProfile>;

export type GrowthProfileId = keyof typeof GROWTH_PROFILES;
