/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Pooled particle bursts in a single Points draw call: soil puffs when a
 * seed lands, petal sparkles when a plant finishes growing or is removed,
 * splashes for water. Up to 8 bursts of 24 particles run at once.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
  type Object3D,
} from '@iwsdk/core';

const BURSTS = 8;
const PER = 24;
const COUNT = BURSTS * PER;

export interface BurstStyle {
  color: number;
  /** Second color mixed in randomly (e.g. petals over leaves). */
  accent?: number;
  speed: number;
  /** Upward bias of the initial velocity. */
  lift: number;
  gravity: number;
  size: number;
  life: number;
  additive?: boolean;
}

export const BURST_STYLES = {
  soil: { color: 0x6b4a2f, accent: 0x8a6a45, speed: 0.9, lift: 1.4, gravity: -6, size: 0.035, life: 0.7 },
  bloom: {
    color: 0xfff3c4,
    accent: 0x86dc3d,
    speed: 0.6,
    lift: 1.2,
    gravity: -0.6,
    size: 0.03,
    life: 1.2,
    additive: true,
  },
  poof: { color: 0xd7cbb8, accent: 0x9a8a72, speed: 0.7, lift: 0.9, gravity: -1.5, size: 0.05, life: 0.9 },
  /** Goal reward reveal: golden sparkles. */
  gold: {
    color: 0xffd86b,
    accent: 0xfff6d8,
    speed: 0.75,
    lift: 1.1,
    gravity: -0.4,
    size: 0.032,
    life: 1.4,
    additive: true,
  },
  /** Dew-blue can finish: cool glittering droplets. */
  dew: {
    color: 0xbfe6ff,
    accent: 0xffffff,
    speed: 0.5,
    lift: 0.9,
    gravity: -0.8,
    size: 0.026,
    life: 1.0,
    additive: true,
  },
  splash: {
    color: 0x9fd0ff,
    accent: 0xffffff,
    speed: 0.8,
    lift: 1.6,
    gravity: -7,
    size: 0.025,
    life: 0.55,
    additive: true,
  },
} satisfies Record<string, BurstStyle>;

function dotTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

class Bursts {
  private points: Points | null = null;
  private positions = new Float32Array(COUNT * 3);
  private velocities = new Float32Array(COUNT * 3);
  private colors = new Float32Array(COUNT * 3);
  private sizes = new Float32Array(COUNT);
  private ages = new Float32Array(BURSTS).fill(Infinity);
  private styles: BurstStyle[] = new Array(BURSTS);
  private next = 0;
  private tmp = new Color();
  private additive!: ShaderMaterial;

  init(scene: Object3D): void {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
    geometry.setAttribute('aSize', new BufferAttribute(this.sizes, 1));
    this.additive = new ShaderMaterial({
      uniforms: { uMap: { value: dotTexture() }, uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      vertexColors: true,
      vertexShader: /* glsl */ `
        attribute float aSize;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uScale;
        void main() {
          vColor = color;
          vAlpha = clamp(aSize * 40.0, 0.0, 1.0);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(-mv.z, 0.05);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
          if (a < 0.02) discard;
          gl_FragColor = vec4(vColor, a);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new Points(geometry, this.additive);
    this.points.frustumCulled = false;
    this.points.renderOrder = 950;
    this.points.visible = false;
    scene.add(this.points);
  }

  emit(at: Vector3, style: BurstStyle): void {
    if (!this.points) return;
    const burst = this.next;
    this.next = (this.next + 1) % BURSTS;
    this.ages[burst] = 0;
    this.styles[burst] = style;
    for (let i = 0; i < PER; i++) {
      const k = (burst * PER + i) * 3;
      const angle = Math.random() * Math.PI * 2;
      const spread = style.speed * (0.4 + Math.random() * 0.6);
      this.positions[k] = at.x;
      this.positions[k + 1] = at.y + 0.02;
      this.positions[k + 2] = at.z;
      this.velocities[k] = Math.cos(angle) * spread;
      this.velocities[k + 1] = style.lift * (0.5 + Math.random() * 0.5);
      this.velocities[k + 2] = Math.sin(angle) * spread;
      this.tmp.setHex(style.accent != null && Math.random() < 0.4 ? style.accent : style.color);
      this.colors[k] = this.tmp.r;
      this.colors[k + 1] = this.tmp.g;
      this.colors[k + 2] = this.tmp.b;
    }
    if (style.additive) this.additive.blending = AdditiveBlending;
    this.points.visible = true;
  }

  tick(delta: number): void {
    if (!this.points?.visible) return;
    let alive = false;
    let anyAdditive = false;
    for (let b = 0; b < BURSTS; b++) {
      const style = this.styles[b];
      if (!style || this.ages[b] >= style.life) {
        for (let i = 0; i < PER; i++) this.sizes[b * PER + i] = 0;
        continue;
      }
      alive = true;
      if (style.additive) anyAdditive = true;
      this.ages[b] += delta;
      const fade = Math.max(0, 1 - this.ages[b] / style.life);
      for (let i = 0; i < PER; i++) {
        const k = (b * PER + i) * 3;
        this.velocities[k + 1] += style.gravity * delta;
        this.velocities[k] *= 1 - 1.5 * delta;
        this.velocities[k + 2] *= 1 - 1.5 * delta;
        this.positions[k] += this.velocities[k] * delta;
        this.positions[k + 1] += this.velocities[k + 1] * delta;
        this.positions[k + 2] += this.velocities[k + 2] * delta;
        this.sizes[b * PER + i] = style.size * fade;
      }
    }
    this.additive.blending = anyAdditive ? AdditiveBlending : NormalBlending;
    const geometry = this.points.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate = true;
    this.points.visible = alive;
  }
}

export const bursts = new Bursts();
