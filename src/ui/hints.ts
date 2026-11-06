/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Contextual hint bubbles (legacy tooltips) that float beside an object,
 * plus the "glow and buzz" button highlight used by the legacy hand NUX.
 */

import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  RingGeometry,
  Vector3,
  type MeshStandardMaterial,
  type World,
} from '@iwsdk/core';
import { haptic, type Hand } from '../core/input.js';
import { spawnPanel, type SpawnedPanel } from './panels.js';
import { handMode } from '../core/state.js';

const MAX_YAW = (22 * Math.PI) / 180;
const MAX_PITCH = (18 * Math.PI) / 180;

export interface HintContent {
  key: string;
  title: string;
  text: string;
  /** Wording for tracked hands, shown instead while hand tracking is used. */
  hand?: { key?: string; text: string };
}

/** One floating hint bubble that follows a target with an offset. */
export class HintBubble {
  private panel: SpawnedPanel | null = null;
  private target: Object3D | null = null;
  private offset = new Vector3();
  private v = new Vector3();
  private head = new Vector3();
  private dir = new Vector3();
  private forward = new Vector3();
  private visible = false;
  private hideAt = Infinity;
  private elapsed = 0;

  constructor(private readonly world: World) {
    void spawnPanel(world, 'hint', { scale: 0.065, interactive: false }).then((panel) => {
      this.panel = panel;
      panel.show(false);
    });
  }

  show(content: HintContent, target: Object3D, offset: [number, number, number], seconds = Infinity): void {
    if (!this.panel) return;
    const hands = handMode.peek() && content.hand;
    this.panel.text('hint-key', hands ? (content.hand!.key ?? content.key) : content.key);
    this.panel.text('hint-title', content.title);
    this.panel.text('hint-text', hands ? content.hand!.text : content.text);
    this.target = target;
    this.offset.set(...offset);
    this.visible = true;
    this.hideAt = this.elapsed + seconds;
    this.panel.show(true);
    this.place(1);
  }

  hide(): void {
    this.visible = false;
    this.target = null;
    this.panel?.show(false);
  }

  get shown(): boolean {
    return this.visible;
  }

  update(delta: number): void {
    this.elapsed += delta;
    if (!this.visible || !this.panel) return;
    if (this.elapsed >= this.hideAt) {
      this.hide();
      return;
    }
    this.place(Math.min(1, delta * 6));
  }

  /** Follow the target with the offset in head-yaw space (legacy ObjectFollow). */
  private place(k: number): void {
    if (!this.target || !this.panel) return;
    const root = this.panel.root;
    this.world.player.head.getWorldPosition(this.head);
    this.target.getWorldPosition(this.v);
    const yaw = this.world.player.rotation.y;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    this.v.x += this.offset.x * cos + this.offset.z * sin;
    this.v.y += this.offset.y;
    this.v.z += -this.offset.x * sin + this.offset.z * cos;
    // Keep it readable: at least 0.45 m from the eyes and within 22 degrees
    // of the view centre horizontally, so it never clips at the edge.
    this.dir.subVectors(this.v, this.head);
    const distance = Math.max(this.dir.length(), 0.45);
    this.world.player.head.getWorldDirection(this.forward).negate();
    const viewYaw = Math.atan2(this.forward.x, this.forward.z);
    let yawOffset = Math.atan2(this.dir.x, this.dir.z) - viewYaw;
    yawOffset = Math.atan2(Math.sin(yawOffset), Math.cos(yawOffset));
    const clamped = Math.max(-MAX_YAW, Math.min(MAX_YAW, yawOffset));
    // Same for pitch, relative to where the head is looking.
    const viewPitch = Math.asin(Math.max(-1, Math.min(1, this.forward.y)));
    const pitch = Math.atan2(this.dir.y, Math.hypot(this.dir.x, this.dir.z));
    const clampedPitch = viewPitch + Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch - viewPitch));
    const flat = Math.cos(clampedPitch) * distance;
    this.v.set(
      this.head.x + Math.sin(viewYaw + clamped) * flat,
      this.head.y + Math.sin(clampedPitch) * distance,
      this.head.z + Math.cos(viewYaw + clamped) * flat,
    );
    root.position.lerp(this.v, k);
    root.rotation.set(0, Math.atan2(this.head.x - root.position.x, this.head.z - root.position.z), 0);
  }
}

/**
 * Pulse a mesh's emissive glow on a 2 s triangle wave with a haptic tick
 * each cycle (legacy HAND_NUX_PULSE_DURATION).
 */
export class GlowPulse {
  private materials: MeshStandardMaterial[] = [];
  private t = 0;
  private active = false;
  private readonly white = new Color(0xffffff);

  constructor(
    private readonly world: World,
    private readonly hand: Hand,
  ) {}

  attach(meshes: (Mesh | null | undefined)[]): void {
    this.materials = [];
    for (const mesh of meshes) {
      if (!mesh) continue;
      const material = (mesh.material as MeshStandardMaterial).clone();
      material.emissive = this.white.clone();
      material.emissiveIntensity = 0;
      mesh.material = material;
      this.materials.push(material);
    }
  }

  start(): void {
    this.active = true;
    this.t = 0;
  }

  stop(): void {
    this.active = false;
    for (const material of this.materials) material.emissiveIntensity = 0;
  }

  get running(): boolean {
    return this.active;
  }

  update(delta: number): void {
    if (!this.active) return;
    const before = this.t;
    this.t = (this.t + delta) % 2;
    if (this.t < before) haptic(this.world, this.hand, 0.1, 1000);
    const intensity = this.t < 1 ? this.t : 2 - this.t;
    for (const material of this.materials) material.emissiveIntensity = intensity;
  }
}

/**
 * A pulsing beacon over a real controller button. IWSDK batches controller
 * models into one mesh, so the button is located through the visual's
 * animated component node (its offset within the profile model).
 */
export class ButtonBeacon {
  private ring: Mesh;
  private t = 0;
  private active = false;

  constructor(private readonly world: World) {
    this.ring = new Mesh(
      new RingGeometry(0.0055, 0.0095, 32),
      new MeshBasicMaterial({
        color: 0x86dc3d,
        transparent: true,
        depthTest: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    );
    this.ring.renderOrder = 2000;
    this.ring.visible = false;
  }

  /** Attach over the right controller's button with the given gamepad index. */
  start(gamepadIndex: number): boolean {
    const visual = this.world.input.xr.visualAdapters.controller.right.visual as
      | { model: Object3D; animatedComponents?: { isButton: boolean; gamepadIndex: number; node: Object3D }[] }
      | undefined;
    const node = visual?.animatedComponents?.find(
      (component) => component.isButton && component.gamepadIndex === gamepadIndex,
    )?.node;
    if (!visual || !node) return false;
    // Offset of the button inside the profile model (product of local matrices).
    const offset = new Matrix4();
    let current: Object3D | null = node;
    while (current && current.parent) {
      current.updateMatrix();
      offset.premultiply(current.matrix);
      current = current.parent;
    }
    offset.decompose(this.ring.position, this.ring.quaternion, this.ring.scale);
    this.ring.scale.setScalar(1);
    // Lie flat on the button face, lifted slightly above it.
    this.ring.rotateX(-Math.PI / 2);
    this.ring.translateZ(0.004);
    visual.model.add(this.ring);
    this.active = true;
    this.t = 0;
    return true;
  }

  stop(): void {
    this.active = false;
    this.ring.visible = false;
    this.ring.removeFromParent();
  }

  update(delta: number): void {
    if (!this.active) return;
    this.t = (this.t + delta) % 2;
    if (this.t < delta) haptic(this.world, 'right', 0.1, 120);
    const k = this.t < 1 ? this.t : 2 - this.t;
    this.ring.visible = true;
    (this.ring.material as MeshBasicMaterial).opacity = 0.35 + 0.65 * k;
    this.ring.scale.setScalar(1 + 0.25 * k);
  }
}
