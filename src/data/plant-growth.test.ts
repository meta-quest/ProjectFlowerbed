/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { GROWTH_KEYS, GROWTH_PROFILES, type GrowthProfile, type SpringStage } from './plant-growth.js';

const TAU = Math.PI * 2;
const profiles = Object.entries(GROWTH_PROFILES) as [string, GrowthProfile][];

function expectSaneStage(stage: SpringStage, label: string): void {
  // Delays are fractions of the stage duration: each key must start before it ends.
  expect(stage.delay, `${label}.delay`).toBeGreaterThanOrEqual(0);
  expect(stage.delay, `${label}.delay`).toBeLessThan(1);
  expect(stage.damping, `${label}.damping`).toBeGreaterThan(0);
  expect(stage.damping, `${label}.damping`).toBeLessThanOrEqual(1);
  expect(stage.frequency, `${label}.frequency`).toBeGreaterThan(0);
  expect(stage.frequency, `${label}.frequency`).toBeLessThanOrEqual(10);
  expect(stage.margin, `${label}.margin`).toBeGreaterThanOrEqual(0);
  expect(stage.margin, `${label}.margin`).toBeLessThan(0.5);
}

it('animates the root plus the four art-defined segments, with a default profile', () => {
  expect(GROWTH_KEYS).toEqual(['root', 'x', 'y', 'z', 'w']);
  expect(GROWTH_PROFILES.default).toBeDefined();
});

it('defines every growth and shrink key of every profile with sane spring values', () => {
  for (const [id, profile] of profiles) {
    expect(Object.keys(profile.growth).sort(), id).toEqual([...GROWTH_KEYS].sort());
    expect(Object.keys(profile.shrink).sort(), id).toEqual([...GROWTH_KEYS].sort());
    for (const key of GROWTH_KEYS) {
      expectSaneStage(profile.growth[key], `${id}.growth.${key}`);
      expectSaneStage(profile.shrink[key], `${id}.shrink.${key}`);
    }
  }
});

it('gives every profile positive scales, durations and convergence values', () => {
  for (const [id, profile] of profiles) {
    expect(profile.baselineScale, id).toBeGreaterThan(0);
    expect(profile.baselineScale, id).toBeLessThan(10);
    expect(profile.heightMargin, id).toBeGreaterThanOrEqual(0);
    expect(profile.heightMargin, id).toBeLessThan(0.5);
    for (const value of [
      profile.growthDuration,
      profile.shrinkDuration,
      profile.convergenceDuration,
      profile.convergenceFrequency,
      profile.convergenceDamping,
    ]) {
      expect(value, id).toBeGreaterThan(0);
      expect(Number.isFinite(value), id).toBe(true);
    }
  }
});

it('keeps every yaw range within one turn', () => {
  for (const [id, profile] of profiles) {
    const [min, max] = profile.rotationRange;
    expect(min, id).toBeGreaterThanOrEqual(0);
    expect(max, id).toBeLessThanOrEqual(TAU + 1e-5);
    expect(min, id).toBeLessThanOrEqual(max);
  }
});
