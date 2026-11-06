/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
} from '@iwsdk/core';
import { mergeStaticMeshes } from './merge.js';

function box(material: MeshBasicMaterial, x = 0): Mesh {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), material);
  mesh.position.x = x;
  return mesh;
}

const merged = (target: Object3D) => target.children as Mesh[];

describe('mergeStaticMeshes', () => {
  it('merges visible meshes that share a material into one mesh', () => {
    const material = new MeshBasicMaterial({ name: 'stone' });
    const root = new Group();
    const parts = [box(material, 0), box(material, 2), box(material, 4)];
    root.add(...parts);
    const target = new Group();
    expect(mergeStaticMeshes(root, target)).toBe(2); // three draw calls became one
    expect(merged(target)).toHaveLength(1);
    expect(merged(target)[0].material).toBe(material);
    expect(merged(target)[0].name).toBe('merged:stone');
    for (const part of parts) expect(part.visible).toBe(false);
  });

  it('bakes world transforms into the merged vertices and offsets indices', () => {
    const material = new MeshBasicMaterial();
    const root = new Group();
    root.position.y = 10;
    root.add(box(material, -3), box(material, 3));
    const target = new Group();
    mergeStaticMeshes(root, target);
    const geometry = merged(target)[0].geometry;
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.toArray()).toEqual([-3.5, 9.5, -0.5]);
    expect(geometry.boundingBox!.max.toArray()).toEqual([3.5, 10.5, 0.5]);
    const vertices = geometry.attributes.position.count;
    expect(vertices).toBe(48);
    const index = geometry.index!;
    expect(index.count).toBe(72);
    let maxIndex = 0;
    for (let i = 0; i < index.count; i++) maxIndex = Math.max(maxIndex, index.getX(i));
    expect(maxIndex).toBe(vertices - 1);
  });

  it('rotates normals with the mesh', () => {
    const material = new MeshBasicMaterial();
    const root = new Group();
    const a = new Mesh(new PlaneGeometry(), material); // normal +Z
    const b = new Mesh(new PlaneGeometry(), material);
    b.rotation.x = -Math.PI / 2; // normal +Y
    root.add(a, b);
    const target = new Group();
    mergeStaticMeshes(root, target);
    const normal = merged(target)[0].geometry.attributes.normal;
    const last = new Vector3().fromBufferAttribute(normal, normal.count - 1);
    expect(last.y).toBeCloseTo(1);
    expect(new Vector3().fromBufferAttribute(normal, 0).z).toBeCloseTo(1);
  });

  it('keeps a lone mesh and different materials separate', () => {
    const root = new Group();
    root.add(box(new MeshBasicMaterial()), box(new MeshBasicMaterial()));
    const target = new Group();
    expect(mergeStaticMeshes(root, target)).toBe(0);
    expect(target.children).toHaveLength(0);
    for (const child of root.children) expect(child.visible).toBe(true);
  });

  it('leaves hidden, ordered, instanced and normal-less meshes alone', () => {
    const material = new MeshBasicMaterial();
    const root = new Group();
    const hidden = box(material);
    hidden.visible = false;
    const hiddenParent = new Group();
    hiddenParent.visible = false;
    hiddenParent.add(box(material));
    const ordered = box(material);
    ordered.renderOrder = 5;
    const instanced = new InstancedMesh(new BoxGeometry(), material, 2);
    const noNormals = new BufferGeometry();
    noNormals.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
    root.add(hidden, hiddenParent, ordered, instanced, new Mesh(noNormals, material), box(material));
    const target = new Group();
    expect(mergeStaticMeshes(root, target)).toBe(0);
    expect(ordered.visible).toBe(true);
    expect(instanced.visible).toBe(true);
  });

  it('carries shadow flags over to the merged mesh', () => {
    const material = new MeshBasicMaterial();
    const root = new Group();
    const a = box(material);
    a.castShadow = true;
    const b = box(material);
    b.receiveShadow = true;
    root.add(a, b);
    const target = new Group();
    mergeStaticMeshes(root, target);
    expect(merged(target)[0]).toMatchObject({ castShadow: true, receiveShadow: true });
  });

  it('defaults vertex colours to white and keeps existing ones', () => {
    const material = new MeshBasicMaterial();
    const tinted = box(material);
    const count = tinted.geometry.attributes.position.count;
    tinted.geometry.setAttribute('color', new BufferAttribute(new Float32Array(count * 3).fill(0.5), 3));
    const root = new Group();
    root.add(box(material), tinted);
    const target = new Group();
    mergeStaticMeshes(root, target);
    const color = merged(target)[0].geometry.attributes.color;
    expect(color.getX(0)).toBe(1);
    expect(color.getX(color.count - 1)).toBe(0.5);
  });
});
