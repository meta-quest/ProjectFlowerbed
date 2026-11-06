/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { seededRandom } from '../test-utils/random.js';
import { WATER_AREAS, distanceToShore, isInArea, randomPointInArea, type WaterArea } from './water-areas.js';

const SEGMENT = 0.25;
const AREAS = Object.entries(WATER_AREAS) as [string, WaterArea][];
const layers = (area: WaterArea) => area.spans.length / 2;
/** Midpoint of the span at a given layer, plus that layer's b coordinate. */
const middleOf = (area: WaterArea, layer: number): [number, number] => [
  (area.spans[layer * 2] + area.spans[layer * 2 + 1]) / 2,
  area.yStart + layer * SEGMENT,
];

afterEach(() => vi.restoreAllMocks());

describe('WATER_AREAS tables', () => {
  it('cover the legacy sampled extents', () => {
    // River: 102 layers, z from -13.5 to 11.75, as in the 2022 waterBoundsCheckUtils.js.
    expect(layers(WATER_AREAS.river)).toBe(102);
    // Pond: 96 layers (x up to 19.25), as in the 2022 table.
    expect(layers(WATER_AREAS.pond)).toBe(96);
    expect(WATER_AREAS.river).toMatchObject({ vertical: true, yStart: -13.5 });
    expect(WATER_AREAS.pond).toMatchObject({ vertical: false, yStart: -4.5 });
  });

  it('store well-formed spans (finite, x0 < x1)', () => {
    for (const [name, area] of AREAS) {
      expect(area.spans.length % 2, name).toBe(0);
      for (let i = 0; i < layers(area); i++) {
        expect(Number.isFinite(area.spans[i * 2]), `${name} ${i}`).toBe(true);
        expect(area.spans[i * 2], `${name} ${i}`).toBeLessThan(area.spans[i * 2 + 1]);
      }
    }
  });
});

describe('isInArea', () => {
  it('accepts the middle of every segment of both areas', () => {
    for (const [name, area] of AREAS) {
      for (let layer = 0; layer < layers(area) - 1; layer++) {
        const [a, b] = middleOf(area, layer);
        expect(isInArea(a, b + 0.01, area), `${name} ${layer}`).toBe(true);
      }
    }
  });

  it('rejects points beside a span, before the first or past the last sampled layer', () => {
    const pond = WATER_AREAS.pond;
    const [, b] = middleOf(pond, 10);
    expect(isInArea(pond.spans[20] - 0.5, b, pond)).toBe(false);
    expect(isInArea(pond.spans[21] + 0.5, b, pond)).toBe(false);
    const area = WATER_AREAS.river;
    const [a] = middleOf(area, 0);
    expect(isInArea(a, area.yStart - 0.01, area)).toBe(false);
    const last = area.yStart + (layers(area) - 1) * SEGMENT;
    expect(isInArea(a, last, area)).toBe(false);
    expect(isInArea(a, last + 10, area)).toBe(false);
  });

  it('interpolates the shoreline between layers', () => {
    const area = WATER_AREAS.pond;
    // Layer 0 spans 22.873..25.142, layer 1 spans 22.402..25.679.
    const b = area.yStart + SEGMENT / 2;
    const lower = (area.spans[0] + area.spans[2]) / 2;
    expect(isInArea(lower + 0.01, b, area)).toBe(true);
    expect(isInArea(lower - 0.01, b, area)).toBe(false);
  });

  it('places the pond and river where the island has them', () => {
    // Pond samples a = world z, b = world x.
    expect(isInArea(25, 10, WATER_AREAS.pond)).toBe(true);
    expect(isInArea(27, 10, WATER_AREAS.pond)).toBe(false);
    expect(isInArea(23.5, 0, WATER_AREAS.pond)).toBe(true);
    // River samples a = world x, b = world z.
    expect(isInArea(-47, 0, WATER_AREAS.river)).toBe(true);
    expect(isInArea(0, 0, WATER_AREAS.river)).toBe(false);
  });
});

describe('randomPointInArea', () => {
  it('always returns a point inside the area, over its whole length', () => {
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
    const out: [number, number] = [0, 0];
    for (const [name, area] of AREAS) {
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < 2000; i++) {
        randomPointInArea(area, out);
        expect(isInArea(out[0], out[1], area), `${name} sample ${i}: ${out.join(', ')}`).toBe(true);
        min = Math.min(min, out[1]);
        max = Math.max(max, out[1]);
      }
      const end = area.yStart + (layers(area) - 1) * SEGMENT;
      expect(min, name).toBeLessThan(area.yStart + 1);
      expect(max, name).toBeGreaterThan(end - 1);
    }
  });
});

describe('distanceToShore', () => {
  it('is zero outside the water', () => {
    expect(distanceToShore(0, 0, 1, 1, WATER_AREAS.river)).toBe(0);
    expect(distanceToShore(0, 0, -1, -1, WATER_AREAS.pond)).toBe(0);
  });

  it('is positive and bounded by the local width inside both areas', () => {
    for (const [name, area] of AREAS) {
      for (let layer = 4; layer < layers(area) - 4; layer += 7) {
        const [a, b] = middleOf(area, layer);
        const width = area.spans[layer * 2 + 1] - area.spans[layer * 2];
        for (const [da, db] of [
          [1, 1],
          [-1, 1],
          [1, -1],
          [-1, -1],
        ]) {
          const d = distanceToShore(a, b + 0.01, da, db, area);
          expect(d, `${name} ${layer}`).toBeGreaterThan(0);
          expect(d, `${name} ${layer}`).toBeLessThanOrEqual(width);
        }
      }
    }
  });

  it('shrinks as a swimmer nears the bank on its a-side', () => {
    const area = WATER_AREAS.pond;
    const layer = 40;
    const [mid, b] = middleOf(area, layer);
    const x0 = area.spans[layer * 2];
    // Legacy convention: da > 0 measures to the x0 bank (FaunaSystem passes -fa).
    const far = distanceToShore(mid, b + 0.01, 1, 1, area);
    const near = distanceToShore(x0 + 0.05, b + 0.01, 1, 1, area);
    expect(near).toBeLessThan(far);
    expect(near).toBeLessThanOrEqual(0.06);
  });
});
