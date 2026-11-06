/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Mesh, PlaneGeometry, TorusGeometry, Vector3 } from '@iwsdk/core';
import { Layer, collisionWorld, createHit } from './colliders.js';

const added: Mesh[] = [];

/** A flat, upward-facing square collider at height `y`. */
function ground(y = 0, size = 10, layers: number = Layer.Teleport, owner: unknown = null): Mesh {
  const mesh = new Mesh(new PlaneGeometry(size, size));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  collisionWorld.add(mesh, layers, owner);
  added.push(mesh);
  return mesh;
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

afterEach(() => {
  for (const mesh of added.splice(0)) collisionWorld.remove(mesh);
});

describe('Layer', () => {
  it('uses distinct single-bit flags', () => {
    const values = Object.values(Layer);
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) expect(Math.log2(value) % 1).toBe(0);
  });
});

describe('raySegment', () => {
  it('hits a ground plane with point, distance, normal, layers and owner', () => {
    const mesh = ground(0, 10, Layer.Plantable, 'bed');
    const hit = createHit();
    expect(collisionWorld.raySegment(v(1, 5, 2), v(1, -5, 2), Layer.Plantable, hit)).toBe(true);
    expect(hit.point.x).toBeCloseTo(1);
    expect(hit.point.y).toBeCloseTo(0);
    expect(hit.point.z).toBeCloseTo(2);
    expect(hit.distance).toBeCloseTo(5);
    expect(hit.normal.y).toBeCloseTo(1);
    expect(hit).toMatchObject({ mesh, layers: Layer.Plantable, owner: 'bed' });
  });

  it('misses when the segment ends above the plane or passes beside it', () => {
    ground(0, 2);
    expect(collisionWorld.raySegment(v(0, 5, 0), v(0, 0.5, 0), Layer.Teleport, createHit())).toBe(false);
    expect(collisionWorld.raySegment(v(5, 5, 0), v(5, -5, 0), Layer.Teleport, createHit())).toBe(false);
  });

  it('ignores colliders outside the layer mask', () => {
    ground(0, 10, Layer.Obstacle);
    expect(collisionWorld.raySegment(v(0, 5, 0), v(0, -5, 0), Layer.Plant | Layer.Teleport, createHit())).toBe(false);
    expect(collisionWorld.raySegment(v(0, 5, 0), v(0, -5, 0), Layer.Obstacle | Layer.Plant, createHit())).toBe(true);
  });

  it('skips colliders carrying an excluded layer', () => {
    ground(0, 10, Layer.Teleport | Layer.Invisible);
    const hit = createHit();
    expect(collisionWorld.raySegment(v(0, 5, 0), v(0, -5, 0), Layer.Teleport, hit, Layer.Invisible)).toBe(false);
    expect(collisionWorld.raySegment(v(0, 5, 0), v(0, -5, 0), Layer.Teleport, hit)).toBe(true);
  });

  it('returns the nearest of several colliders', () => {
    ground(0, 10, Layer.Teleport, 'floor');
    ground(1, 10, Layer.Teleport, 'deck');
    const hit = createHit();
    collisionWorld.raySegment(v(0, 5, 0), v(0, -5, 0), Layer.Teleport, hit);
    expect(hit.owner).toBe('deck');
    expect(hit.distance).toBeCloseTo(4);
  });

  it('treats colliders as one-sided (a ray from below passes through)', () => {
    ground();
    expect(collisionWorld.raySegment(v(0, -5, 0), v(0, 5, 0), Layer.Teleport, createHit())).toBe(false);
  });

  it('rejects zero-length segments', () => {
    ground();
    expect(collisionWorld.raySegment(v(0, 0, 0), v(0, 0, 0), Layer.Teleport, createHit())).toBe(false);
  });

  it('transforms the hit normal into world space', () => {
    const wall = new Mesh(new PlaneGeometry(4, 4)); // faces +Z
    wall.position.z = -2;
    collisionWorld.add(wall, Layer.Obstacle);
    added.push(wall);
    const hit = createHit();
    expect(collisionWorld.raySegment(v(0, 0, 0), v(0, 0, -5), Layer.Obstacle, hit)).toBe(true);
    expect(hit.normal.z).toBeCloseTo(1);
    expect(hit.point.z).toBeCloseTo(-2);
  });
});

describe('collider registry', () => {
  it('stops hitting a removed collider', () => {
    const mesh = ground();
    collisionWorld.remove(mesh);
    expect(collisionWorld.raySegment(v(0, 5, 0), v(0, -5, 0), Layer.Teleport, createHit())).toBe(false);
  });

  it('ignores duplicate adds and unknown removes, and reports layers per mesh', () => {
    const before = collisionWorld.size;
    const mesh = ground();
    collisionWorld.add(mesh, Layer.Plant);
    expect(collisionWorld.size).toBe(before + 1);
    expect(collisionWorld.layersOf(mesh)).toBe(Layer.Teleport);
    const stranger = new Mesh(new PlaneGeometry());
    collisionWorld.remove(stranger);
    expect(collisionWorld.size).toBe(before + 1);
    expect(collisionWorld.layersOf(stranger)).toBe(0);
  });

  it('needs refresh() after a collider moves', () => {
    const mesh = ground(0, 2);
    mesh.position.x = 20;
    const from = v(20, 5, 0);
    const to = v(20, -5, 0);
    // Stale bounds still sit at the old place, so the moved collider is skipped.
    expect(collisionWorld.raySegment(from, to, Layer.Teleport, createHit())).toBe(false);
    collisionWorld.refresh(mesh);
    expect(collisionWorld.raySegment(from, to, Layer.Teleport, createHit())).toBe(true);
  });
});

describe('sphere queries', () => {
  it('collects owners of colliders in the mask that touch the sphere', () => {
    ground(0, 10, Layer.Plant, 'rose');
    ground(3, 10, Layer.Plant, 'oak');
    ground(0.1, 10, Layer.Obstacle, 'rock');
    const owners = new Set<unknown>();
    collisionWorld.sphereOwners(v(0, 0.05, 0), 0.1, Layer.Plant, owners);
    expect([...owners]).toEqual(['rose']);
  });

  it('tests the actual triangles, not just the bounding box', () => {
    // The hole of a torus is inside its bounds but touches no triangle.
    const ring = new Mesh(new TorusGeometry(1, 0.1, 8, 24));
    collisionWorld.add(ring, Layer.Plant, 'ring');
    added.push(ring);
    const owners = new Set<unknown>();
    collisionWorld.sphereOwners(v(0, 0, 0), 0.3, Layer.Plant, owners);
    expect(owners.size).toBe(0);
    expect(collisionWorld.sphereAny(v(0, 0, 0), 0.3, Layer.Plant)).toBe(false);
    collisionWorld.sphereOwners(v(1, 0, 0), 0.3, Layer.Plant, owners);
    expect([...owners]).toEqual(['ring']);
  });

  it('sphereAny honours mask and exclude', () => {
    ground(0, 10, Layer.Obstacle | Layer.Boundary);
    expect(collisionWorld.sphereAny(v(0, 0.05, 0), 0.1, Layer.Obstacle)).toBe(true);
    expect(collisionWorld.sphereAny(v(0, 0.05, 0), 0.1, Layer.Obstacle, Layer.Boundary)).toBe(false);
    expect(collisionWorld.sphereAny(v(0, 2, 0), 0.1, Layer.Obstacle)).toBe(false);
  });
});
