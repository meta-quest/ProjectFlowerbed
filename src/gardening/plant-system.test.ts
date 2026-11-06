/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * The pure parts of the plant lifecycle. PlantSystem itself needs a running
 * World (instanced meshes, queries), so these tests drive the exported
 * helpers with a small fake entity that stores component values.
 */

import '../test-utils/canvas.js';
import { Object3D, Vector3, type Entity, type World } from '@iwsdk/core';
import { Plant, PlantStage } from '../components/garden.js';
import type { SavedPlant } from '../core/storage.js';
import { GROWTH_PROFILES } from '../data/plant-growth.js';
import { PLANTS } from '../data/plants.js';
import { seededRandom } from '../test-utils/random.js';
import { MAX_GROWTH, profileFor, removePlant, serializePlants, spawnPlant, waterPlant } from './plant-system.js';

class FakeEntity {
  private static next = 1000;
  readonly index = FakeEntity.next++;
  readonly object3D = new Object3D();
  readonly values = new Map<string, unknown>();
  private readonly vectors = new Map<string, Float32Array>();
  private readonly components = new Set<unknown>();

  addComponent(component: unknown, init: Record<string, unknown> = {}): this {
    this.components.add(component);
    for (const [key, value] of Object.entries(init)) this.values.set(key, value);
    return this;
  }

  hasComponent(component: unknown): boolean {
    return this.components.has(component);
  }

  getValue(_component: unknown, key: string): unknown {
    return this.values.get(key);
  }

  setValue(_component: unknown, key: string, value: unknown): void {
    this.values.set(key, value);
  }

  getVectorView(_component: unknown, key: string): Float32Array {
    let view = this.vectors.get(key);
    if (!view) this.vectors.set(key, (view = new Float32Array(key === 'segments' ? 4 : 3)));
    return view;
  }
}

const asEntity = (fake: FakeEntity) => fake as unknown as Entity;
const fakeWorld = { createTransformEntity: () => new FakeEntity(), getSystem: () => undefined } as unknown as World;

/** A grown plant entity with the given thirst and growth. */
function grownPlant(thirst: number, growth = 1): FakeEntity {
  return new FakeEntity().addComponent(Plant, { plantId: 'rose_a', stage: PlantStage.Grown, thirst, growth });
}

const saved: SavedPlant = {
  type: 'tulip_b',
  position: [1.5, 0.25, -3],
  yaw: 1.25,
  scale: [0.75, 0.8, 0.75],
  growth: 1.75,
  segments: [1, 0.5, 0.25, 1],
  thirst: 0.4,
};

afterEach(() => vi.restoreAllMocks());

describe('profileFor', () => {
  it("returns each plant's own growth profile", () => {
    for (const plant of PLANTS) expect(profileFor(plant.id), plant.id).toBe(GROWTH_PROFILES[plant.growth]);
  });

  it('shares profiles between variants and falls back to default for unknown ids', () => {
    expect(profileFor('rose_d')).toBe(profileFor('rose_a'));
    expect(profileFor('dandelion')).toBe(GROWTH_PROFILES.default);
    expect(profileFor('')).toBe(GROWTH_PROFILES.default);
  });
});

describe('waterPlant', () => {
  it('quenches thirst quickly and reports a revived plant', () => {
    const plant = grownPlant(0.9, MAX_GROWTH);
    expect(waterPlant(asEntity(plant), 0.25)).toBe('none');
    expect(plant.values.get('thirst')).toBeCloseTo(0.6);
    expect(waterPlant(asEntity(plant), 1)).toBe('refreshed');
    expect(plant.values.get('thirst')).toBe(0);
  });

  it('does not celebrate topping up a barely thirsty plant', () => {
    const plant = grownPlant(0.2, MAX_GROWTH);
    expect(waterPlant(asEntity(plant), 1)).toBe('none');
    expect(plant.values.get('thirst')).toBe(0);
  });

  it('grows towards the ceiling, slowing as it approaches', () => {
    const plant = grownPlant(0, 1);
    const steps: number[] = [];
    let last = 1;
    for (let i = 0; i < 4; i++) {
      waterPlant(asEntity(plant), 0.5);
      const growth = plant.values.get('growth') as number;
      steps.push(growth - last);
      last = growth;
    }
    expect(last).toBeGreaterThan(1);
    expect(last).toBeLessThan(MAX_GROWTH);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
  });

  it('reaches exactly MAX_GROWTH and reports it once', () => {
    const plant = grownPlant(0, 1);
    const events: string[] = [];
    for (let i = 0; i < 200 && plant.values.get('growth') !== MAX_GROWTH; i++)
      events.push(waterPlant(asEntity(plant), 0.1));
    expect(plant.values.get('growth')).toBe(MAX_GROWTH);
    expect(events.filter((e) => e === 'maxed')).toHaveLength(1);
    expect(events.at(-1)).toBe('maxed');
    expect(waterPlant(asEntity(plant), 1)).toBe('none');
  });

  it('takes a few seconds of pouring to fully grow a plant', () => {
    const plant = grownPlant(0, 1);
    let seconds = 0;
    while (plant.values.get('growth') !== MAX_GROWTH && seconds < 60) {
      waterPlant(asEntity(plant), 1 / 72);
      seconds += 1 / 72;
    }
    expect(seconds).toBeGreaterThan(2);
    expect(seconds).toBeLessThan(15);
  });

  it('prefers "maxed" when one pour both revives and maxes a plant', () => {
    const plant = grownPlant(0.3, MAX_GROWTH - 0.001);
    expect(waterPlant(asEntity(plant), 1)).toBe('maxed');
  });

  it('treats missing values as a fresh, unwatered plant', () => {
    const plant = new FakeEntity().addComponent(Plant, {});
    expect(waterPlant(asEntity(plant), 0.1)).toBe('none');
    expect(plant.values.get('growth')).toBeGreaterThan(1);
  });
});

describe('spawnPlant', () => {
  it('plants a new seed as a growing plant from zero size', () => {
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(3));
    const position = new Vector3(2, 0.1, -4);
    const entity = spawnPlant(fakeWorld, 'sunflower_a', position) as unknown as FakeEntity;
    const profile = profileFor('sunflower_a');
    expect(entity.values.get('stage')).toBe(PlantStage.Growing);
    expect(entity.values.get('rootScale')).toBe(0);
    expect([...entity.getVectorView(Plant, 'segments')]).toEqual([0, 0, 0, 0]);
    expect(entity.object3D.position.equals(position)).toBe(true);
    expect(entity.object3D.visible).toBe(false); // drawn by the instanced pool
    const [minYaw, maxYaw] = profile.rotationRange;
    expect(entity.object3D.rotation.y).toBeGreaterThanOrEqual(minYaw);
    expect(entity.object3D.rotation.y).toBeLessThanOrEqual(maxYaw);
  });

  it('randomises only the height of a new plant, within its margin', () => {
    const profile = profileFor('pansy_a');
    for (let i = 0; i < 20; i++) {
      const [x, y, z] = (spawnPlant(fakeWorld, 'pansy_a', new Vector3()) as unknown as FakeEntity).getVectorView(
        Plant,
        'baseScale',
      );
      expect(x).toBeCloseTo(profile.baselineScale, 5);
      expect(z).toBeCloseTo(profile.baselineScale, 5);
      expect(y).toBeGreaterThanOrEqual(profile.baselineScale * (1 - profile.heightMargin) - 1e-5);
      expect(y).toBeLessThanOrEqual(profile.baselineScale * (1 + profile.heightMargin) + 1e-5);
    }
  });

  it('restores a saved plant fully grown with its saved pose and state', () => {
    const entity = spawnPlant(fakeWorld, saved.type, new Vector3(...saved.position), saved) as unknown as FakeEntity;
    expect(entity.values.get('stage')).toBe(PlantStage.Grown);
    expect(entity.values.get('rootScale')).toBe(1);
    expect(entity.values.get('growth')).toBe(saved.growth);
    expect(entity.values.get('thirst')).toBe(saved.thirst);
    expect(entity.object3D.rotation.y).toBe(saved.yaw);
  });

  it('redraws a restored plant once its saved scale and segments are set', () => {
    // The plant query matches inside addComponent, before the saved values
    // land; without this redraw a restored sunflower showed at scale 1 until
    // it was watered, then jumped to its real size.
    const drawn: number[][] = [];
    const world = {
      createTransformEntity: () => new FakeEntity(),
      getSystem: () => ({
        writeInstance: (entity: FakeEntity) => drawn.push([...entity.getVectorView(Plant, 'baseScale')]),
      }),
    } as unknown as World;
    spawnPlant(world, saved.type, new Vector3(...saved.position), saved);
    expect(drawn).toHaveLength(1);
    drawn[0].forEach((value, i) => expect(value).toBeCloseTo(saved.scale[i], 5));
  });

  it('defaults thirst and growth for saves from before watering existed', () => {
    const legacy = { ...saved, thirst: undefined, growth: undefined as unknown as number };
    const entity = spawnPlant(fakeWorld, legacy.type, new Vector3(), legacy) as unknown as FakeEntity;
    expect(entity.values.get('thirst')).toBe(0);
    expect(entity.values.get('growth')).toBe(1);
  });
});

describe('serializePlants', () => {
  it('round-trips a restored plant through a save', () => {
    const entity = spawnPlant(fakeWorld, saved.type, new Vector3(...saved.position), saved);
    const [out] = serializePlants(fakeWorld, [entity]);
    expect(out.type).toBe(saved.type);
    expect(out.yaw).toBe(saved.yaw);
    expect(out.growth).toBe(saved.growth);
    expect(out.thirst).toBe(saved.thirst);
    out.position.forEach((value, i) => expect(value).toBeCloseTo(saved.position[i], 5));
    out.scale.forEach((value, i) => expect(value).toBeCloseTo(saved.scale[i], 5));
    out.segments.forEach((value, i) => expect(value).toBeCloseTo(saved.segments[i], 5));
    expect(JSON.parse(JSON.stringify(out))).toEqual(out); // plain arrays, not typed views
  });

  it('skips plants that are still growing or being removed', () => {
    const growing = spawnPlant(fakeWorld, 'oak', new Vector3());
    const shrinking = spawnPlant(fakeWorld, 'oak', new Vector3(), saved) as unknown as FakeEntity;
    shrinking.setValue(Plant, 'stage', PlantStage.Shrinking);
    const grown = spawnPlant(fakeWorld, 'fir', new Vector3(), { ...saved, type: 'fir' });
    expect(serializePlants(fakeWorld, [growing, asEntity(shrinking), grown]).map((p) => p.type)).toEqual(['fir']);
  });
});

describe('removePlant', () => {
  it('refuses non-plants, plants still growing and plants PlantSystem has not set up', () => {
    expect(removePlant(asEntity(new FakeEntity()))).toBe(false);
    const growing = new FakeEntity().addComponent(Plant, { stage: PlantStage.Growing });
    expect(removePlant(asEntity(growing))).toBe(false);
    expect(growing.values.get('stage')).toBe(PlantStage.Growing);
    const grown = grownPlant(0);
    expect(removePlant(asEntity(grown))).toBe(false);
    expect(grown.values.get('stage')).toBe(PlantStage.Grown);
  });
});
