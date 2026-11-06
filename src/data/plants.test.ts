/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { GROWTH_PROFILES } from './plant-growth.js';
import { PAGE_COUNT, PLANTS, PLANT_INDEX, SLOTS_PER_PAGE } from './plants.js';

describe('PLANTS catalog', () => {
  it('has the 32 legacy varieties with unique ids, labels, models and packets', () => {
    expect(PLANTS).toHaveLength(32);
    for (const key of ['id', 'label', 'model', 'packet'] as const) {
      const values = PLANTS.map((plant) => plant[key]);
      expect(new Set(values).size, `duplicate ${key}`).toBe(values.length);
    }
  });

  it('gives every flower a display name instead of the "Species A" fallback', () => {
    for (const plant of PLANTS) expect(plant.label).not.toMatch(/ [A-D]$/);
  });

  it('uses valid #rrggbb accents', () => {
    for (const plant of PLANTS) expect(plant.accent).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('follows the asset naming convention for flowers and trees', () => {
    for (const plant of PLANTS) {
      if (plant.model.startsWith('Tree_')) {
        expect(plant.packet).toBe(`Prop_Packet_${plant.model.slice('Tree_'.length)}`);
      } else {
        expect(plant.model).toMatch(/^Flora_[A-Za-z]+_[A-D]$/);
        expect(plant.packet).toBe(plant.model.replace(/^Flora_/, 'Prop_SeedPacket_'));
      }
    }
  });
});

describe('growth profiles', () => {
  it('resolve for every plant without falling back to default', () => {
    for (const plant of PLANTS) {
      expect(Object.keys(GROWTH_PROFILES), plant.id).toContain(plant.growth);
      expect(plant.growth).not.toBe('default');
    }
  });

  it('are shared by the variants of one species', () => {
    const bySpecies = new Map<string, Set<string>>();
    for (const plant of PLANTS) {
      const set = bySpecies.get(plant.species) ?? new Set();
      set.add(plant.growth);
      bySpecies.set(plant.species, set);
    }
    for (const [species, profiles] of bySpecies) expect(profiles.size, species).toBe(1);
  });

  it('are all used by some plant (no dead profiles besides default)', () => {
    const used = new Set(PLANTS.map((plant) => plant.growth));
    const unused = Object.keys(GROWTH_PROFILES).filter((id) => id !== 'default' && !used.has(id as never));
    expect(unused).toEqual([]);
  });
});

describe('PLANT_INDEX', () => {
  it('maps every id to its position in PLANTS and nothing else', () => {
    expect(PLANT_INDEX.size).toBe(PLANTS.length);
    PLANTS.forEach((plant, index) => expect(PLANT_INDEX.get(plant.id)).toBe(index));
    expect(PLANT_INDEX.get('dandelion')).toBeUndefined();
  });
});

describe('seedbox pages', () => {
  it('fit the catalog into pages of nine', () => {
    expect(SLOTS_PER_PAGE).toBe(9);
    expect(PAGE_COUNT).toBe(4);
    expect((PAGE_COUNT - 1) * SLOTS_PER_PAGE).toBeLessThan(PLANTS.length);
    expect(PAGE_COUNT * SLOTS_PER_PAGE).toBeGreaterThanOrEqual(PLANTS.length);
  });

  it('keep each species on a single page', () => {
    const pageOf = new Map<string, number>();
    PLANTS.forEach((plant, index) => {
      const page = Math.floor(index / SLOTS_PER_PAGE);
      expect(pageOf.get(plant.species) ?? page, plant.species).toBe(page);
      pageOf.set(plant.species, page);
    });
  });
});
