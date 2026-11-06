/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Instanced plant rendering.
 *
 * Every plant model is a skinned mesh with a root bone and four segment
 * bones. As in the legacy WoodlandPlantShader, skinning is replaced by
 * per-segment scaling about each bone's pivot, which lets one InstancedMesh
 * per variety draw every plant of that variety with its own growth state:
 *
 *   p += sum_i (p - pivot_i) * (segment_i - 1) * weight_i
 *
 * Per-instance data: the instance matrix, `aSegments` (segment values, 1 =
 * rest pose) and `aTint` (an emissive highlight for the Remove tool).
 */

import {
  AssetManager,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SkinnedMesh,
  Vector3,
  Vector4,
} from '@iwsdk/core';
import { MeshoptSimplifier } from 'meshoptimizer';
import { toLambert } from '../world/materials.js';

const MAX_PER_VARIETY = 1024;
const MAX_BLOBS = 2048;

/** Shared clock for plant shaders (highlight pulse). */
export const plantTime = { value: 0 };

export interface PlantTemplate {
  geometry: BufferGeometry;
  material: Material;
  /** Matrix from plant-entity space to mesh space (folds in quantization). */
  meshOffset: Matrix4;
  pivots: Vector4[];
}

/**
 * Distance levels: the full mesh up close, then index buffers simplified by
 * meshoptimizer (vertices, segment weights and shader unchanged). Error caps
 * are relative to the plant's size: ~1 px or less at each switch distance.
 */
const LOD_LEVELS = [
  { from: 0, ratio: 1, error: 0 },
  { from: 3.5, ratio: 0.35, error: 0.03 },
  { from: 9, ratio: 0.12, error: 0.06 },
];
/** Render layer seen only by the sun's shadow camera (plant shadow casters). */
export const PLANT_SHADOW_LAYER = 5;
/** Skip plants more than this far outside the view direction (cosine), beyond 1.5 m. */
const BEHIND_COS = Math.cos((80 * Math.PI) / 180);

let simplifierReady = false;
const simplifierWaiters: (() => void)[] = [];
void MeshoptSimplifier.ready.then(() => {
  simplifierReady = MeshoptSimplifier.supported;
  simplifierWaiters.splice(0).forEach((build) => build());
});

function simplifiedIndex(geometry: BufferGeometry, ratio: number, error: number): BufferAttribute | null {
  const index = geometry.index;
  const position = geometry.getAttribute('position');
  if (!index || !simplifierReady) return null;
  const indices = Uint32Array.from(index.array as ArrayLike<number>);
  const positions = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    positions[i * 3] = position.getX(i);
    positions[i * 3 + 1] = position.getY(i);
    positions[i * 3 + 2] = position.getZ(i);
  }
  const uv = geometry.getAttribute('uv');
  const uvs = new Float32Array(position.count * 2);
  if (uv)
    for (let i = 0; i < uv.count; i++) {
      uvs[i * 2] = uv.getX(i);
      uvs[i * 2 + 1] = uv.getY(i);
    }
  const target = Math.floor((indices.length * ratio) / 3) * 3;
  const [out] = MeshoptSimplifier.simplifyWithAttributes(
    indices,
    positions,
    3,
    uvs,
    2,
    [0.5, 0.5],
    null,
    target,
    error,
  );
  return new BufferAttribute(out, 1);
}

class PlantVariety {
  /** Holds the level meshes and the shadow caster. */
  readonly group = new Object3D();
  /**
   * Every live plant, packed in [0, count): the authoritative instance data.
   * It doubles as the shadow caster (mid detail, shadow layer only).
   */
  private all: InstancedMesh;
  private segments: InstancedBufferAttribute;
  private tints: InstancedBufferAttribute;
  /** What the eyes see: plants binned by distance, one mesh per level. */
  private levels: { mesh: InstancedMesh; segments: InstancedBufferAttribute; tints: InstancedBufferAttribute }[] = [];
  private counts = LOD_LEVELS.map(() => 0);
  /** Per slot: tells the owner when compaction moves it to another slot. */
  private movers: ((slot: number) => void)[] = [];
  private tmp = new Matrix4();
  private dirty = true;

  constructor(
    readonly template: PlantTemplate,
    name: string,
  ) {
    this.group.name = `plants:${name}`;
    const geometry = this.levelGeometry(null);
    this.segments = new InstancedBufferAttribute(new Float32Array(MAX_PER_VARIETY * 4).fill(1), 4);
    // rgb: Remove-tool highlight colour, a: thirst (0 fresh .. 1 wilted).
    this.tints = new InstancedBufferAttribute(new Float32Array(MAX_PER_VARIETY * 4), 4);
    geometry.setAttribute('aSegments', this.segments);
    geometry.setAttribute('aTint', this.tints);
    this.all = new InstancedMesh(geometry, template.material, MAX_PER_VARIETY);
    this.all.count = 0;
    this.all.castShadow = true;
    this.all.frustumCulled = false;
    this.all.layers.set(PLANT_SHADOW_LAYER);
    this.group.add(this.all);
    for (let i = 0; i < LOD_LEVELS.length; i++) {
      const level = this.levelGeometry(null);
      const segments = new InstancedBufferAttribute(new Float32Array(MAX_PER_VARIETY * 4), 4);
      const tints = new InstancedBufferAttribute(new Float32Array(MAX_PER_VARIETY * 4), 4);
      for (const attribute of [segments, tints]) attribute.setUsage(DynamicDrawUsage);
      level.setAttribute('aSegments', segments);
      level.setAttribute('aTint', tints);
      const mesh = new InstancedMesh(level, template.material, MAX_PER_VARIETY);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.receiveShadow = true;
      // Bounds change as plants are added anywhere; binning culls instead.
      mesh.frustumCulled = false;
      mesh.renderOrder = 900;
      this.levels.push({ mesh, segments, tints });
      this.group.add(mesh);
    }
    const simplify = () => {
      LOD_LEVELS.forEach(({ ratio, error }, i) => {
        if (ratio >= 1) return;
        const index = simplifiedIndex(template.geometry, ratio, error);
        if (!index) return;
        this.levels[i].mesh.geometry.setIndex(index);
        if (i === 1) this.all.geometry.setIndex(index);
      });
    };
    if (simplifierReady) simplify();
    else simplifierWaiters.push(simplify);
  }

  /** The template's vertex buffers (shared, uploaded once) with its own index. */
  private levelGeometry(index: BufferAttribute | null): BufferGeometry {
    const source = this.template.geometry;
    const geometry = new BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(index ?? source.index);
    geometry.boundingSphere = source.boundingSphere;
    return geometry;
  }

  /** Instances stay packed in [0, count), so the GPU only sees live plants. */
  allocate(onMove: (slot: number) => void): number {
    const slot = this.all.count;
    if (slot >= MAX_PER_VARIETY) return -1;
    this.movers[slot] = onMove;
    this.all.count = slot + 1;
    this.dirty = true;
    return slot;
  }

  /** Free a slot by moving the last instance into it. */
  release(slot: number): void {
    const last = this.all.count - 1;
    if (slot !== last) {
      this.all.getMatrixAt(last, this.tmp);
      this.all.setMatrixAt(slot, this.tmp);
      this.segments.copyAt(slot, this.segments, last);
      this.tints.copyAt(slot, this.tints, last);
      this.movers[slot] = this.movers[last];
      this.movers[slot](slot);
    }
    this.movers.length = last;
    this.all.count = last;
    this.markChanged();
  }

  write(slot: number, world: Matrix4, segments: Vector4): void {
    this.tmp.multiplyMatrices(world, this.template.meshOffset);
    this.all.setMatrixAt(slot, this.tmp);
    this.segments.setXYZW(slot, segments.x, segments.y, segments.z, segments.w);
    this.markChanged();
  }

  tint(slot: number, color: Color | null, thirst = 0): void {
    if (color) this.tints.setXYZW(slot, color.r, color.g, color.b, thirst);
    else this.tints.setXYZW(slot, 0, 0, 0, thirst);
    this.markChanged();
  }

  /** Uploads are batched into the next rebin, however many plants changed this frame. */
  private markChanged(): void {
    this.dirty = true;
  }

  /**
   * Re-bin plants into the distance levels, skipping those well behind the
   * viewer. Runs when plants changed or the view moved (see PlantMeshes).
   */
  rebin(eye: Vector3, forward: Vector3, force: boolean): void {
    if (!force && !this.dirty) return;
    // The full set still draws into the shadow map.
    if (this.dirty) flagInstances(this.all.instanceMatrix, this.segments, this.tints, this.all.count);
    this.dirty = false;
    const source = this.all.instanceMatrix.array as Float32Array;
    const segments = this.segments.array as Float32Array;
    const tints = this.tints.array as Float32Array;
    const counts = this.counts.fill(0);
    for (let i = 0; i < this.all.count; i++) {
      const dx = source[i * 16 + 12] - eye.x;
      const dy = source[i * 16 + 13] - eye.y;
      const dz = source[i * 16 + 14] - eye.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance > 1.5 && dx * forward.x + dy * forward.y + dz * forward.z < BEHIND_COS * distance) continue;
      let level = LOD_LEVELS.length - 1;
      while (level > 0 && distance < LOD_LEVELS[level].from) level--;
      const target = this.levels[level];
      const n = counts[level]++;
      copyFloats(source, i * 16, target.mesh.instanceMatrix.array as Float32Array, n * 16, 16);
      copyFloats(segments, i * 4, target.segments.array as Float32Array, n * 4, 4);
      copyFloats(tints, i * 4, target.tints.array as Float32Array, n * 4, 4);
    }
    for (let level = 0; level < this.levels.length; level++) {
      const target = this.levels[level];
      const n = counts[level];
      target.mesh.count = n;
      if (n > 0) flagInstances(target.mesh.instanceMatrix, target.segments, target.tints, n);
    }
  }
}

/** Upload only the live [0, count) instances of a mesh's per-instance attributes. */
function flagInstances(
  matrices: InstancedBufferAttribute,
  segments: InstancedBufferAttribute,
  tints: InstancedBufferAttribute,
  count: number,
): void {
  flagRange(matrices, count);
  flagRange(segments, count);
  flagRange(tints, count);
}

function flagRange(attribute: InstancedBufferAttribute, count: number): void {
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, count * attribute.itemSize);
  attribute.needsUpdate = true;
}

function copyFloats(from: Float32Array, start: number, to: Float32Array, offset: number, length: number): void {
  for (let k = 0; k < length; k++) to[offset + k] = from[start + k];
}

/** Convert a loaded plant glTF into a segment-scaled instancing template. */
function buildTemplate(root: Object3D): PlantTemplate | null {
  let skinned: SkinnedMesh | null = null;
  root.traverse((child) => {
    if (!skinned && (child as SkinnedMesh).isSkinnedMesh) skinned = child as SkinnedMesh;
  });
  if (!skinned) return null;
  const node: SkinnedMesh = skinned;
  root.updateMatrixWorld(true);

  // Fold the root bone's inverse bind transform (glTF quantization) into the
  // mesh offset, and collect the four segment pivots in mesh space.
  const position = node.position.clone();
  const scale = node.scale.clone();
  const remap: number[] = [];
  const pivots: Vector4[] = [];
  let rootIndex = node.skeleton.bones.length;
  node.skeleton.bones.forEach((bone, i) => {
    if (/root/i.test(bone.name)) {
      rootIndex = i;
      remap[i] = -1;
      const inverse = node.skeleton.boneInverses[i];
      scale.multiply(new Vector3().setFromMatrixScale(inverse));
      position.add(new Vector3().setFromMatrixPosition(inverse));
    }
  });
  node.skeleton.bones.forEach((bone, i) => {
    if (remap[i] === -1) return;
    remap[i] = i > rootIndex ? i - 1 : i;
    const pivot = bone.position.clone().sub(position).divide(scale);
    pivots[remap[i]] = new Vector4(pivot.x, pivot.y, pivot.z, 0);
  });
  for (let i = 0; i < 4; i++) pivots[i] ??= new Vector4();

  const geometry = new BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const attribute = node.geometry.getAttribute(name);
    if (attribute) geometry.setAttribute(name, attribute);
  }
  geometry.setIndex(node.geometry.getIndex());
  const skinIndex = node.geometry.getAttribute('skinIndex');
  const skinWeight = node.geometry.getAttribute('skinWeight');
  const weights = new Float32Array(skinWeight.count * 4);
  for (let v = 0; v < skinWeight.count; v++) {
    for (let j = 0; j < 4; j++) {
      const target = remap[skinIndex.getComponent(v, j)];
      const w = skinWeight.getComponent(v, j);
      if (target >= 0 && w > 0.01) weights[v * 4 + target] = w;
    }
  }
  geometry.setAttribute('aSegWeight', new BufferAttribute(weights, 4));
  geometry.computeBoundingSphere();

  const meshOffset = new Matrix4().compose(position, node.quaternion, scale);
  return {
    geometry,
    material: createPlantMaterial(
      node.material as MeshStandardMaterial,
      pivots,
      geometry.getAttribute('color') != null,
    ),
    meshOffset,
    pivots,
  };
}

function createPlantMaterial(source: MeshStandardMaterial, pivots: Vector4[], vertexColors: boolean): Material {
  const material = source.clone();
  // Matte foliage like the legacy override: no metal/roughness maps.
  material.metalnessMap = null;
  material.roughnessMap = null;
  material.aoMap = null;
  material.metalness = 0;
  material.roughness = 1;
  if (material.map) material.map.anisotropy = 4;
  if (material.alphaTest > 0) {
    material.alphaToCoverage = true;
    material.alphaTest = 0.5;
  }
  material.shadowSide = source.side;
  material.vertexColors = vertexColors;
  const uniforms = { uPivots: { value: pivots }, uTime: plantTime };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aSegWeight;
        attribute vec4 aSegments;
        attribute vec4 aTint;
        uniform vec4 uPivots[4];
        varying vec4 vTint;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 segOffset = vec3(0.0);
        for (int i = 0; i < 4; i++) {
          segOffset += (transformed - uPivots[i].xyz) * (aSegments[i] - 1.0) * aSegWeight[i];
        }
        transformed += segOffset;
        vTint = aTint;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vTint;\nuniform float uTime;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Thirsty plants fade toward straw.
        float luma = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        diffuseColor.rgb = mix(diffuseColor.rgb, luma * vec3(0.95, 0.8, 0.55), vTint.a * 0.65);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Remove-tool highlight: a pulsing rim instead of a flat flood.
        float rim = pow(1.0 - saturate(abs(dot(normalize(normal), normalize(vViewPosition)))), 1.5);
        totalEmissiveRadiance += vTint.rgb * (0.25 + rim * 1.8) * (0.75 + 0.25 * sin(uTime * 8.0));`,
      );
  };
  material.customProgramCacheKey = () => 'flowerbed-plant';
  // Matte foliage shades the same under Lambert, at a fraction of the cost.
  return toLambert(material);
}

/** Soft round contact shadow under every plant: one instanced draw call. */
class ShadowBlobs {
  readonly mesh: InstancedMesh;
  private free: number[] = [];
  private used = 0;
  private tmp = new Matrix4();
  private q = new Quaternion();
  private s = new Vector3();
  private p = new Vector3();

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(20,24,12,0.55)');
    gradient.addColorStop(0.55, 'rgba(20,24,12,0.25)');
    gradient.addColorStop(1, 'rgba(20,24,12,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const material = new MeshBasicMaterial({
      map: new CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      fog: true,
    });
    this.mesh = new InstancedMesh(geometry, material, MAX_BLOBS);
    this.mesh.name = 'plants:shadows';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  allocate(): number {
    const slot = this.free.pop() ?? this.used++;
    if (slot >= MAX_BLOBS) return -1;
    this.mesh.count = Math.max(this.mesh.count, slot + 1);
    return slot;
  }

  release(slot: number): void {
    this.mesh.setMatrixAt(slot, this.tmp.makeScale(0, 0, 0));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.free.push(slot);
  }

  write(slot: number, position: Vector3, radius: number): void {
    this.p.copy(position);
    this.p.y += 0.01;
    this.s.set(radius * 2, 1, radius * 2);
    this.mesh.setMatrixAt(slot, this.tmp.compose(this.p, this.q, this.s));
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

class PlantMeshes {
  readonly shadows = new ShadowBlobs();
  private footprints = new Map<string, number>();

  /** Rest-pose ground radius (m) of a variety at scale 1. */
  footprint(plantId: string): number {
    let radius = this.footprints.get(plantId);
    if (radius != null) return radius;
    const entry = this.colliderGeometry.get(plantId) ?? (this.variety(plantId), this.colliderGeometry.get(plantId));
    if (!entry) return 0.2;
    entry.geometry.computeBoundingBox();
    const box = entry.geometry.boundingBox!;
    const scale = new Vector3().setFromMatrixScale(entry.offset);
    radius = Math.max((box.max.x - box.min.x) * scale.x, (box.max.z - box.min.z) * scale.z) * 0.42;
    this.footprints.set(plantId, radius);
    return radius;
  }

  private varieties = new Map<string, PlantVariety>();
  private root = new Object3D();
  /** Rest-pose geometry per variety, used for plant colliders. */
  readonly colliderGeometry = new Map<string, { geometry: BufferGeometry; offset: Matrix4 }>();

  init(scene: Object3D): void {
    this.root.name = 'flowerbed-plants';
    scene.add(this.root);
    this.root.add(this.shadows.mesh);
  }

  variety(plantId: string): PlantVariety | null {
    let variety = this.varieties.get(plantId);
    if (variety) return variety;
    const gltf = AssetManager.getGLTF(`plant-${plantId}`);
    if (!gltf) return null;
    const template = buildTemplate(gltf.scene);
    if (!template) return null;
    variety = new PlantVariety(template, plantId);
    this.varieties.set(plantId, variety);
    this.colliderGeometry.set(plantId, {
      geometry: template.geometry,
      offset: template.meshOffset,
    });
    this.root.add(variety.group);
    return variety;
  }

  private eye = new Vector3();
  private forward = new Vector3();
  private binnedEye = new Vector3(Infinity, 0, 0);
  private binnedForward = new Vector3();

  /**
   * Per frame: re-bin every variety when the view moved 25 cm or turned 3
   * degrees (behind-view culling has a 10 degree margin), else only the
   * varieties whose plants changed.
   */
  update(camera: Object3D): void {
    camera.getWorldPosition(this.eye);
    camera.getWorldDirection(this.forward);
    const moved = this.eye.distanceToSquared(this.binnedEye) > 0.0625 || this.forward.dot(this.binnedForward) < 0.9986;
    if (moved) {
      this.binnedEye.copy(this.eye);
      this.binnedForward.copy(this.forward);
    }
    for (const variety of this.varieties.values()) variety.rebin(this.binnedEye, this.binnedForward, moved);
  }

  makeCollider(plantId: string): Mesh | null {
    const entry = this.colliderGeometry.get(plantId) ?? (this.variety(plantId), this.colliderGeometry.get(plantId));
    if (!entry) return null;
    const mesh = new Mesh(entry.geometry);
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}

export const plantMeshes = new PlantMeshes();
export type { PlantVariety };
