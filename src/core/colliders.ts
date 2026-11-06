/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Gameplay collision world: the invisible collider meshes authored in the
 * island and prop glTFs (`extras.collider`), tagged with legacy layers, plus
 * runtime plant colliders.
 *
 * Raycasts use three-mesh-bvh (installed by IWSDK on Mesh.raycast) against
 * world-space collider meshes kept out of the render graph.
 */

import { Box3, Matrix4, Mesh, Raycaster, Sphere, Vector3, type Intersection, type Object3D } from '@iwsdk/core';

export const Layer = {
  Plant: 1 << 0,
  Obstacle: 1 << 1,
  Boundary: 1 << 2,
  Invisible: 1 << 3,
  Teleport: 1 << 4,
  Plantable: 1 << 5,
} as const;

export interface ColliderHit {
  point: Vector3;
  normal: Vector3;
  distance: number;
  mesh: Mesh;
  layers: number;
  /** Owner tag (e.g. a plant entity index) for runtime colliders. */
  owner: unknown;
}

interface ColliderRecord {
  mesh: Mesh;
  layers: number;
  owner: unknown;
  bounds: Box3;
}

const raycaster = new Raycaster();
const tmpHits: Intersection[] = [];
const tmpSphere = new Sphere();
const tmpLocal = new Sphere();
const tmpInverse = new Matrix4();
const segDir = new Vector3();

class CollisionWorld {
  private records: ColliderRecord[] = [];
  private byMesh = new Map<Mesh, ColliderRecord>();

  /** Register a collider mesh. Its world matrix must be current. */
  add(mesh: Mesh, layers: number, owner: unknown = null): void {
    if (this.byMesh.has(mesh)) return;
    const geometry = mesh.geometry;
    if (!geometry.boundsTree) geometry.computeBoundsTree();
    mesh.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(mesh);
    const record = { mesh, layers, owner, bounds };
    this.records.push(record);
    this.byMesh.set(mesh, record);
  }

  remove(mesh: Mesh): void {
    const record = this.byMesh.get(mesh);
    if (!record) return;
    this.byMesh.delete(mesh);
    this.records.splice(this.records.indexOf(record), 1);
  }

  /** Refresh bounds after a collider moved or scaled. */
  refresh(mesh: Mesh): void {
    const record = this.byMesh.get(mesh);
    if (!record) return;
    mesh.updateMatrixWorld(true);
    record.bounds.setFromObject(mesh);
  }

  layersOf(mesh: Object3D): number {
    return this.byMesh.get(mesh as Mesh)?.layers ?? 0;
  }

  /** Nearest hit along a segment against colliders having any of `mask`. */
  raySegment(from: Vector3, to: Vector3, mask: number, out: ColliderHit, exclude = 0): boolean {
    segDir.subVectors(to, from);
    const length = segDir.length();
    if (length < 1e-6) return false;
    segDir.divideScalar(length);
    raycaster.set(from, segDir);
    raycaster.near = 0;
    raycaster.far = length;
    raycaster.firstHitOnly = true;
    let best: Intersection | null = null;
    let bestRecord: ColliderRecord | null = null;
    for (const record of this.records) {
      if ((record.layers & mask) === 0 || (record.layers & exclude) !== 0) continue;
      if (!raycaster.ray.intersectsBox(record.bounds)) continue;
      tmpHits.length = 0;
      record.mesh.raycast(raycaster, tmpHits);
      for (const hit of tmpHits) {
        if (hit.distance <= length && (!best || hit.distance < best.distance)) {
          best = hit;
          bestRecord = record;
        }
      }
    }
    if (!best || !bestRecord) return false;
    out.point.copy(best.point);
    if (best.face) {
      out.normal.copy(best.face.normal).transformDirection(bestRecord.mesh.matrixWorld);
    } else {
      out.normal.set(0, 1, 0);
    }
    out.distance = best.distance;
    out.mesh = bestRecord.mesh;
    out.layers = bestRecord.layers;
    out.owner = bestRecord.owner;
    return true;
  }

  /** Owners of colliders in `mask` whose bounds touch the sphere. */
  sphereOwners(center: Vector3, radius: number, mask: number, out: Set<unknown>): void {
    tmpSphere.set(center, radius);
    for (const record of this.records) {
      if ((record.layers & mask) === 0) continue;
      if (!record.bounds.intersectsSphere(tmpSphere)) continue;
      const tree = record.mesh.geometry.boundsTree;
      if (tree) {
        // Test in the collider's local space.
        tmpInverse.copy(record.mesh.matrixWorld).invert();
        tmpLocal.copy(tmpSphere).applyMatrix4(tmpInverse);
        if (!(tree as unknown as { intersectsSphere(s: Sphere): boolean }).intersectsSphere(tmpLocal)) continue;
      }
      out.add(record.owner);
    }
  }

  /** Whether any collider in `mask` (and none of `exclude`) touches the sphere. */
  sphereAny(center: Vector3, radius: number, mask: number, exclude = 0): boolean {
    tmpSphere.set(center, radius);
    for (const record of this.records) {
      if ((record.layers & mask) === 0 || (record.layers & exclude) !== 0) continue;
      if (!record.bounds.intersectsSphere(tmpSphere)) continue;
      const tree = record.mesh.geometry.boundsTree as unknown as { intersectsSphere(s: Sphere): boolean } | undefined;
      if (!tree) return true;
      tmpInverse.copy(record.mesh.matrixWorld).invert();
      tmpLocal.copy(tmpSphere).applyMatrix4(tmpInverse);
      if (tree.intersectsSphere(tmpLocal)) return true;
    }
    return false;
  }

  get size(): number {
    return this.records.length;
  }
}

export const collisionWorld = new CollisionWorld();

export function createHit(): ColliderHit {
  return {
    point: new Vector3(),
    normal: new Vector3(),
    distance: 0,
    mesh: null as unknown as Mesh,
    layers: 0,
    owner: null,
  };
}
