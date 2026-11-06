/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Plant lifecycle: PD-spring growth, steady state, and shrink-to-remove.
 *
 * Growth follows the legacy PlantGrowingSystem exactly: each of the five keys
 * (root plus four segments) is a semi-implicit PD spring that starts after a
 * per-key delay, then blends its frequency/damping toward the convergence
 * values over the convergence window. Shrinking runs the same springs toward
 * zero and removes the plant after `shrinkDuration`.
 */

import {
  Color,
  CylinderGeometry,
  Mesh as ThreeMesh,
  Matrix4,
  Quaternion,
  Vector3,
  Vector4,
  createSystem,
  type Entity,
  type World,
} from '@iwsdk/core';
import { Plant, PlantStage } from '../components/garden.js';
import { Layer, collisionWorld } from '../core/colliders.js';
import { markGardenDirty, plantCount } from '../core/state.js';
import type { SavedPlant } from '../core/storage.js';
import { GROWTH_KEYS, GROWTH_PROFILES, type GrowthProfile } from '../data/plant-growth.js';
import { PLANTS, PLANT_INDEX } from '../data/plants.js';
import { requestShadowUpdate } from '../world/island-state.js';
import { plantMeshes, plantTime } from './plant-meshes.js';
import { BURST_STYLES, bursts } from '../core/bursts.js';
import { uiBloom } from '../core/ui-sounds.js';
import type { Mesh, Object3D } from '@iwsdk/core';

const KEYS = GROWTH_KEYS.length;

interface Springs {
  value: Float32Array;
  speed: Float32Array;
  target: Float32Array;
  /** Root scale captured when shrinking starts. */
  shrinkFrom: number;
}

interface PlantRuntime {
  blob: number;
  springs: Springs;
  collider: Mesh | null;
  /** Legacy "tiny collider": a 0.1 m x 0.5 m cylinder at the stem. */
  stem: Mesh;
  plantId: string;
  slot: number;
}

/** Semi-implicit PD step (legacy utils/pdAccelerations.js applyPDScalar). */
function pdStep(springs: Springs, i: number, frequency: number, damping: number, dt: number): void {
  const x = springs.value[i];
  const v = springs.speed[i];
  const ks = 36 * frequency * frequency;
  const kd = 9 * frequency * damping;
  const s = 1 / (1 + kd * dt + ks * dt * dt);
  const accel = ks * s * (springs.target[i] - x) + (kd + ks * dt) * s * (0 - v);
  const nv = v + accel * dt;
  springs.speed[i] = nv;
  springs.value[i] = x + nv * dt;
}

export function profileFor(plantId: string): GrowthProfile {
  const index = PLANT_INDEX.get(plantId);
  const key = index == null ? 'default' : PLANTS[index].growth;
  return (GROWTH_PROFILES as Record<string, GrowthProfile>)[key] ?? GROWTH_PROFILES.default;
}

const runtime = new Map<number, PlantRuntime>();
let worldRef: World | null = null;

/** Plant a new seed (growing) or restore a saved plant (grown). */
export function spawnPlant(world: World, plantId: string, position: Vector3, saved?: SavedPlant): Entity {
  const profile = profileFor(plantId);
  const entity = world.createTransformEntity();
  const object = entity.object3D!;
  object.name = `plant:${plantId}`;
  object.position.copy(position);
  const [minY, maxY] = profile.rotationRange;
  object.rotation.y = saved ? saved.yaw : minY + (maxY - minY) * Math.random();
  object.visible = false; // Rendered through the instanced pool.

  const base = saved
    ? saved.scale
    : ([
        profile.baselineScale,
        profile.baselineScale * (1 - profile.heightMargin + Math.random() * 2 * profile.heightMargin),
        profile.baselineScale,
      ] as [number, number, number]);

  entity.addComponent(Plant, {
    plantId,
    stage: saved ? PlantStage.Grown : PlantStage.Growing,
    growth: saved?.growth ?? 1,
    thirst: saved?.thirst ?? 0,
  });
  entity.getVectorView(Plant, 'baseScale').set(base);
  const segments = entity.getVectorView(Plant, 'segments');
  if (saved) segments.set(saved.segments);
  else segments.set([0, 0, 0, 0]);
  entity.setValue(Plant, 'rootScale', saved ? 1 : 0);
  // PlantSystem drew the plant when its query matched, inside addComponent and
  // before the scale and segments above were set. A growing plant is redrawn
  // every frame anyway; a restored one would keep scale 1 (a sunflower at a
  // third of its size) until something changed, so draw it again now.
  world.getSystem(PlantSystem)?.writeInstance(entity, true);
  return entity;
}

/** Seconds for a freshly watered plant to become fully thirsty. */
export const THIRST_SECONDS = 15 * 60;
const DROOP = 0.14;
/** Growth ceiling from watering, approached with easing. */
export const MAX_GROWTH = 2.5;
const GROW_RATE = 0.45;

export type WaterEvent = 'none' | 'refreshed' | 'maxed';

/**
 * Water a grown plant for `dt` seconds: quench thirst quickly, and grow it
 * toward MAX_GROWTH, slowing as it approaches the ceiling.
 */
export function waterPlant(entity: Entity, dt: number): WaterEvent {
  let event: WaterEvent = 'none';
  const thirst = entity.getValue(Plant, 'thirst') ?? 0;
  if (thirst > 0) {
    const next = Math.max(0, thirst - dt * 1.2);
    entity.setValue(Plant, 'thirst', next);
    if (thirst > 0.25 && next === 0) event = 'refreshed';
  }
  const growth = entity.getValue(Plant, 'growth') ?? 1;
  if (growth < MAX_GROWTH) {
    const room = (MAX_GROWTH - growth) / (MAX_GROWTH - 1);
    const next = Math.min(MAX_GROWTH, growth + dt * GROW_RATE * Math.max(0.12, Math.sqrt(room)));
    entity.setValue(Plant, 'growth', next >= MAX_GROWTH - 0.005 ? MAX_GROWTH : next);
    if (next >= MAX_GROWTH - 0.005) event = 'maxed';
  }
  return event;
}

/** Start the shrink-and-remove animation (Remove tool). */
export function removePlant(entity: Entity): boolean {
  if (!entity.hasComponent(Plant)) return false;
  if (entity.getValue(Plant, 'stage') !== PlantStage.Grown) return false;
  const state = runtime.get(entity.index);
  if (!state) return false;
  entity.setValue(Plant, 'stage', PlantStage.Shrinking);
  entity.setValue(Plant, 'timer', 0);
  entity.setValue(Plant, 'highlighted', false);
  const springs = state.springs;
  springs.shrinkFrom = entity.getValue(Plant, 'rootScale') ?? 1;
  bursts.emit(entity.object3D!.position, BURST_STYLES.poof);
  bursts.emit(entity.object3D!.position, BURST_STYLES.soil);
  // Shrink from rest, as the legacy PlantShrinkingSystem did.
  springs.value.fill(1);
  springs.speed.fill(0);
  springs.target.fill(0);
  // Remove the collider immediately so it cannot be picked twice.
  if (state.collider) {
    collisionWorld.remove(state.collider);
    state.collider = null;
  }
  collisionWorld.remove(state.stem);
  return true;
}

/** Snapshot every grown plant for saving. */
export function serializePlants(_world: World, entities: Iterable<Entity>): SavedPlant[] {
  const out: SavedPlant[] = [];
  for (const entity of entities) {
    if (entity.getValue(Plant, 'stage') !== PlantStage.Grown) continue;
    const object = entity.object3D!;
    const base = entity.getVectorView(Plant, 'baseScale');
    const seg = entity.getVectorView(Plant, 'segments');
    out.push({
      type: entity.getValue(Plant, 'plantId') ?? 'sugarpine',
      position: [object.position.x, object.position.y, object.position.z],
      yaw: object.rotation.y,
      scale: [base[0], base[1], base[2]],
      growth: entity.getValue(Plant, 'growth') ?? 1,
      segments: [seg[0], seg[1], seg[2], seg[3]],
      thirst: entity.getValue(Plant, 'thirst') ?? 0,
    });
  }
  return out;
}

export function plantRuntimeWorld(): World | null {
  return worldRef;
}

export class PlantSystem extends createSystem({
  plants: { required: [Plant] },
}) {
  private matrix = new Matrix4();
  private thirstClock = 0;
  private colliderMatrix = new Matrix4();
  private quat = new Quaternion();
  private scale = new Vector3();
  private seg = new Vector4();
  /** Legacy Remove-tool emissive 0x660000, as a linear color. */
  private highlight = new Color(0.4, 0, 0);

  override init(): void {
    worldRef = this.world;
    plantMeshes.init(this.scene);
    this.cleanupFuncs.push(
      this.queries.plants.subscribe('qualify', (entity) => this.onAdded(entity)),
      this.queries.plants.subscribe('disqualify', (entity) => this.onRemoved(entity)),
    );
  }

  /** Grown plants slowly get thirsty; refresh their look in 1% steps. */
  private ageThirst(seconds: number): void {
    const step = seconds / THIRST_SECONDS;
    for (const entity of this.queries.plants.entities) {
      if (entity.getValue(Plant, 'stage') !== PlantStage.Grown) continue;
      const before = entity.getValue(Plant, 'thirst') ?? 0;
      if (before >= 1) continue;
      const after = Math.min(1, before + step);
      entity.setValue(Plant, 'thirst', after);
      if (Math.floor(after * 100) !== Math.floor(before * 100)) this.writeInstance(entity, false);
    }
  }

  private onAdded(entity: Entity): void {
    const plantId = entity.getValue(Plant, 'plantId') ?? 'sugarpine';
    const variety = plantMeshes.variety(plantId);
    const slot =
      variety?.allocate((moved) => {
        entity.setValue(Plant, 'slot', moved);
        const state = runtime.get(entity.index);
        if (state) state.slot = moved;
      }) ?? -1;
    entity.setValue(Plant, 'slot', slot);
    const springs: Springs = {
      value: new Float32Array(KEYS),
      speed: new Float32Array(KEYS),
      target: new Float32Array(KEYS),
      shrinkFrom: 1,
    };
    const profile = profileFor(plantId);
    GROWTH_KEYS.forEach((key, i) => {
      const margin = profile.growth[key].margin;
      springs.target[i] = 1 - margin + Math.random() * 2 * margin;
    });
    const collider = plantMeshes.makeCollider(plantId);
    const stem = new ThreeMesh(STEM_GEOMETRY);
    stem.matrixAutoUpdate = false;
    stem.position.copy(entity.object3D!.position);
    stem.position.y += 0.25;
    stem.updateMatrix();
    stem.matrixWorld.copy(stem.matrix);
    runtime.set(entity.index, { springs, collider, stem, plantId, slot, blob: plantMeshes.shadows.allocate() });
    if (collider) collisionWorld.add(collider, Layer.Plant, entity);
    collisionWorld.add(stem, Layer.Plant, entity);
    this.writeInstance(entity, true);
    plantCount.value = this.queries.plants.entities.size;
  }

  private onRemoved(entity: Entity): void {
    const state = runtime.get(entity.index);
    if (state?.collider) collisionWorld.remove(state.collider);
    if (state) collisionWorld.remove(state.stem);
    if (state && state.slot >= 0) plantMeshes.variety(state.plantId)?.release(state.slot);
    if (state && state.blob >= 0) plantMeshes.shadows.release(state.blob);
    runtime.delete(entity.index);
    plantCount.value = this.queries.plants.entities.size;
  }

  override update(delta: number): void {
    const dt = Math.min(delta, 1 / 20);
    plantTime.value += dt;
    this.thirstClock += delta;
    if (this.thirstClock >= 1) {
      this.ageThirst(this.thirstClock);
      this.thirstClock = 0;
    }
    let changed = false;
    for (const entity of this.queries.plants.entities) {
      const stage = entity.getValue(Plant, 'stage');
      if (stage === PlantStage.Growing) {
        this.grow(entity, dt);
        changed = true;
      } else if (stage === PlantStage.Shrinking) {
        if (this.shrink(entity, dt)) changed = true;
      }
    }
    if (changed) requestShadowUpdate();
    plantMeshes.update(this.world.camera);
  }

  private grow(entity: Entity, dt: number): void {
    const state = runtime.get(entity.index);
    if (!state) return;
    const profile = profileFor(entity.getValue(Plant, 'plantId') ?? '');
    const t = (entity.getValue(Plant, 'timer') ?? 0) + dt;
    entity.setValue(Plant, 'timer', t);
    const anim = profile.growthDuration;
    const total = anim + profile.convergenceDuration;
    const springs = state.springs;
    for (let i = 0; i < GROWTH_KEYS.length; i++) {
      const stage = profile.growth[GROWTH_KEYS[i]];
      if (t < anim * stage.delay || t >= total) continue;
      let f = stage.frequency;
      let d = stage.damping;
      if (t >= anim) {
        const p = (t - anim) / (total - anim);
        f += (profile.convergenceFrequency - f) * p;
        d += (profile.convergenceDamping - d) * p;
      }
      pdStep(springs, i, f, d, dt);
    }
    this.applySprings(entity, springs, 1);
    if (t >= total) {
      entity.setValue(Plant, 'stage', PlantStage.Grown);
      entity.setValue(Plant, 'timer', 0);
      markGardenDirty();
      // Fully grown: a soft sparkle around the crown.
      tmpBurst.copy(entity.object3D!.position);
      tmpBurst.y += 0.25 * (entity.getVectorView(Plant, 'baseScale')[1] || 1);
      bursts.emit(tmpBurst, BURST_STYLES.bloom);
      uiBloom(0.03);
    }
    this.writeInstance(entity, false);
  }

  /** Returns true when the plant was removed this frame. */
  private shrink(entity: Entity, dt: number): boolean {
    const state = runtime.get(entity.index);
    if (!state) return false;
    const profile = profileFor(entity.getValue(Plant, 'plantId') ?? '');
    const t = (entity.getValue(Plant, 'timer') ?? 0) + dt;
    entity.setValue(Plant, 'timer', t);
    const anim = profile.shrinkDuration;
    const total = anim + profile.convergenceDuration;
    const springs = state.springs;
    for (let i = 0; i < GROWTH_KEYS.length; i++) {
      const stage = profile.shrink[GROWTH_KEYS[i]];
      if (t < anim * stage.delay || t >= total) continue;
      let f = stage.frequency;
      let d = stage.damping;
      if (t >= anim) {
        const p = (t - anim) / (total - anim);
        f += (profile.convergenceFrequency - f) * p;
        d += (profile.convergenceDamping - d) * p;
      }
      pdStep(springs, i, f, d, dt);
    }
    this.applySprings(entity, springs, springs.shrinkFrom);
    this.writeInstance(entity, false);
    if (t >= anim) {
      entity.dispose();
      markGardenDirty();
      return true;
    }
    return false;
  }

  private applySprings(entity: Entity, springs: Springs, rootFrom: number): void {
    entity.setValue(Plant, 'rootScale', Math.max(0, springs.value[0] * rootFrom));
    const seg = entity.getVectorView(Plant, 'segments');
    for (let i = 1; i < KEYS; i++) seg[i - 1] = springs.value[i];
  }

  /** Push the plant's pose and segment values to its instanced mesh. */
  writeInstance(entity: Entity, refreshCollider: boolean): void {
    const plantId = entity.getValue(Plant, 'plantId') ?? '';
    const variety = plantMeshes.variety(plantId);
    const slot = entity.getValue(Plant, 'slot') ?? -1;
    const object = entity.object3D as Object3D;
    const base = entity.getVectorView(Plant, 'baseScale');
    const growth = entity.getValue(Plant, 'growth') ?? 1;
    const root = entity.getValue(Plant, 'rootScale') ?? 1;
    this.quat.setFromAxisAngle(UP, object.rotation.y);
    this.scale.set(base[0], base[1], base[2]).multiplyScalar(root * growth);
    this.matrix.compose(object.position, this.quat, this.scale);
    const seg = entity.getVectorView(Plant, 'segments');
    const thirst = entity.getValue(Plant, 'thirst') ?? 0;
    // Thirsty plants droop their flowers and leaves a little.
    const droop = 1 - DROOP * thirst;
    this.seg.set(seg[0] * droop, seg[1] * droop, seg[2] * droop, seg[3] * droop);
    if (variety && slot >= 0) {
      variety.write(slot, this.matrix, this.seg);
      variety.tint(slot, entity.getValue(Plant, 'highlighted') ? this.highlight : null, thirst);
    }
    const state = runtime.get(entity.index);
    if (state && state.blob >= 0) {
      plantMeshes.shadows.write(state.blob, object.position, plantMeshes.footprint(plantId) * base[0] * root * growth);
    }
    if (refreshCollider) this.updateCollider(entity);
  }

  /** Colliders are full size from the first frame (legacy behavior). */
  updateCollider(entity: Entity): void {
    const state = runtime.get(entity.index);
    if (!state?.collider) return;
    const plantId = entity.getValue(Plant, 'plantId') ?? '';
    const entry = plantMeshes.colliderGeometry.get(plantId);
    const object = entity.object3D as Object3D;
    const base = entity.getVectorView(Plant, 'baseScale');
    const growth = entity.getValue(Plant, 'growth') ?? 1;
    this.quat.setFromAxisAngle(UP, object.rotation.y);
    this.scale.set(base[0], base[1], base[2]).multiplyScalar(growth);
    this.colliderMatrix.compose(object.position, this.quat, this.scale);
    if (entry) this.colliderMatrix.multiply(entry.offset);
    state.collider.matrix.copy(this.colliderMatrix);
    state.collider.matrixWorld.copy(this.colliderMatrix);
    collisionWorld.refresh(state.collider);
  }
}

const UP = new Vector3(0, 1, 0);
const tmpBurst = new Vector3();
const STEM_GEOMETRY = new CylinderGeometry(0.1, 0.1, 0.5, 8);
