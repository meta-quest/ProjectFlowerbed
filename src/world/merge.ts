/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Merge static meshes that share a material into one world-space mesh, to
 * cut draw calls on the island (about 60 primitives become about 20).
 * Only position, normal and uv are kept, which is all the island shaders use.
 */

import { BufferAttribute, BufferGeometry, Matrix3, Mesh, Vector3, type Material, type Object3D } from '@iwsdk/core';

const v = new Vector3();
const normalMatrix = new Matrix3();

function mergeInto(meshes: Mesh[]): BufferGeometry {
  let vertices = 0;
  let indices = 0;
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    vertices += geometry.attributes.position.count;
    indices += geometry.index ? geometry.index.count : geometry.attributes.position.count;
  }
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const uvs = new Float32Array(vertices * 2);
  // Vertex colours matter: some island materials enable them.
  const colors = new Float32Array(vertices * 3).fill(1);
  const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  let vOffset = 0;
  let iOffset = 0;
  for (const mesh of meshes) {
    mesh.updateMatrixWorld(true);
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    const color = geometry.attributes.color;
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      positions.set([v.x, v.y, v.z], (vOffset + i) * 3);
      if (normal) {
        v.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
        normals.set([v.x, v.y, v.z], (vOffset + i) * 3);
      }
      if (uv) uvs.set([uv.getX(i), uv.getY(i)], (vOffset + i) * 2);
      if (color) colors.set([color.getX(i), color.getY(i), color.getZ(i)], (vOffset + i) * 3);
    }
    if (geometry.index) {
      for (let i = 0; i < geometry.index.count; i++) index[iOffset + i] = geometry.index.getX(i) + vOffset;
      iOffset += geometry.index.count;
    } else {
      for (let i = 0; i < position.count; i++) index[iOffset + i] = vOffset + i;
      iOffset += position.count;
    }
    vOffset += position.count;
  }
  const merged = new BufferGeometry();
  merged.setAttribute('position', new BufferAttribute(positions, 3));
  merged.setAttribute('normal', new BufferAttribute(normals, 3));
  merged.setAttribute('uv', new BufferAttribute(uvs, 2));
  merged.setAttribute('color', new BufferAttribute(colors, 3));
  merged.setIndex(new BufferAttribute(index, 1));
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/**
 * Replace the visible meshes under `root` that share a material with one
 * merged mesh each, added under `target`. Meshes with special render order
 * or skinning are left alone.
 */
export function mergeStaticMeshes(root: Object3D, target: Object3D): number {
  const groups = new Map<Material, Mesh[]>();
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !mesh.visible || (mesh as { isSkinnedMesh?: boolean }).isSkinnedMesh) return;
    if (Array.isArray(mesh.material) || !mesh.geometry.attributes.normal) return;
    // Meshes with a deliberate draw order (water, underwater terrain) stay as they are.
    if (mesh.renderOrder !== 0 || (mesh as { isInstancedMesh?: boolean }).isInstancedMesh) return;
    let visible = true;
    for (let p: Object3D | null = mesh; p; p = p.parent) if (!p.visible) visible = false;
    if (!visible) return;
    const list = groups.get(mesh.material) ?? [];
    list.push(mesh);
    groups.set(mesh.material, list);
  });
  let merged = 0;
  for (const [material, meshes] of groups) {
    if (meshes.length < 2) continue;
    const mesh = new Mesh(mergeInto(meshes), material);
    mesh.name = `merged:${material.name}`;
    mesh.castShadow = meshes.some((m) => m.castShadow);
    mesh.receiveShadow = meshes.some((m) => m.receiveShadow);
    mesh.renderOrder = meshes[0].renderOrder;
    target.add(mesh);
    for (const source of meshes) source.visible = false;
    merged += meshes.length - 1;
  }
  return merged;
}
