/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Ballistic arcs and the glowing tube that draws them.
 *
 * `castArc` reproduces the legacy CurvedRaycaster: a parabola from the
 * controller (v0 = dir * speed, g = -9.8) down to world y = -1, split into
 * ten segments and tested against the collision world. `RayTube` is an
 * allocation-free tube whose radius and alpha vary along its length (the
 * legacy canvas-gradient rays), shared by planting, watering, teleport and
 * the Remove tool.
 */

import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Mesh, ShaderMaterial, Vector3 } from '@iwsdk/core';
import { collisionWorld, createHit, type ColliderHit } from './colliders.js';

export const ARC_SEGMENTS = 10;
const GRAVITY = -9.8;

export interface ArcResult {
  /** Points along the arc, truncated at the hit (count = `count`). */
  points: Vector3[];
  count: number;
  hit: boolean;
  hitInfo: ColliderHit;
  /** Fraction of the full arc that was drawn (legacy renderedPortion). */
  portion: number;
}

export function createArcResult(): ArcResult {
  return {
    points: Array.from({ length: ARC_SEGMENTS + 2 }, () => new Vector3()),
    count: 0,
    hit: false,
    hitInfo: createHit(),
    portion: 1,
  };
}

const full = Array.from({ length: ARC_SEGMENTS + 1 }, () => new Vector3());

/** Sample the full parabola into `full` and return the point count. */
function sampleArc(origin: Vector3, direction: Vector3, speed: number, minY: number): void {
  const vy = direction.y * speed;
  const disc = Math.max(0.001, vy * vy - 4 * (GRAVITY / 2) * (origin.y - minY));
  const maxT = (-vy - Math.sqrt(disc)) / GRAVITY;
  const dt = maxT / ARC_SEGMENTS;
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const t = dt * i;
    full[i].set(
      origin.x + direction.x * speed * t,
      origin.y + vy * t + 0.5 * GRAVITY * t * t,
      origin.z + direction.z * speed * t,
    );
  }
}

/** Cast an arc against colliders in `mask`; returns whether it hit. */
export function castArc(
  origin: Vector3,
  direction: Vector3,
  speed: number,
  mask: number,
  out: ArcResult,
  minY = -1,
  exclude = 0,
): boolean {
  sampleArc(origin, direction, speed, minY);
  out.points[0].copy(full[0]);
  for (let i = 0; i < ARC_SEGMENTS; i++) {
    if (collisionWorld.raySegment(full[i], full[i + 1], mask, out.hitInfo, exclude)) {
      out.points[i + 1].copy(out.hitInfo.point);
      out.count = i + 2;
      out.hit = true;
      const segLength = full[i].distanceTo(full[i + 1]);
      out.portion = (i + out.hitInfo.point.distanceTo(full[i]) / segLength) / ARC_SEGMENTS;
      return true;
    }
    out.points[i + 1].copy(full[i + 1]);
  }
  out.count = ARC_SEGMENTS + 1;
  out.hit = false;
  out.portion = 1;
  return false;
}

/** Straight segment cast (Remove tool, seedbox pointing). */
export function castStraight(
  origin: Vector3,
  direction: Vector3,
  length: number,
  mask: number,
  out: ArcResult,
): boolean {
  out.points[0].copy(origin);
  out.points[1].copy(origin).addScaledVector(direction, length);
  out.count = 2;
  out.hit = collisionWorld.raySegment(out.points[0], out.points[1], mask, out.hitInfo);
  if (out.hit) out.points[1].copy(out.hitInfo.point);
  out.portion = out.hit ? out.hitInfo.distance / length : 1;
  return out.hit;
}

export interface TubeStyle {
  color: number;
  opacity: number;
  /** Radius at t (0 = start, 1 = end of drawn portion). */
  radius: (t: number) => number;
  /** Alpha gradient stops: transparent until a, opaque b..c, transparent by d. */
  gradient: [number, number, number, number];
  /** Fraction of the path to draw (legacy SPAN_OVERRIDE). */
  span?: number;
  glow?: boolean;
}

const RADIAL = 8;

/** A tube following a polyline, rebuilt in place each frame. */
export class RayTube extends Mesh {
  private readonly segments: number;
  private readonly positions: Float32Array;
  private readonly params: Float32Array;
  private readonly uniforms;
  private style: TubeStyle;
  private sample = new Vector3();
  private next = new Vector3();
  private tangent = new Vector3();
  private normal = new Vector3();
  private binormal = new Vector3();
  private lengths: number[] = [];

  constructor(segments: number, style: TubeStyle) {
    const ringCount = segments + 1;
    const positions = new Float32Array(ringCount * RADIAL * 3);
    const params = new Float32Array(ringCount * RADIAL);
    const index: number[] = [];
    for (let s = 0; s < segments; s++) {
      for (let r = 0; r < RADIAL; r++) {
        const a = s * RADIAL + r;
        const b = s * RADIAL + ((r + 1) % RADIAL);
        const c = a + RADIAL;
        const d = b + RADIAL;
        index.push(a, c, b, b, c, d);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aT', new BufferAttribute(params, 1));
    geometry.setIndex(index);
    const uniforms = {
      uColor: { value: new Color(style.color) },
      uOpacity: { value: style.opacity },
      uGradient: { value: style.gradient.slice() },
    };
    const material = new ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      ...(style.glow ? { blending: AdditiveBlending } : {}),
      vertexShader: /* glsl */ `
        attribute float aT;
        varying float vT;
        void main() {
          vT = aT;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uGradient[4];
        varying float vT;
        void main() {
          float a = smoothstep(uGradient[0], max(uGradient[1], uGradient[0] + 1e-4), vT)
                  * (1.0 - smoothstep(uGradient[2], max(uGradient[3], uGradient[2] + 1e-4), vT));
          gl_FragColor = vec4(uColor, a * uOpacity);
          #include <colorspace_fragment>
        }`,
    });
    super(geometry, material);
    this.segments = segments;
    this.positions = positions;
    this.params = params;
    this.uniforms = uniforms;
    this.style = style;
    this.frustumCulled = false;
    this.renderOrder = 999;
    this.matrixAutoUpdate = false;
    this.visible = false;
  }

  setStyle(style: TubeStyle): void {
    this.style = style;
    this.uniforms.uColor.value.set(style.color);
    this.uniforms.uOpacity.value = style.opacity;
    this.uniforms.uGradient.value = style.gradient.slice();
  }

  setColor(color: number): void {
    this.uniforms.uColor.value.set(color);
  }

  /** Rebuild along `points[0..count)`; `portion` scales the radius curve. */
  update(points: Vector3[], count: number, portion = 1): void {
    if (count < 2) {
      this.visible = false;
      return;
    }
    this.visible = true;
    // Cumulative lengths for arc-length parameterization.
    this.lengths.length = count;
    this.lengths[0] = 0;
    for (let i = 1; i < count; i++) {
      this.lengths[i] = this.lengths[i - 1] + points[i].distanceTo(points[i - 1]);
    }
    const total = this.lengths[count - 1] * (this.style.span ?? 1);
    for (let s = 0; s <= this.segments; s++) {
      const t = s / this.segments;
      this.pointAt(points, count, t * total, this.sample);
      this.pointAt(points, count, Math.min(t * total + 0.01, total + 0.01), this.next);
      this.tangent.subVectors(this.next, this.sample);
      if (this.tangent.lengthSq() < 1e-10) this.tangent.set(0, 0, -1);
      this.tangent.normalize();
      this.normal.set(0, 1, 0);
      if (Math.abs(this.tangent.y) > 0.95) this.normal.set(1, 0, 0);
      this.binormal.crossVectors(this.tangent, this.normal).normalize();
      this.normal.crossVectors(this.binormal, this.tangent).normalize();
      const radius = this.style.radius(t * portion);
      for (let r = 0; r < RADIAL; r++) {
        const angle = (r / RADIAL) * Math.PI * 2;
        const cx = Math.cos(angle) * radius;
        const cy = Math.sin(angle) * radius;
        const k = (s * RADIAL + r) * 3;
        this.positions[k] = this.sample.x + this.normal.x * cx + this.binormal.x * cy;
        this.positions[k + 1] = this.sample.y + this.normal.y * cx + this.binormal.y * cy;
        this.positions[k + 2] = this.sample.z + this.normal.z * cx + this.binormal.z * cy;
        this.params[s * RADIAL + r] = t;
      }
    }
    const geometry = this.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aT.needsUpdate = true;
  }

  private pointAt(points: Vector3[], count: number, distance: number, out: Vector3): void {
    for (let i = 1; i < count; i++) {
      if (this.lengths[i] >= distance || i === count - 1) {
        const segment = this.lengths[i] - this.lengths[i - 1];
        const k = segment > 0 ? Math.min(Math.max((distance - this.lengths[i - 1]) / segment, 0), 1) : 0;
        out.lerpVectors(points[i - 1], points[i], k);
        return;
      }
    }
    out.copy(points[0]);
  }
}

export const RAY_STYLES = {
  planting: {
    color: 0x86dc3d,
    opacity: 0.85,
    radius: () => 0.01,
    gradient: [0.02, 0.1, 0.6, 1.0],
    span: 0.5,
  },
  plantingBlocked: {
    color: 0xc0392b,
    opacity: 0.85,
    radius: () => 0.01,
    gradient: [0.02, 0.1, 0.6, 1.0],
    span: 0.5,
  },
  remove: {
    color: 0xd9533b,
    opacity: 0.6,
    radius: () => 0.006,
    gradient: [0.02, 0.07, 1, 1],
  },
  water: {
    color: 0x4f8dff,
    opacity: 0.9,
    glow: true,
    radius: (t: number) => 0.012 + t * 0.055,
    gradient: [0, 0.02, 0.4, 0.9],
  },
  teleport: {
    color: 0x48adc8,
    opacity: 0.85,
    radius: () => 0.01,
    gradient: [0.02, 0.1, 0.6, 0.8],
    span: 0.75,
  },
  teleportBlocked: {
    color: 0xc0392b,
    opacity: 0.85,
    radius: () => 0.01,
    gradient: [0.02, 0.1, 0.6, 0.8],
    span: 0.75,
  },
  seedbox: {
    color: 0xffffff,
    opacity: 0.6,
    radius: () => 0.004,
    gradient: [0.01, 0.3, 1, 1],
  },
} satisfies Record<string, TubeStyle>;
