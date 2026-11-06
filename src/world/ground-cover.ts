/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Ground cover (new): grass tufts scattered over the island's lawns, built
 * for Quest's tile-based GPU:
 * - one InstancedMesh for the whole island (one draw call);
 * - opaque triangle blades, no texture and no alpha test, so hidden pixels
 *   are rejected early instead of overdrawn;
 * - cheap Lambert shading with a vertex-colour gradient and no shadow receive;
 * - wind in the vertex shader (blades have a mid vertex so they bend);
 * - only tufts within ~22 m of the player are in the instance buffer
 *   (rebuilt on the CPU when the player has moved 2 m), and within that
 *   they shrink to their root between 14 and 20 m, so far grass costs nothing.
 */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type Mesh,
  type Object3D,
} from '@iwsdk/core';
import { Layer, collisionWorld, createHit } from '../core/colliders.js';

const COUNT = 9000;
/** Tufts within this distance are uploaded; the shader fades them out by 20 m. */
const NEAR = 22;
/** Re-select near tufts after the player moves this far. */
const REFRESH = 2;
/** Gardens occupy the island's middle; distant hills stay clean. */
const CENTER = new Vector3(4, 0, 14);
const RADIUS = 46;
/** Blades per tuft (3 triangles each). */
const BLADES = 4;
export const groundCoverTime = { value: 0 };

/**
 * One tuft, 1 m tall in model space with its pivot at the root: BLADES
 * tapered blades fanned around the centre. Each blade has a base pair, a
 * mid pair and a tip (3 triangles) so wind can curve it.
 */
function tuftGeometry(): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const root = [0.16, 0.27, 0.09];
  const tip = [0.62, 0.78, 0.36];
  for (let b = 0; b < BLADES; b++) {
    const angle = (b / BLADES) * Math.PI * 2 + b * 0.7;
    const out = 0.06 + (b % 2) * 0.05;
    const ox = Math.cos(angle) * out;
    const oz = Math.sin(angle) * out;
    // Blade faces across its lean direction.
    const wx = -Math.sin(angle) * 0.045;
    const wz = Math.cos(angle) * 0.045;
    const lean = 0.18 + (b % 3) * 0.08;
    const height = 0.75 + ((b * 37) % 25) / 100;
    const lx = Math.cos(angle) * lean;
    const lz = Math.sin(angle) * lean;
    const first = positions.length / 3;
    positions.push(
      ox - wx,
      0,
      oz - wz,
      ox + wx,
      0,
      oz + wz,
      ox + lx * 0.35 - wx * 0.6,
      height * 0.55,
      oz + lz * 0.35 - wz * 0.6,
      ox + lx * 0.35 + wx * 0.6,
      height * 0.55,
      oz + lz * 0.35 + wz * 0.6,
      ox + lx,
      height,
      oz + lz,
    );
    const mid = root.map((r, i) => r + (tip[i] - r) * 0.55);
    colors.push(...root, ...root, ...mid, ...mid, ...tip);
    index.push(first, first + 1, first + 3, first, first + 3, first + 2, first + 2, first + 3, first + 4);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  // Normals point up so tufts light like the lawn beneath them.
  const normals = new Float32Array(positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setIndex(index);
  return geometry;
}

/** Scatter tufts over `lawns` (visible grass meshes), avoiding paths. */
export function createGroundCover(lawns: Mesh[], parent: Object3D): InstancedMesh | null {
  if (lawns.length === 0) return null;
  // Area-weighted triangle sampling across all lawn meshes.
  // `area` holds the running total, for binary-search sampling.
  const triangles: { a: Vector3; b: Vector3; c: Vector3; area: number }[] = [];
  let total = 0;
  for (const lawn of lawns) {
    lawn.updateMatrixWorld(true);
    const position = lawn.geometry.attributes.position;
    const index = lawn.geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 3) {
      const ia = index ? index.getX(i) : i;
      const ib = index ? index.getX(i + 1) : i + 1;
      const ic = index ? index.getX(i + 2) : i + 2;
      const a = new Vector3().fromBufferAttribute(position, ia).applyMatrix4(lawn.matrixWorld);
      const b = new Vector3().fromBufferAttribute(position, ib).applyMatrix4(lawn.matrixWorld);
      const c = new Vector3().fromBufferAttribute(position, ic).applyMatrix4(lawn.matrixWorld);
      const area = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).length() / 2;
      if (area < 1e-4) continue;
      const cx = (a.x + b.x + c.x) / 3 - CENTER.x;
      const cz = (a.z + b.z + c.z) / 3 - CENTER.z;
      if (cx * cx + cz * cz > RADIUS * RADIUS) continue;
      total += area;
      triangles.push({ a, b, c, area: total });
    }
  }
  const material = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = groundCoverTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute vec3 aTint;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb *= aTint;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 worldBase = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        // Wind: a slow wave across the lawn, curving blades (stronger near tips).
        float bend = position.y * position.y;
        float wave = sin(uTime * 1.4 + worldBase.x * 0.45 + worldBase.z * 0.3);
        float gust = sin(uTime * 0.6 + worldBase.x * 0.11) * 0.5 + 0.5;
        transformed.x += (0.10 + 0.08 * gust) * wave * bend;
        transformed.z += 0.06 * wave * bend;
        // Collapse to the root between 14 and 20 m: zero-area, never shaded.
        float fade = 1.0 - smoothstep(14.0, 20.0, distance(worldBase.xyz, cameraPosition));
        transformed *= fade;`,
      );
  };
  material.customProgramCacheKey = () => 'flowerbed-ground-cover-blades';

  const matrices: Matrix4[] = [];
  const tints: number[] = [];
  const quat = new Quaternion();
  const scale = new Vector3();
  const point = new Vector3();
  const hit = createHit();
  const from = new Vector3();
  const to = new Vector3();
  const color = new Color();
  for (let attempt = 0; attempt < COUNT * 3 && matrices.length < COUNT; attempt++) {
    const pick = Math.random() * total;
    let lo = 0;
    let hi = triangles.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (triangles[mid].area < pick) lo = mid + 1;
      else hi = mid;
    }
    const tri = triangles[lo];
    let u = Math.random();
    let w = Math.random();
    if (u + w > 1) {
      u = 1 - u;
      w = 1 - w;
    }
    edgeB.subVectors(tri.b, tri.a);
    edgeC.subVectors(tri.c, tri.a);
    point.copy(tri.a).addScaledVector(edgeB, u).addScaledVector(edgeC, w);
    // Skip paths, stairs and anything that is not plain lawn underfoot.
    from.set(point.x, point.y + 2, point.z);
    to.set(point.x, point.y - 1, point.z);
    if (collisionWorld.raySegment(from, to, Layer.Obstacle, hit)) {
      if (!(hit.layers & Layer.Plantable) || /road|stone|stair|planter|circular|long_/i.test(hit.mesh.name)) continue;
      point.y = hit.point.y;
    }
    quat.setFromAxisAngle(UP, Math.random() * Math.PI * 2);
    const s = 0.24 + Math.random() * 0.22;
    scale.set(s, s * (0.8 + Math.random() * 0.6), s);
    matrices.push(new Matrix4().compose(point, quat, scale));
    color.setHSL(0.22 + Math.random() * 0.08, 0.3, 0.78 + Math.random() * 0.22);
    tints.push(color.r, color.g, color.b);
  }

  // Keep every tuft on the CPU; the GPU buffer only ever holds the near set.
  all.matrices = new Float32Array(matrices.length * 16);
  all.tints = new Float32Array(tints);
  all.x = new Float32Array(matrices.length);
  all.z = new Float32Array(matrices.length);
  matrices.forEach((m, i) => {
    m.toArray(all.matrices, i * 16);
    all.x[i] = m.elements[12];
    all.z[i] = m.elements[14];
  });
  const capacity = Math.min(matrices.length, NEAR_CAPACITY);
  const mesh = new InstancedMesh(tuftGeometry(), material, capacity);
  mesh.geometry.setAttribute('aTint', new InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
  mesh.count = 0;
  mesh.name = 'ground-cover';
  // Culling is done by the near-set selection and the shader fade.
  mesh.frustumCulled = false;
  parent.add(mesh);
  all.mesh = mesh;
  return mesh;
}

/** Upper bound of tufts uploaded at once (the near disc holds far fewer). */
const NEAR_CAPACITY = 4000;

const all = {
  mesh: null as InstancedMesh | null,
  matrices: new Float32Array(0),
  tints: new Float32Array(0),
  x: new Float32Array(0),
  z: new Float32Array(0),
  lastX: Infinity,
  lastZ: Infinity,
};

/**
 * Per frame (cheap check): once the viewer has moved REFRESH metres, copy
 * the tufts within NEAR into the instance buffer. No allocation.
 */
export function updateGroundCover(viewer: Vector3): void {
  const mesh = all.mesh;
  if (!mesh) return;
  const dx = viewer.x - all.lastX;
  const dz = viewer.z - all.lastZ;
  if (dx * dx + dz * dz < REFRESH * REFRESH) return;
  all.lastX = viewer.x;
  all.lastZ = viewer.z;
  const matrices = mesh.instanceMatrix.array as Float32Array;
  const tints = (mesh.geometry.attributes.aTint as InstancedBufferAttribute).array as Float32Array;
  const capacity = mesh.instanceMatrix.count;
  let n = 0;
  for (let i = 0; i < all.x.length && n < capacity; i++) {
    const tx = all.x[i] - viewer.x;
    const tz = all.z[i] - viewer.z;
    if (tx * tx + tz * tz > NEAR * NEAR) continue;
    matrices.set(all.matrices.subarray(i * 16, i * 16 + 16), n * 16);
    tints.set(all.tints.subarray(i * 3, i * 3 + 3), n * 3);
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.clearUpdateRanges();
  mesh.instanceMatrix.addUpdateRange(0, n * 16);
  mesh.instanceMatrix.needsUpdate = true;
  const tintAttribute = mesh.geometry.attributes.aTint as InstancedBufferAttribute;
  tintAttribute.clearUpdateRanges();
  tintAttribute.addUpdateRange(0, n * 3);
  tintAttribute.needsUpdate = true;
}

const UP = new Vector3(0, 1, 0);
const edgeB = new Vector3();
const edgeC = new Vector3();
