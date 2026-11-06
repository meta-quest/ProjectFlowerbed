/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Planting (legacy PlantingSystem, PlantingArrowSystem, SeedAnimationSystem).
 *
 * With Seeds live, the selected packet sits in the right hand and a green arc
 * (v0 = 8 m/s) shows where a seed would land. The arc turns red over plants
 * or non-plantable ground and during the 1 s cooldown. Releasing the trigger
 * (or pinching, with a tracked hand) throws a seed along the arc at 10 m/s;
 * where it lands, a plant grows.
 */

import { handTracked, toolMount } from '../core/hands.js';
import {
  AssetManager,
  CatmullRomCurve3,
  Color,
  createSystem,
  DoubleSide,
  Euler,
  Matrix4,
  Mesh,
  MeshPhongMaterial,
  Object3D,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Entity,
} from '@iwsdk/core';
import { Seed } from '../components/garden.js';
import { RAY_STYLES, RayTube, castArc, createArcResult } from '../core/arc.js';
import { audio } from '../core/audio.js';
import { Layer } from '../core/colliders.js';
import { haptic, rayBusy, rayPose, selectDown, selectUp } from '../core/input.js';
import { TargetMarker } from '../core/marker.js';
import { Tool, isToolLive, plantCount, selectedPlant, timePreset } from '../core/state.js';
import { PLANTS } from '../data/plants.js';
import { seedboxFocus } from './seedbox-system.js';
import { profileFor, spawnPlant } from './plant-system.js';
import { finishOn, record, recordGardenSize, recordVariety } from './progress.js';
import { plantMeshes, plantTime } from './plant-meshes.js';
import { BURST_STYLES, bursts } from '../core/bursts.js';
import { makeFullRough } from '../world/materials.js';
import type { MeshStandardMaterial } from '@iwsdk/core';

const PLANT_SPEED = 8;
const SEED_SPEED = 10;
const COOLDOWN = 1;
const PACKET_OFFSET = {
  position: new Vector3(0.004997, 0.000661, 0.022534),
  quaternion: new Quaternion(-0.3432, -0.49811, 0.5263, 0.59759),
  scale: 0.9,
};

interface Flight {
  curve: CatmullRomCurve3;
  landing: Vector3;
  plantId: string;
}

/** Fired with the plant entity when a seed lands (tutorial listens). */
export const plantedListeners = new Set<(entity: Entity) => void>();

export class PlantingSystem extends createSystem({
  seeds: { required: [Seed] },
}) {
  private arc = createArcResult();
  private tube = new RayTube(20, RAY_STYLES.planting);
  private marker = new TargetMarker({ arrow: true });
  private handPacket = new Object3D();
  private handPacketIndex = -1;
  private lastPlant = -Infinity;
  private possible = false;
  private target = new Vector3();
  private origin = new Vector3();
  private dir = new Vector3();
  private flights = new Map<number, Flight>();
  private seedGeometry = new SphereGeometry(0.02, 16, 8);
  private seedMaterial = new MeshPhongMaterial({ color: 0x0b3d1a, shininess: 30 });
  private elapsed = 0;
  private controllerQuat = new Quaternion();
  /** Hologram-style preview: bright fresnel rim, nearly clear centre, slow pulse. */
  private ghost = new Mesh(
    undefined,
    new ShaderMaterial({
      uniforms: { uTime: plantTime, uColor: { value: new Color(0.75, 1, 0.55) } },
      // Alpha blended with depth writes: only the nearest surface shows, so a
      // tree's many overlapping leaf cards read as one soft silhouette instead
      // of stacking additively to white.
      transparent: true,
      side: DoubleSide,
      vertexShader: /* glsl */ `
        varying vec3 vNormalV;
        varying vec3 vViewV;
        varying float vHeight;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormalV = normalize(normalMatrix * normal);
          vViewV = normalize(-mv.xyz);
          vHeight = position.y;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        varying vec3 vNormalV;
        varying vec3 vViewV;
        varying float vHeight;
        void main() {
          float rim = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vViewV))), 2.2);
          float pulse = 0.75 + 0.25 * sin(uTime * 3.0);
          float scan = 0.85 + 0.15 * sin(vHeight * 60.0 - uTime * 4.0);
          gl_FragColor = vec4(uColor, clamp(0.14 + rim * 0.6, 0.0, 0.7) * pulse * scan);
          #include <colorspace_fragment>
        }`,
    }),
  );
  private ghostPlant = '';
  private ghostOffset = new Matrix4();

  override init(): void {
    this.ghost.matrixAutoUpdate = false;
    this.ghost.visible = false;
    this.ghost.frustumCulled = false;
    this.ghost.renderOrder = 960;
    this.scene.add(this.tube, this.marker, this.ghost);
    this.handPacket.name = 'hand-packet';
    this.handPacket.position.copy(PACKET_OFFSET.position);
    this.handPacket.quaternion.copy(PACKET_OFFSET.quaternion);
    this.handPacket.scale.setScalar(PACKET_OFFSET.scale);
    this.handPacket.visible = false;
    // A tracked hand grips it in the posed glove, as a controller does.
    toolMount(this.world, 'right').add(this.handPacket);
  }

  override update(delta: number, time: number): void {
    this.elapsed = time;
    this.updateFlights(delta);
    const live = isToolLive(Tool.Seeds);
    this.handPacket.visible = live;
    if (!live) {
      this.hideAim();
      return;
    }
    this.syncHandPacket();

    // The seedbox and UI take the trigger first.
    if ((seedboxFocus.inFocus && (seedboxFocus.inZone || seedboxFocus.pointed)) || rayBusy(this.world)) {
      this.hideAim();
      return;
    }

    rayPose(this.world, 'right', this.origin, this.dir);
    // Blocked by a plant: red arc, no marker.
    if (castArc(this.origin, this.dir, PLANT_SPEED, Layer.Plant, this.arc)) {
      this.showAim(false);
    } else {
      castArc(this.origin, this.dir, PLANT_SPEED, Layer.Obstacle, this.arc);
      const plantable =
        this.arc.hit && (this.arc.hitInfo.layers & Layer.Plantable) !== 0 && this.lastPlant + COOLDOWN < time;
      if (plantable) this.target.copy(this.arc.hitInfo.point);
      this.showAim(plantable);
    }
    this.marker.tick(delta, this.controllerYaw());

    // Controllers throw on trigger release (legacy); a hand pinches to throw.
    const thrown = handTracked(this.world, 'right') ? selectDown(this.world, 'right') : selectUp(this.world, 'right');
    if (this.possible && thrown) {
      this.lastPlant = time;
      this.throwSeed();
      haptic(this.world, 'right', 1, 10);
    }
  }

  private showAim(valid: boolean): void {
    this.possible = valid;
    this.tube.setStyle(valid ? RAY_STYLES.planting : RAY_STYLES.plantingBlocked);
    this.tube.update(this.arc.points, this.arc.count, this.arc.portion);
    if (valid) {
      this.marker.place(this.target);
      this.updateGhost();
    } else {
      this.marker.hide();
      this.ghost.visible = false;
    }
  }

  /** A faint silhouette of the chosen plant where it will grow. */
  private updateGhost(): void {
    const plant = PLANTS[selectedPlant.peek()];
    if (this.ghostPlant !== plant.id) {
      const entry =
        plantMeshes.colliderGeometry.get(plant.id) ??
        (plantMeshes.variety(plant.id), plantMeshes.colliderGeometry.get(plant.id));
      if (!entry) return;
      this.ghostPlant = plant.id;
      this.ghost.geometry = entry.geometry;
      this.ghostOffset.copy(entry.offset);
    }
    const scale = profileFor(plant.id).baselineScale;
    // A slow turn: 0.72 rad/s (the original 0.01 per frame at 72 Hz).
    tmpQuat.setFromAxisAngle(UP, 0.72 * this.elapsed);
    tmpScale.setScalar(scale);
    this.ghost.matrix.compose(this.target, tmpQuat, tmpScale).multiply(this.ghostOffset);
    this.ghost.matrixWorld.copy(this.ghost.matrix);
    this.ghost.visible = true;
  }

  private hideAim(): void {
    this.possible = false;
    this.ghost.visible = false;
    this.tube.visible = false;
    this.marker.hide();
  }

  /** Legacy arrow spin: follows the controller's roll and yaw. */
  private controllerYaw(): number {
    this.world.player.raySpaces.right.getWorldQuaternion(this.controllerQuat);
    const e = tmpEuler.setFromQuaternion(this.controllerQuat, 'YZX');
    return e.y + e.z;
  }

  private syncHandPacket(): void {
    const index = selectedPlant.peek();
    if (index === this.handPacketIndex) return;
    this.handPacketIndex = index;
    this.handPacket.clear();
    const gltf = AssetManager.getGLTF(`packet-${PLANTS[index].id}`);
    if (!gltf) return;
    gltf.scene.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      const material = (mesh.material as MeshStandardMaterial).clone();
      makeFullRough(material);
      mesh.material = material;
    });
    this.handPacket.add(gltf.scene);
  }

  private throwSeed(): void {
    const points = this.arc.points.slice(0, this.arc.count).map((p) => p.clone());
    const curve = new CatmullRomCurve3(points);
    const duration = Math.max(curve.getLength() / SEED_SPEED, 0.05);
    const seed = new Mesh(this.seedGeometry, this.seedMaterial);
    seed.position.copy(points[0]);
    const entity = this.world.createTransformEntity(seed);
    const plantId = PLANTS[selectedPlant.peek()].id;
    entity.addComponent(Seed, { plantId, duration });
    this.flights.set(entity.index, { curve, landing: this.target.clone(), plantId });
    audio.play('THROW_SEED', points[0]);
  }

  private updateFlights(delta: number): void {
    for (const entity of this.queries.seeds.entities) {
      const flight = this.flights.get(entity.index);
      if (!flight) continue;
      const timer = (entity.getValue(Seed, 'timer') ?? 0) + delta;
      entity.setValue(Seed, 'timer', timer);
      const duration = entity.getValue(Seed, 'duration') ?? 1;
      if (timer < duration) {
        flight.curve.getPointAt(timer / duration, entity.object3D!.position);
        continue;
      }
      this.flights.delete(entity.index);
      // Every seed shares one geometry and material; keep them for the next throw.
      entity.dispose({ disposeResources: false });
      const plant = spawnPlant(this.world, flight.plantId, flight.landing);
      audio.play('PLANTING_SEED', flight.landing);
      bursts.emit(flight.landing, BURST_STYLES.soil);
      // Golden seedbox: a puff of golden pollen as each seed lands.
      if (finishOn('caretaker')) bursts.emit(flight.landing, BURST_STYLES.gold);
      record('planted', flight.landing);
      if (timePreset.peek() === 'night') record('nightPlanted', flight.landing);
      recordVariety(flight.plantId);
      recordGardenSize(plantCount.peek());
      for (const listener of plantedListeners) listener(plant);
    }
  }
}

const tmpEuler = new Euler();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3();
const UP = new Vector3(0, 1, 0);
