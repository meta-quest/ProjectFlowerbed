/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Island fauna (legacy Water/Aerial fauna systems, FaunaAnimationSystem and
 * the planter butterflies of FaunaCreationSystem).
 *
 * Each species is one InstancedMesh with per-instance morph weights, so all
 * fish, ducks, gulls and butterflies cost four draw calls. Behaviour follows
 * the legacy constants:
 * - fish (3 river + 3 pond) and ducks (2 pond) swim inside sampled water
 *   areas, turning harder as the estimated distance to shore shrinks;
 * - five seagulls circle a 100 x 20 x 100 m box with positional calls;
 * - butterflies gather over long planters once four plants grow there, one
 *   more per four plants, appearing only while the player looks away.
 */

import {
  AssetManager,
  Box3,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  Raycaster,
  Vector3,
  createSystem,
  type Entity,
  type MeshStandardMaterial,
} from '@iwsdk/core';
import { Plant } from '../components/garden.js';
import { audio } from '../core/audio.js';
import { WATER_AREAS, distanceToShore, isInArea, randomPointInArea, type WaterArea } from '../data/water-areas.js';
import type { SoundId } from '../data/sounds.js';
import { makeFullRough } from './materials.js';
import { islandReady } from './island-state.js';

type MorphKind = 'fish' | 'duck' | 'gull' | 'butterfly' | 'butterflyOrange';

interface Species {
  mesh: InstancedMesh;
  /** Model-local transform from the glTF node (scale, flip). */
  local: Matrix4;
  targets: Record<string, number>;
  dummy: Mesh;
}

interface Swimmer {
  kind: 'fish' | 'duck';
  area: WaterArea;
  position: Vector3;
  yaw: number;
  speed: number;
  scale: number;
  turnSign: number;
  turning: boolean;
  thresholds: [number, number, number];
  turnMultiplier: number;
  /** Self-alternating morph timer and synchronized sequence state. */
  selfT: number;
  seqT: number;
  seqIndex: number;
}

interface Gull {
  position: Vector3;
  direction: Vector3;
  speed: number;
  pathOffset: number;
  seqT: number;
  seqIndex: number;
  call: { duration: number; setPosition(p: Vector3): void; ended(): boolean } | null;
  nextCall: number;
}

interface Butterfly {
  cluster: Cluster;
  orange: boolean;
  position: Vector3;
  direction: Vector3;
  speed: number;
  t: number;
  phase: number;
  offset: number;
}

interface Cluster {
  planter: Object3D;
  plants: Vector3[];
  /** The plant entities, for the health check (thirsty beds lose butterflies). */
  entities: Entity[];
  outer: Box3;
  inner: Box3;
  butterflies: Butterfly[];
  pending: number;
}

const FISH = { base: 0.3, range: 0.3, depth: -0.3, depthRange: 0.4, scale: 1.25, scaleRange: 1.5, cull: 20 };
const DUCK = { base: 0.15, range: 0.2, scale: 1, scaleRange: 0.04, cull: 60 };
const GULL_BOX = new Box3(new Vector3(-50, 10, -50), new Vector3(50, 30, 50));
const GULL_CALLS: SoundId[] = [
  'SEAGULLS_LOOP_01',
  'SEAGULLS_LOOP_02',
  'SEAGULLS_LOOP_03',
  'SEAGULLS_LOOP_04',
  'SEAGULLS_LOOP_05',
];
const DEG = Math.PI / 180;
const MAX_BUTTERFLIES = 64;

const rand = (base: number, range: number) => base + (Math.random() - 0.5) * range;
/** Legacy morph envelope: 0 -> max -> 0 parabola over the cycle. */
const envelope = (t: number, d: number, max: number) => Math.max(0, (1 - 4 * (t / d - 0.5) ** 2) * max);

export class FaunaSystem extends createSystem({
  plants: { required: [Plant] },
}) {
  private species = new Map<MorphKind, Species>();
  private swimmers: Swimmer[] = [];
  private gulls: Gull[] = [];
  private clusters: Cluster[] = [];
  private butterflies: Butterfly[] = [];
  private loading = false;
  private ready = false;
  private elapsed = 0;
  private m = new Matrix4();
  private q = new Quaternion();
  private s = new Vector3();
  private v = new Vector3();
  private v2 = new Vector3();
  private head = new Vector3();
  private headDir = new Vector3();
  private point: [number, number] = [0, 0];
  private ray = new Raycaster();
  private counted = new WeakSet<Entity>();

  override init(): void {
    this.cleanupFuncs.push(this.queries.plants.subscribe('qualify', (entity) => this.countPlant(entity)));
  }

  private async load(): Promise<void> {
    this.loading = true;
    const entries: [MorphKind, string, number][] = [
      ['fish', 'fauna-fish', 6],
      ['duck', 'fauna-duck', 2],
      ['gull', 'fauna-seagull', 5],
      ['butterfly', 'fauna-butterfly-blue', MAX_BUTTERFLIES],
      ['butterflyOrange', 'fauna-butterfly-orange', MAX_BUTTERFLIES],
    ];
    await Promise.all(
      entries.map(async ([kind, id, count]) => {
        try {
          await AssetManager.loadGLTFById(id);
          const gltf = AssetManager.getGLTF(id);
          if (gltf) this.species.set(kind, this.buildSpecies(gltf.scene, count, kind));
        } catch (error) {
          console.warn(`[flowerbed] fauna ${id} failed to load`, error);
        }
      }),
    );
    // Ready first: spawn() counts saved plants through countPlant().
    this.ready = true;
    this.spawn();
  }

  private buildSpecies(root: Object3D, count: number, kind: MorphKind): Species {
    let source: Mesh | null = null;
    root.traverse((node) => {
      if (!source && (node as Mesh).isMesh) source = node as Mesh;
    });
    const mesh0 = source as unknown as Mesh;
    root.updateMatrixWorld(true);
    // Swimmers travel along +Z, the way the models face. (The 2022 game turned
    // a child node 180 degrees, but its instancing used the parent's matrix,
    // so the turn never reached the screen.) Gulls and butterflies use lookAt.
    const local = mesh0.matrixWorld.clone();
    const material = (mesh0.material as MeshStandardMaterial).clone();
    makeFullRough(material);
    const mesh = new InstancedMesh(mesh0.geometry, material, count);
    mesh.name = `fauna:${kind}`;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.scene.add(mesh);
    const dummy = new Mesh(mesh0.geometry);
    dummy.morphTargetInfluences = new Array(mesh0.morphTargetInfluences?.length ?? 0).fill(0);
    // The renderer reads these on the instanced mesh itself.
    mesh.morphTargetInfluences = dummy.morphTargetInfluences.slice();
    mesh.morphTargetDictionary = mesh0.morphTargetDictionary;
    // The morph texture is sized from `count` on first use: fill it first.
    for (let i = 0; i < count; i++) mesh.setMorphAt(i, dummy);
    mesh.count = 0;
    return { mesh, local, targets: mesh0.morphTargetDictionary ?? {}, dummy };
  }

  private spawn(): void {
    const add = (kind: 'fish' | 'duck', area: WaterArea, n: number, thresholds: [number, number, number]) => {
      for (let i = 0; i < n; i++) {
        randomPointInArea(area, this.point);
        const position = this.toWorld(area, this.point[0], this.point[1], new Vector3());
        const fish = kind === 'fish';
        position.y = fish ? rand(FISH.depth, FISH.depthRange) : 0;
        this.swimmers.push({
          kind,
          area,
          position,
          yaw: Math.random() * Math.PI * 2,
          speed: fish ? rand(FISH.base, FISH.range) : rand(DUCK.base, DUCK.range),
          scale: fish ? rand(FISH.scale, FISH.scaleRange) : rand(DUCK.scale, DUCK.scaleRange),
          turnSign: Math.random() < 0.5 ? -1 : 1,
          turning: false,
          thresholds,
          turnMultiplier: fish ? 2 : 1,
          selfT: Math.random(),
          seqT: Math.random(),
          seqIndex: 0,
        });
      }
    };
    add('fish', WATER_AREAS.river, 3, [1, 0.7, 0.5]);
    add('fish', WATER_AREAS.pond, 3, [2, 1, 0.5]);
    add('duck', WATER_AREAS.pond, 2, [2, 1, 0.5]);

    for (let i = 0; i < 5; i++) {
      const position = new Vector3(
        GULL_BOX.min.x + Math.random() * 100,
        GULL_BOX.min.y + Math.random() * 20,
        GULL_BOX.min.z + Math.random() * 100,
      );
      const direction = new Vector3(Math.random(), 0, Math.random()).normalize();
      this.gulls.push({
        position,
        direction,
        speed: rand(5, 2),
        pathOffset: Math.random() * 20,
        seqT: Math.random() * 0.3,
        seqIndex: 0,
        call: null,
        nextCall: Math.random() * 3,
      });
    }

    const planters: Object3D[] = [];
    this.world.getSceneObject('island-props')?.children.forEach((child) => {
      if (/Planter Long/i.test(child.name)) planters.push(child);
    });
    for (const planter of planters) {
      this.clusters.push({
        planter,
        plants: [],
        entities: [],
        outer: new Box3(),
        inner: new Box3(),
        butterflies: [],
        pending: 0,
      });
    }
    for (const entity of this.queries.plants.entities) this.countPlant(entity);
  }

  private toWorld(area: WaterArea, a: number, b: number, out: Vector3): Vector3 {
    return area.vertical ? out.set(a, 0, b) : out.set(b, 0, a);
  }

  override update(delta: number): void {
    if (!this.ready) {
      if (!this.loading && islandReady.peek()) void this.load();
      return;
    }
    this.elapsed += delta;
    const dt = Math.min(delta, 0.05);
    this.world.player.head.getWorldPosition(this.head);
    this.world.player.head.getWorldDirection(this.headDir).negate();
    this.updateSwimmers(dt);
    this.updateGulls(dt);
    this.updateButterflies(dt);
  }

  /** Legacy culling: beyond range or more than 45 degrees off the view. */
  private culled(position: Vector3, range: number): boolean {
    this.v2.subVectors(position, this.head);
    const distance = this.v2.length();
    if (distance > range) return true;
    return this.v2.angleTo(this.headDir) > Math.PI / 4;
  }

  private updateSwimmers(dt: number): void {
    const fish = this.species.get('fish');
    const duck = this.species.get('duck');
    let fishIndex = 0;
    let duckIndex = 0;
    for (const swimmer of this.swimmers) {
      const species = swimmer.kind === 'fish' ? fish : duck;
      if (!species) continue;
      const index = swimmer.kind === 'fish' ? fishIndex++ : duckIndex++;
      const range = swimmer.kind === 'fish' ? FISH.cull : DUCK.cull;
      if (!this.culled(swimmer.position, range)) {
        this.swim(swimmer, dt);
        this.animateSwimmer(swimmer, species, index, dt);
      }
      this.q.setFromAxisAngle(UP, swimmer.yaw);
      this.s.setScalar(swimmer.scale);
      this.m.compose(swimmer.position, this.q, this.s).multiply(species.local);
      species.mesh.setMatrixAt(index, this.m);
    }
    for (const [species, count] of [
      [fish, fishIndex],
      [duck, duckIndex],
    ] as const) {
      if (!species) continue;
      species.mesh.count = count;
      species.mesh.instanceMatrix.needsUpdate = true;
      if (species.mesh.morphTexture) species.mesh.morphTexture.needsUpdate = true;
    }
  }

  private swim(swimmer: Swimmer, dt: number): void {
    const area = swimmer.area;
    const fx = Math.sin(swimmer.yaw);
    const fz = Math.cos(swimmer.yaw);
    const [a, b] = area.vertical ? [swimmer.position.x, swimmer.position.z] : [swimmer.position.z, swimmer.position.x];
    const [fa, fb] = area.vertical ? [fx, fz] : [fz, fx];
    let distance = distanceToShore(a, b, -fa, fb, area);
    if (swimmer.kind === 'duck') {
      for (const other of this.swimmers) {
        if (other === swimmer || other.kind !== 'duck') continue;
        distance = Math.min(distance, 3 * swimmer.position.distanceTo(other.position));
      }
    }
    const [t0, t1, t2] = swimmer.thresholds;
    if (distance > t0) {
      if (swimmer.turning) swimmer.turnSign = Math.random() < 0.5 ? -1 : 1;
      swimmer.turning = false;
    } else {
      swimmer.turning = true;
      const d = distance;
      let factor: number;
      if (d > t1) factor = t0 - d;
      else if (d > t2) factor = (t0 - d) ** 2 - (t0 - t1) ** 2 + t0 - t1;
      else factor = (t0 - d) ** 3 - (t0 - t2) ** 3 + (t0 - t2) ** 2 - (t0 - t1) ** 2 + t0 - t1;
      swimmer.yaw += swimmer.turnSign * factor * swimmer.turnMultiplier * Math.PI * dt;
    }
    swimmer.position.x += Math.sin(swimmer.yaw) * swimmer.speed * dt;
    swimmer.position.z += Math.cos(swimmer.yaw) * swimmer.speed * dt;
    const [na, nb] = area.vertical
      ? [swimmer.position.x, swimmer.position.z]
      : [swimmer.position.z, swimmer.position.x];
    if (!isInArea(na, nb, area)) {
      randomPointInArea(area, this.point);
      const y = swimmer.position.y;
      this.toWorld(area, this.point[0], this.point[1], swimmer.position);
      swimmer.position.y = y;
    }
  }

  private animateSwimmer(swimmer: Swimmer, species: Species, index: number, dt: number): void {
    const influences = species.dummy.morphTargetInfluences!;
    influences.fill(0);
    const fish = swimmer.kind === 'fish';
    const selfName = fish ? 'Breathing' : 'StretchForward';
    const selfDuration = fish ? 1 : 4;
    const selfMax = fish ? 1 : 0.2;
    swimmer.selfT += dt;
    if (swimmer.selfT > selfDuration) swimmer.selfT = 0;
    const selfIndex = species.targets[selfName];
    if (selfIndex != null) influences[selfIndex] = envelope(swimmer.selfT, selfDuration, selfMax);
    const sequence = fish ? ['Twist_Left', 'Twist_Right'] : ['Paddle_LeftLegForward', 'Paddle_RightLegForward'];
    const base = fish ? FISH.base : DUCK.base;
    const duration = 1 / (swimmer.speed / base);
    swimmer.seqT += dt;
    if (swimmer.seqT > duration) {
      swimmer.seqT = 0;
      swimmer.seqIndex = (swimmer.seqIndex + 1) % sequence.length;
    }
    const seqIndex = species.targets[sequence[swimmer.seqIndex]];
    if (seqIndex != null) influences[seqIndex] = envelope(swimmer.seqT, duration, 0.6);
    species.mesh.setMorphAt(index, species.dummy);
  }

  private updateGulls(dt: number): void {
    const species = this.species.get('gull');
    if (!species) return;
    const radius = Math.sqrt(50 * 50 + 50 * 50 + 10 * 10);
    // Legacy steps were per frame at 72 Hz; scale them by dt.
    const frames = dt * 72;
    this.gulls.forEach((gull, index) => {
      const dx = gull.position.x;
      const dz = gull.position.z;
      let turned = false;
      if (Math.hypot(dx, dz) > radius) {
        gull.direction.applyAxisAngle(UP, 3 * DEG * frames);
        turned = true;
      }
      const wobble = Math.sin(2 * Math.PI * (1 / 20) * (this.elapsed + gull.pathOffset)) * 0.3 * DEG * frames;
      gull.direction.applyAxisAngle(UP, wobble).normalize();
      if (!turned) {
        const pitch = Math.asin(gull.direction.y);
        if (Math.abs(pitch) > 20 * DEG) {
          gull.direction.y *= 0.95;
          gull.direction.normalize();
        }
      }
      gull.position.addScaledVector(gull.direction, gull.speed * dt);
      this.v.copy(gull.position).add(gull.direction);
      tmpObject.position.copy(gull.position);
      tmpObject.lookAt(this.v);
      this.m.compose(gull.position, tmpObject.quaternion, this.s.setScalar(1)).multiply(species.local);
      species.mesh.setMatrixAt(index, this.m);

      if (!this.culled(gull.position, 1000)) {
        const duration = 0.3 / (gull.speed / 5);
        gull.seqT += dt;
        if (gull.seqT > duration) {
          gull.seqT = 0;
          gull.seqIndex = 1 - gull.seqIndex;
        }
        const influences = species.dummy.morphTargetInfluences!;
        influences.fill(0);
        const target = species.targets[gull.seqIndex === 0 ? 'Flap_Up' : 'Flap_Down'];
        if (target != null) influences[target] = envelope(gull.seqT, duration, 1);
        species.mesh.setMorphAt(index, species.dummy);
      }

      // Positional calls: shuffled clips with 0-3 s gaps (legacy playlist).
      if (gull.call && !gull.call.ended()) gull.call.setPosition(gull.position);
      else {
        gull.call = null;
        gull.nextCall -= dt;
        if (gull.nextCall <= 0) {
          gull.call = audio.playTracked(GULL_CALLS[Math.floor(Math.random() * GULL_CALLS.length)], gull.position);
          gull.nextCall = (gull.call?.duration ?? 2) + Math.random() * 3;
        }
      }
    });
    species.mesh.count = this.gulls.length;
    species.mesh.instanceMatrix.needsUpdate = true;
    if (species.mesh.morphTexture) species.mesh.morphTexture.needsUpdate = true;
  }

  // Butterflies -----------------------------------------------------------

  private countPlant(entity: Entity): void {
    if (!this.ready || this.counted.has(entity)) return;
    this.counted.add(entity);
    const position = entity.object3D!.position;
    this.v.copy(position);
    this.v.y += 0.5;
    this.ray.set(this.v, DOWN);
    this.ray.far = 1;
    for (const cluster of this.clusters) {
      if (this.ray.intersectObject(cluster.planter, true).length === 0) continue;
      cluster.plants.push(position.clone());
      cluster.entities.push(entity);
      this.fitCluster(cluster);
      this.balanceClusters();
      break;
    }
  }

  /**
   * One butterfly per four healthy (watered) plants in a bed. Thirsty or
   * removed plants make butterflies leave; watering brings them back.
   */
  private balanceClusters(): void {
    for (const cluster of this.clusters) {
      cluster.entities = cluster.entities.filter((entity) => entity.active && entity.hasComponent(Plant));
      const healthy = cluster.entities.filter((entity) => (entity.getValue(Plant, 'thirst') ?? 0) < 0.5).length;
      const target = Math.floor(healthy / 4);
      const have = cluster.butterflies.length;
      cluster.pending = Math.max(0, target - have);
      for (let i = have; i > target; i--) {
        const leaving = cluster.butterflies.pop()!;
        this.butterflies.splice(this.butterflies.indexOf(leaving), 1);
      }
    }
  }

  private balanceTimer = 0;

  private fitCluster(cluster: Cluster): void {
    const box = cluster.outer.setFromPoints(cluster.plants);
    box.min.y += 0.5;
    box.max.y = box.min.y + 1;
    const size = box.getSize(this.v);
    if (size.x > 5 && size.z > 5) {
      cluster.planter.getWorldPosition(this.v2);
      box.setFromCenterAndSize(this.v2.setY(box.getCenter(new Vector3()).y), new Vector3(size.x / 2, 1, size.z / 2));
    }
    const center = box.getCenter(new Vector3());
    const fitted = box.getSize(new Vector3());
    fitted.x = Math.max(fitted.x, 1.5);
    fitted.z = Math.max(fitted.z, 1.5);
    box.setFromCenterAndSize(center, fitted);
    cluster.inner.setFromCenterAndSize(center, fitted.multiplyScalar(0.8));
  }

  private updateButterflies(dt: number): void {
    this.balanceTimer += dt;
    if (this.balanceTimer > 3) {
      this.balanceTimer = 0;
      this.balanceClusters();
    }
    const blue = this.species.get('butterfly');
    const orange = this.species.get('butterflyOrange') ?? blue;
    if (!blue || !orange) return;
    let blueCount = 0;
    let orangeCount = 0;
    // Spawn only behind the player's back (legacy: > 90 degrees away).
    for (const cluster of this.clusters) {
      if (cluster.pending <= 0 || this.butterflies.length >= MAX_BUTTERFLIES) continue;
      cluster.inner.getCenter(this.v);
      this.v2.subVectors(this.v, this.head);
      if (this.v2.angleTo(this.headDir) <= Math.PI / 2) continue;
      cluster.pending -= 1;
      const butterfly: Butterfly = {
        cluster,
        orange: Math.random() < 0.5,
        position: this.v.clone(),
        direction: new Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
        speed: (0.005 + Math.random() * 0.005) * 72,
        t: Math.random() * 0.2,
        phase: Math.random() < 0.5 ? 0 : 1,
        offset: Math.random() * 2,
      };
      cluster.butterflies.push(butterfly);
      this.butterflies.push(butterfly);
    }
    const frames = dt * 72;
    this.butterflies.forEach((butterfly) => {
      const species = butterfly.orange ? orange : blue;
      const index = butterfly.orange && orange !== blue ? orangeCount++ : blueCount++;
      const box = butterfly.cluster.inner;
      const p = butterfly.position;
      const d = butterfly.direction;
      // Outside the inner box: turn back toward its centre at the legacy
      // 5 degrees per frame (horizontal) and nudge pitch (vertical).
      const outsideXZ = p.x < box.min.x || p.x > box.max.x || p.z < box.min.z || p.z > box.max.z;
      if (outsideXZ) {
        box.getCenter(this.v2);
        const desired = Math.atan2(this.v2.x - p.x, this.v2.z - p.z);
        const current = Math.atan2(d.x, d.z);
        let diff = desired - current;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        const step = Math.sign(diff) * Math.min(Math.abs(diff), 5 * DEG * frames);
        d.applyAxisAngle(UP, step);
      }
      if ((p.y < box.min.y && d.y < 0) || (p.y > box.max.y && d.y > 0)) {
        d.y -= Math.sign(d.y) * 0.08 * frames;
      }
      const variation = Math.sin(2 * Math.PI * 0.5 * (this.elapsed + butterfly.offset)) * DEG * frames;
      d.applyAxisAngle(UP, variation);
      d.y += variation * 0.5;
      d.y = Math.max(-0.34, Math.min(0.34, d.y));
      d.normalize();
      p.addScaledVector(d, butterfly.speed * dt);
      // Model faces -Z: look away from the travel direction.
      this.v.copy(p).sub(d);
      tmpObject.position.copy(p);
      tmpObject.lookAt(this.v);
      this.m.compose(p, tmpObject.quaternion, this.s.setScalar(1)).multiply(species.local);
      species.mesh.setMatrixAt(index, this.m);
      // Flap_Up 0.1 s -> Flap_Down 0.1 s triangle waves.
      butterfly.t += dt;
      if (butterfly.t > 0.1) {
        butterfly.t = 0;
        butterfly.phase = 1 - butterfly.phase;
      }
      const influences = species.dummy.morphTargetInfluences!;
      influences.fill(0);
      const target = species.targets[butterfly.phase === 0 ? 'Flap_Up' : 'Flap_Down'];
      if (target != null) influences[target] = 1 - Math.abs(butterfly.t / 0.05 - 1);
      species.mesh.setMorphAt(index, species.dummy);
    });
    for (const [species, count] of [
      [blue, blueCount],
      [orange, orangeCount],
    ] as const) {
      if (species === orange && orange === blue) continue;
      species.mesh.count = count;
      species.mesh.instanceMatrix.needsUpdate = true;
      if (species.mesh.morphTexture) species.mesh.morphTexture.needsUpdate = true;
    }
  }
}

const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);
const tmpObject = new Object3D();
