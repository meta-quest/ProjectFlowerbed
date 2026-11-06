/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Mesh, PlaneGeometry, Vector3 } from '@iwsdk/core';
import { ARC_SEGMENTS, RAY_STYLES, RayTube, castArc, castStraight, createArcResult } from './arc.js';
import { Layer, collisionWorld } from './colliders.js';

const GRAVITY = 9.8;
const added: Mesh[] = [];

function plane(layers: number, setup: (mesh: Mesh) => void, size = 200): Mesh {
  const mesh = new Mesh(new PlaneGeometry(size, size));
  setup(mesh);
  collisionWorld.add(mesh, layers);
  added.push(mesh);
  return mesh;
}

const ground = (layers: number = Layer.Teleport, y = 0) =>
  plane(layers, (mesh) => {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
  });

/** Horizontal distance where a projectile launched from height h lands on y = 0. */
function analyticRange(h: number, speed: number, pitch: number): number {
  const vx = speed * Math.cos(pitch);
  const vy = speed * Math.sin(pitch);
  const t = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * h)) / GRAVITY;
  return vx * t;
}

const forward = (pitch: number) => new Vector3(0, Math.sin(pitch), -Math.cos(pitch));

afterEach(() => {
  for (const mesh of added.splice(0)) collisionWorld.remove(mesh);
});

describe('castArc', () => {
  it('lands on the ground at the ballistic range for flat and raised throws', () => {
    ground();
    const out = createArcResult();
    const origin = new Vector3(0, 1.5, 0);
    for (const pitch of [0, Math.PI / 8, Math.PI / 4]) {
      expect(castArc(origin, forward(pitch), 5, Layer.Teleport, out), `pitch ${pitch}`).toBe(true);
      const landing = out.points[out.count - 1];
      expect(landing.y).toBeCloseTo(0, 4);
      expect(landing.x).toBeCloseTo(0, 6);
      expect(-landing.z, `pitch ${pitch}`).toBeCloseTo(analyticRange(1.5, 5, pitch), 1);
      expect(out.hitInfo.point.equals(landing)).toBe(true);
    }
  });

  it('starts at the origin and truncates the drawn points at the hit', () => {
    ground();
    const out = createArcResult();
    const origin = new Vector3(0.3, 1.2, -0.4);
    castArc(origin, forward(0), 4, Layer.Teleport, out);
    expect(out.points[0].equals(origin)).toBe(true);
    expect(out.count).toBeGreaterThan(2);
    expect(out.count).toBeLessThanOrEqual(ARC_SEGMENTS + 1);
    for (let i = 1; i < out.count; i++) expect(out.points[i].y).toBeLessThanOrEqual(out.points[i - 1].y + 1e-9);
  });

  it('reports the drawn portion of the full arc to y = -1', () => {
    ground();
    const out = createArcResult();
    castArc(new Vector3(0, 1.5, 0), forward(0), 5, Layer.Teleport, out);
    // Horizontal throw: time to fall 1.5 m over time to fall 2.5 m.
    expect(out.portion).toBeCloseTo(Math.sqrt(1.5 / 2.5), 2);
  });

  it('draws the full arc down to minY when nothing is hit', () => {
    const out = createArcResult();
    expect(castArc(new Vector3(0, 1.5, 0), forward(0.3), 5, Layer.Teleport, out)).toBe(false);
    expect(out).toMatchObject({ hit: false, count: ARC_SEGMENTS + 1, portion: 1 });
    expect(out.points[ARC_SEGMENTS].y).toBeCloseTo(-1, 6);
  });

  it('honours a custom minY that stops short of the ground', () => {
    ground();
    const out = createArcResult();
    expect(castArc(new Vector3(0, 1.5, 0), forward(0), 5, Layer.Teleport, out, 0.5)).toBe(false);
    expect(out.points[ARC_SEGMENTS].y).toBeCloseTo(0.5, 6);
  });

  it('ignores colliders outside the mask or in the exclude set', () => {
    ground(Layer.Obstacle | Layer.Invisible);
    const out = createArcResult();
    expect(castArc(new Vector3(0, 1.5, 0), forward(0), 5, Layer.Teleport, out)).toBe(false);
    expect(castArc(new Vector3(0, 1.5, 0), forward(0), 5, Layer.Obstacle, out, -1, Layer.Invisible)).toBe(false);
    expect(castArc(new Vector3(0, 1.5, 0), forward(0), 5, Layer.Obstacle, out)).toBe(true);
  });

  it('stops at a wall in front of the landing spot', () => {
    ground(Layer.Teleport);
    plane(Layer.Teleport, (mesh) => (mesh.position.z = -1), 20); // faces the thrower
    const out = createArcResult();
    castArc(new Vector3(0, 1.5, 0), forward(0), 5, Layer.Teleport, out);
    expect(out.hitInfo.point.z).toBeCloseTo(-1, 4);
    expect(out.hitInfo.point.y).toBeGreaterThan(0);
    expect(out.hitInfo.normal.z).toBeCloseTo(1);
  });
});

describe('castStraight', () => {
  it('hits within range with the hit fraction, else draws the full segment', () => {
    ground(Layer.Plant);
    const out = createArcResult();
    expect(castStraight(new Vector3(0, 1, 0), new Vector3(0, -1, 0), 2, Layer.Plant, out)).toBe(true);
    expect(out.count).toBe(2);
    expect(out.points[1].y).toBeCloseTo(0);
    expect(out.portion).toBeCloseTo(0.5);
    expect(castStraight(new Vector3(0, 1, 0), new Vector3(0, -1, 0), 0.5, Layer.Plant, out)).toBe(false);
    expect(out.points[1].y).toBeCloseTo(0.5);
    expect(out.portion).toBe(1);
  });
});

describe('RayTube', () => {
  const straight = (length: number) => [new Vector3(0, 0, 0), new Vector3(0, 0, -length)];

  it('builds rings of the styled radius around the path, hiding below two points', () => {
    const tube = new RayTube(4, RAY_STYLES.remove);
    tube.update(straight(2), 1);
    expect(tube.visible).toBe(false);
    tube.update(straight(2), 2);
    expect(tube.visible).toBe(true);
    const position = tube.geometry.attributes.position;
    const radius = RAY_STYLES.remove.radius();
    for (let i = 0; i < position.count; i++) {
      expect(Math.hypot(position.getX(i), position.getY(i))).toBeCloseTo(radius, 5);
      expect(position.getZ(i)).toBeLessThanOrEqual(1e-6);
      expect(position.getZ(i)).toBeGreaterThanOrEqual(-2 - 1e-6);
    }
    const aT = tube.geometry.attributes.aT;
    expect(aT.getX(0)).toBe(0);
    expect(aT.getX(aT.count - 1)).toBe(1);
  });

  it('draws only the styled span of the path', () => {
    const tube = new RayTube(4, RAY_STYLES.planting); // span 0.5
    tube.update(straight(2), 2);
    const position = tube.geometry.attributes.position;
    let minZ = 0;
    for (let i = 0; i < position.count; i++) minZ = Math.min(minZ, position.getZ(i));
    expect(minZ).toBeCloseTo(-1, 5);
  });

  it('widens the water stream along its length', () => {
    const tube = new RayTube(4, RAY_STYLES.water);
    tube.update(straight(1), 2);
    const position = tube.geometry.attributes.position;
    const ringRadius = (ring: number) => Math.hypot(position.getX(ring * 8), position.getY(ring * 8));
    expect(ringRadius(4)).toBeGreaterThan(ringRadius(0));
    expect(ringRadius(0)).toBeCloseTo(RAY_STYLES.water.radius(0), 5);
  });

  it('switches style and colour in place', () => {
    const tube = new RayTube(4, RAY_STYLES.teleport);
    const material = tube.material as unknown as { uniforms: { uColor: { value: { getHex(): number } } } };
    tube.setStyle(RAY_STYLES.teleportBlocked);
    expect(material.uniforms.uColor.value.getHex()).toBe(RAY_STYLES.teleportBlocked.color);
    tube.setColor(0x123456);
    expect(material.uniforms.uColor.value.getHex()).toBe(0x123456);
  });
});

describe('RAY_STYLES', () => {
  it('use ordered gradient stops and positive radii', () => {
    for (const [name, style] of Object.entries(RAY_STYLES)) {
      const [a, b, c, d] = style.gradient;
      expect(a <= b && b <= c && c <= d, name).toBe(true);
      expect(style.radius(0), name).toBeGreaterThan(0);
      expect(style.radius(1), name).toBeGreaterThan(0);
      expect(style.opacity, name).toBeGreaterThan(0);
      expect(style.opacity, name).toBeLessThanOrEqual(1);
    }
  });
});
