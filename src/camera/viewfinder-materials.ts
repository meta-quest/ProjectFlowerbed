/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Camera, Material, Mesh, Object3D, WebGLRenderer } from '@iwsdk/core';

/**
 * Stand-in materials for the camera's viewfinder pass.
 *
 * On Quest the eyes render with multiview and the viewfinder renders to a plain
 * target. three keeps one program per material and the view count is part of
 * it, so drawing the same materials in both passes switches every material's
 * program twice per viewfinder frame (a full program lookup each time:
 * getParameters + getProgramCacheKey). Profiled on a Quest 3 that was ~13% of
 * the main thread in camera mode, and camera mode fell to ~55 fps.
 *
 * The viewfinder draws stand-ins instead, which three tracks as separate
 * materials with their own non-multiview programs. A stand-in is a flat copy of
 * its material (same class, same own properties in the same order, so the JS
 * engine treats both alike): objects such as colours, textures, uniforms and
 * defines are shared, so changes to them show at once, and the plain fields
 * (opacity, side, version, ...) are copied again before every viewfinder render.
 * That also undoes three's own writes to the stand-in while drawing it.
 */

interface StandIn {
  view: Material;
  keys: string[];
}

const standIns = new WeakMap<Material, StandIn>();
const arrayStandIns = new WeakMap<Material[], Material[]>();
/** Mesh, its own material(s), mesh, ... for the swap back (reused, no per-frame allocation). */
const swapped: unknown[] = [];
let passLayers: Camera['layers'] | null = null;

function standIn(material: Material): Material {
  let entry = standIns.get(material);
  if (!entry) {
    const view = Object.create(Object.getPrototypeOf(material)) as Material;
    // Its material's id, defined first as three's constructor does: three skips
    // re-uploading uniforms between draws of the same id, so stand-ins of
    // different materials must differ. Then its own listener table (three
    // registers a dispose handler per material).
    Object.defineProperty(view, 'id', { value: (material as unknown as { id: number }).id });
    Object.assign(view, material);
    (view as unknown as { _listeners?: unknown })._listeners = undefined;
    material.addEventListener('dispose', () => view.dispose());
    entry = { view, keys: Object.keys(material).filter((key) => key !== '_listeners') };
    standIns.set(material, entry);
  } else {
    const from = material as unknown as Record<string, unknown>;
    const to = entry.view as unknown as Record<string, unknown>;
    for (const key of entry.keys) to[key] = from[key];
  }
  return entry.view;
}

function standInArray(materials: Material[]): Material[] {
  let views = arrayStandIns.get(materials);
  if (!views) {
    views = materials.map(standIn);
    arrayStandIns.set(materials, views);
  } else for (const material of materials) standIn(material);
  return views;
}

function swapIn(object: Object3D): void {
  const mesh = object as Mesh;
  if (!mesh.material || !object.layers.test(passLayers!)) return;
  swapped.push(mesh, mesh.material);
  mesh.material = Array.isArray(mesh.material) ? standInArray(mesh.material) : standIn(mesh.material);
}

/** Render `scene` from `camera` into the current target, every mesh drawing through its stand-in. */
export function renderWithStandIns(renderer: WebGLRenderer, scene: Object3D, camera: Camera): void {
  passLayers = camera.layers;
  scene.traverseVisible(swapIn);
  try {
    renderer.render(scene, camera);
  } finally {
    passLayers = null;
    for (let i = 0; i < swapped.length; i += 2) (swapped[i] as Mesh).material = swapped[i + 1] as Material;
    swapped.length = 0;
  }
}
