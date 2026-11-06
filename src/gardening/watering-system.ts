/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Watering (legacy WateringSystem). The can rides the right hand; holding the
 * trigger pours a blue arc (v0 = 4.5 m/s) from the spout. Grown plants inside
 * the splash radius (0.02 + 0.5 x drawn portion) grow 0.4x per second.
 * Splash puffs and droplets mark where the water lands.
 */

import { toolMount } from '../core/hands.js';
import {
  AdditiveBlending,
  AssetManager,
  BufferAttribute,
  BufferGeometry,
  Color,
  Object3D,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
  batch,
  createSystem,
  type Entity,
  type Mesh,
  type MeshStandardMaterial,
} from '@iwsdk/core';
import { Plant, PlantStage } from '../components/garden.js';
import { RAY_STYLES, RayTube, castArc, createArcResult } from '../core/arc.js';
import { audio, type LoopHandle } from '../core/audio.js';
import { Layer, collisionWorld } from '../core/colliders.js';
import { haptic, rayBusy, selectHeld } from '../core/input.js';
import { Tool, isToolLive, markGardenDirty, showToast, timePreset } from '../core/state.js';
import { PlantSystem, waterPlant } from './plant-system.js';
import { finishOn, onFinishChange, record } from './progress.js';
import { BURST_STYLES, bursts } from '../core/bursts.js';
import { uiBloom, uiPerk } from '../core/ui-sounds.js';
import { toolEnvMap } from '../world/island-state.js';
import type { CubeTexture } from '@iwsdk/core';

const SPEED = 4.5;
const CAN_OFFSET = {
  // Legacy PROP_TRANSFORM_OFFSET.WATERING_CAN, calibrated against the glove's
  // WATERING pose so the handle sits in the grip.
  position: new Vector3(0.010108, -0.254573, 0.091874),
  quaternion: new Quaternion(-0.30399, -0.53216, 0.37013, 0.69814),
  scale: 0.6,
};
const DROPS = 48;

const tmpTop = new Vector3();

export class WateringSystem extends createSystem({}) {
  private can = new Object3D();
  private spout: Object3D | null = null;
  private loaded = false;
  private arc = createArcResult();
  private tube = new RayTube(20, RAY_STYLES.water);
  private origin = new Vector3();
  private dir = new Vector3();
  private owners = new Set<unknown>();
  private waterLoop: LoopHandle | null = null;
  private growthLoops: LoopHandle[] = [];
  private pulseTimer = 0;
  private splashTimer = 0;
  private trailTimer = 0;
  private drops!: Points;
  private dropT = new Float32Array(DROPS);
  private dropJitter = new Float32Array(DROPS * 3);
  private dropPositions = new Float32Array(DROPS * 3);
  private tmp = new Vector3();

  override init(): void {
    this.can.name = 'watering-can';
    this.can.position.copy(CAN_OFFSET.position);
    this.can.quaternion.copy(CAN_OFFSET.quaternion);
    this.can.scale.setScalar(CAN_OFFSET.scale);
    this.can.visible = false;
    toolMount(this.world, 'right').add(this.can);
    this.scene.add(this.tube);

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.dropPositions, 3));
    this.drops = new Points(
      geometry,
      new PointsMaterial({
        color: new Color(0x9fd0ff),
        size: 0.026,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.drops.frustumCulled = false;
    this.drops.visible = false;
    for (let i = 0; i < DROPS; i++) {
      this.dropT[i] = i / DROPS;
      this.dropJitter[i * 3] = (Math.random() - 0.5) * 2;
      this.dropJitter[i * 3 + 1] = (Math.random() - 0.5) * 2;
      this.dropJitter[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }
    this.scene.add(this.drops);
  }

  private load(): boolean {
    const gltf = AssetManager.getGLTF('watering-can');
    if (!gltf) return false;
    gltf.scene.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      const material = (mesh.material as MeshStandardMaterial).clone();
      material.metalness = 1;
      material.roughness = 0.4;
      // Goal rewards re-finish the can (copper, then gold).
      const baseColor = material.color.clone();
      const finish = () => {
        if (finishOn('meadow')) material.color.setRGB(1, 0.78, 0.34);
        else if (finishOn('earlybird')) material.color.setRGB(0.55, 0.8, 1);
        else if (finishOn('variety')) material.color.setRGB(0.95, 0.55, 0.36);
        else material.color.copy(baseColor);
      };
      finish();
      this.cleanupFuncs.push(onFinishChange(finish));
      // Legacy: the can reflects the cloud cube map.
      const apply = (map: CubeTexture | null) => {
        material.envMap = map;
        material.needsUpdate = true;
      };
      apply(toolEnvMap.peek());
      this.cleanupFuncs.push(toolEnvMap.subscribe(apply));
      mesh.material = material;
    });
    this.can.add(gltf.scene);
    this.spout = gltf.scene.getObjectByName('water_origin') ?? null;
    // Legacy art fix: the spout empty points sideways.
    this.spout?.rotateY(-Math.PI / 2);
    this.loaded = true;
    return true;
  }

  override update(delta: number): void {
    if (!this.loaded && !this.load()) return;
    const live = isToolLive(Tool.Water);
    this.can.visible = live;
    const pouring = live && !rayBusy(this.world) && selectHeld(this.world, 'right');
    if (!pouring) {
      this.stopPouring();
      return;
    }
    if (this.spout) {
      this.spout.getWorldPosition(this.origin);
      this.spout.getWorldDirection(this.dir);
    } else {
      this.world.player.gripSpaces.right.getWorldPosition(this.origin);
      this.dir.set(0, 0, -1).applyQuaternion(this.world.player.gripSpaces.right.quaternion);
    }
    castArc(this.origin, this.dir, SPEED, Layer.Obstacle, this.arc);
    this.tube.update(this.arc.points, this.arc.count, this.arc.portion);
    this.animateDrops(delta);

    this.owners.clear();
    if (this.arc.hit) {
      // Golden and dew-blue cans leave a sparkle where the water lands.
      this.trailTimer -= delta;
      if (this.trailTimer <= 0 && (finishOn('meadow') || finishOn('earlybird'))) {
        this.trailTimer = 0.35;
        bursts.emit(this.arc.hitInfo.point, finishOn('meadow') ? BURST_STYLES.gold : BURST_STYLES.dew);
      }
      const radius = 0.02 + 0.5 * this.arc.portion;
      collisionWorld.sphereOwners(this.arc.hitInfo.point, radius, Layer.Plant, this.owners);
    }

    let wateredAny = false;
    let revived = 0;
    let maxed = 0;
    const plants = this.world.getSystem(PlantSystem);
    // Batched: each record() updates stats, and every stats listener
    // (settings, seedbox, finishes) should re-render once, not per plant.
    batch(() => {
      for (const owner of this.owners) {
        const entity = owner as Entity;
        if (!entity?.hasComponent?.(Plant)) continue;
        if (entity.getValue(Plant, 'stage') !== PlantStage.Grown) continue;
        wateredAny = true;
        const before = entity.getValue(Plant, 'growth') ?? 1;
        const beforeThirst = entity.getValue(Plant, 'thirst') ?? 0;
        // Clamped so a frame stall never jumps growth.
        const event = waterPlant(entity, Math.min(delta, 1 / 20));
        if (event !== 'none' || before !== entity.getValue(Plant, 'growth') || beforeThirst > 0) {
          plants?.writeInstance(entity, true);
          markGardenDirty();
        }
        if (event !== 'none') {
          // Perked up, or reached full size: a burst on each plant...
          tmpTop.copy(entity.object3D!.position);
          tmpTop.y += 0.3 * (entity.getValue(Plant, 'growth') ?? 1);
          bursts.emit(tmpTop, BURST_STYLES.bloom);
          record('watered', tmpTop);
          record(event === 'maxed' ? 'maxed' : 'revived', tmpTop);
          if (timePreset.peek() === 'morning') record('morningCared', tmpTop);
          else if (timePreset.peek() === 'sunset') record('sunsetCared', tmpTop);
          if (event === 'maxed') maxed++;
          else revived++;
        }
      }
    });
    // ...but one sound, haptic and toast per frame, however many plants a
    // splash reaches (each toast re-lays out its panel).
    if (maxed > 0) {
      uiBloom(0.06);
      showToast(
        'Fully grown',
        maxed === 1 ? 'This plant has reached its full size' : `${maxed} plants reached their full size`,
      );
    } else if (revived > 0) {
      uiPerk();
      showToast(
        'Refreshed',
        revived === 1 ? 'Your plant perked right up' : `${revived} plants perked right up`,
        '#5aa7ff',
      );
    }
    if (maxed + revived > 0) haptic(this.world, 'right', 0.5, 60);

    // Splash puffs where the water lands.
    this.splashTimer -= delta;
    if (this.arc.hit && this.splashTimer <= 0) {
      this.splashTimer = 0.28;
      bursts.emit(this.arc.hitInfo.point, BURST_STYLES.splash);
    }

    const at = this.arc.hit ? this.arc.hitInfo.point : this.origin;
    if (!this.waterLoop) {
      this.waterLoop = audio.loop(wateredAny ? 'WATERING_SEED_LOOP' : 'WATERING_GROUND_LOOP', at, 500);
      haptic(this.world, 'right', 0.1, 120);
    } else {
      this.waterLoop.setPosition(at);
      this.waterLoop.swap(wateredAny ? 'WATERING_SEED_LOOP' : 'WATERING_GROUND_LOOP', 500);
    }
    if (wateredAny && this.growthLoops.length === 0) {
      for (const id of ['PLANT_GROWTH_LOOP', 'PLANT_GROWTH_LOOP_02'] as const) {
        const loop = audio.loop(id, at, 300);
        if (loop) this.growthLoops.push(loop);
      }
    } else if (!wateredAny && this.growthLoops.length > 0) {
      this.growthLoops.forEach((loop) => loop.stop(300));
      this.growthLoops = [];
    }
    this.growthLoops.forEach((loop) => loop.setPosition(at));

    // Gentle continuous rumble while pouring (legacy 0.1 vibration).
    this.pulseTimer -= delta;
    if (this.pulseTimer <= 0) {
      this.pulseTimer = 0.1;
      haptic(this.world, 'right', wateredAny ? 0.18 : 0.1, 110);
    }
  }

  private animateDrops(delta: number): void {
    const points = this.arc.points;
    const count = this.arc.count;
    if (count < 2) return;
    this.drops.visible = true;
    for (let i = 0; i < DROPS; i++) {
      this.dropT[i] = (this.dropT[i] + delta * 1.6) % 1;
      const f = this.dropT[i] * (count - 1);
      const k = Math.min(Math.floor(f), count - 2);
      this.tmp.lerpVectors(points[k], points[k + 1], f - k);
      const spread = 0.01 + this.dropT[i] * 0.06;
      this.dropPositions[i * 3] = this.tmp.x + this.dropJitter[i * 3] * spread;
      this.dropPositions[i * 3 + 1] = this.tmp.y + this.dropJitter[i * 3 + 1] * spread;
      this.dropPositions[i * 3 + 2] = this.tmp.z + this.dropJitter[i * 3 + 2] * spread;
    }
    this.drops.geometry.attributes.position.needsUpdate = true;
  }

  private stopPouring(): void {
    this.tube.visible = false;
    this.drops.visible = false;
    if (this.waterLoop) {
      this.waterLoop.stop(300);
      this.waterLoop = null;
    }
    if (this.growthLoops.length) {
      this.growthLoops.forEach((loop) => loop.stop(300));
      this.growthLoops = [];
    }
  }
}
