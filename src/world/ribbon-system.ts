/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Weekly ribbons, on show: each ribbon won hangs as a prize rosette on the
 * gazebo railing (up to 12; two instanced draws, rebuilt only on change).
 */

import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Euler,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  Group,
  Mesh,
  createSystem,
  type Object3D,
} from '@iwsdk/core';
import { CHAMPION_COLOR, RIBBON_COLORS, ribbonMilestone, weekly } from '../gardening/progress.js';
import { BURST_STYLES, bursts } from '../core/bursts.js';
import { blink } from '../core/state.js';
import { islandReady } from './island-state.js';
import { teleportPlayer } from '../core/locomotion-bridge.js';

/**
 * The gazebo is an octagon (apothem ~1.8 m, rail top ~1.35 m above its
 * base) with open entrances on two opposite sides. Rosettes hang on the six
 * railed sides, two per side, front sides first. Angles are in the gazebo's
 * own frame, where the entrances sit at 0 and 180 degrees.
 */
const RAILED_SIDES = [45, -45, 90, -90, 135, -135].map((deg) => (deg * Math.PI) / 180);
const APOTHEM = 1.97;
const HANG_Y = 1.22;
const SLOT_OFFSET = 0.38;
const MAX_ROSETTES = RAILED_SIDES.length * 2;
/** Five ribbons fly a champion's pennant from the gazebo roof. */
export const PENNANT_AT = 5;

export const ribbonCommands = {
  /** Teleport to a spot in front of the gazebo, facing it. */
  visitGazebo: () => {},
};

export class RibbonSystem extends createSystem({}) {
  private flutter = { value: 0 };
  private card: InstancedMesh | null = null;
  private plate: InstancedMesh | null = null;
  private gazebo: Object3D | null = null;
  private pennant: Group | null = null;

  override init(): void {
    ribbonCommands.visitGazebo = () => this.visit();
    this.cleanupFuncs.push(
      islandReady.subscribe((ready) => ready && this.layout()),
      weekly.subscribe(() => this.layout()),
      // A milestone pops with gold sparkles at the gazebo.
      ribbonMilestone.subscribe((milestone) => {
        if (!milestone || !this.gazebo) return;
        const at = this.gazebo.getWorldPosition(new Vector3());
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          bursts.emit(new Vector3(at.x + Math.sin(a) * 2, at.y + 1.6, at.z + Math.cos(a) * 2), BURST_STYLES.gold);
        }
        if (this.pennant?.visible) bursts.emit(this.pennant.localToWorld(new Vector3(0.3, 1.2, 0)), BURST_STYLES.gold);
      }),
    );
  }

  override update(delta: number): void {
    // The pennant flutters (one uniform; only while it is shown).
    if (this.pennant?.visible) this.flutter.value += delta;
  }

  private visit(): void {
    if (!this.gazebo) return;
    const center = this.gazebo.getWorldPosition(new Vector3());
    const yaw = new Euler().setFromQuaternion(this.gazebo.getWorldQuaternion(new Quaternion()), 'YXZ').y;
    // Stand off the front railed side, where the first rosettes hang.
    const side = RAILED_SIDES[0] + yaw;
    // Far enough back that the roof pennant is in view too.
    const spot = new Vector3(center.x + Math.sin(side) * 5.5, center.y, center.z + Math.cos(side) * 5.5);
    blink.value = blink.peek() + 1;
    if (!teleportPlayer(this.world, spot)) return;
    this.world.player.rotation.y = side - this.world.camera.rotation.y;
  }

  private build(): void {
    const card = new InstancedMesh(
      // Rosette faces on both sides, so they read from inside the gazebo too.
      twoSidedCard(),
      new MeshStandardMaterial({ map: rosetteTexture(), alphaTest: 0.5, roughness: 0.6 }),
      MAX_ROSETTES,
    );
    // A cupped satin back so rosettes keep their body seen from the side.
    const plate = new InstancedMesh(
      new CylinderGeometry(0.07, 0.085, 0.024, 20).rotateX(Math.PI / 2),
      new MeshStandardMaterial({ roughness: 0.45 }),
      MAX_ROSETTES,
    );
    for (const mesh of [plate, card]) {
      mesh.name = 'ribbon-rosettes';
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    }
    this.card = card;
    this.plate = plate;
  }

  /** A gold pennant on a slim pole above the gazebo's finial. */
  private placePennant(show: boolean): void {
    if (!show) {
      if (this.pennant) this.pennant.visible = false;
      return;
    }
    if (!this.pennant) {
      const pennant = new Group();
      pennant.name = 'champion-pennant';
      const pole = new Mesh(
        new CylinderGeometry(0.02, 0.025, 1.3, 8),
        new MeshStandardMaterial({ color: 0xd8c9a6, roughness: 0.4, metalness: 0.6 }),
      );
      pole.position.y = 0.65;
      const flagMaterial = new MeshStandardMaterial({
        color: CHAMPION_COLOR,
        roughness: 0.5,
        side: DoubleSide,
        emissive: CHAMPION_COLOR,
        emissiveIntensity: 0.15,
      });
      flagMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.uFlutter = this.flutter;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uFlutter;')
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            // Cloth-like ripple growing toward the free end of the flag.
            transformed.z += sin(position.x * 9.0 - uFlutter * 6.0) * 0.05 * position.x;`,
          );
      };
      // A subdivided strip tapered to a point, so the ripple has vertices to move.
      const cloth = new PlaneGeometry(0.75, 0.36, 12, 1).translate(0.375, -0.18, 0);
      const pos = cloth.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const taper = 1 - pos.getX(i) / 0.75;
        pos.setY(i, -0.18 + (pos.getY(i) + 0.18) * taper);
      }
      cloth.computeVertexNormals();
      const flag = new Mesh(cloth, flagMaterial);
      flag.position.set(0.02, 1.28, 0);
      pennant.add(pole, flag);
      const box = new Box3().setFromObject(this.gazebo!);
      pennant.position.set((box.min.x + box.max.x) / 2, box.max.y - 0.15, (box.min.z + box.max.z) / 2);
      this.scene.add(pennant);
      this.pennant = pennant;
    }
    this.pennant.visible = true;
  }

  private layout(): void {
    if (!islandReady.peek()) return;
    if (!this.gazebo) {
      this.world.scene.traverse((node) => {
        if (!this.gazebo && /^Gazebo /.test(node.name)) this.gazebo = node;
      });
    }
    if (!this.gazebo) return;
    if (!this.card) this.build();
    const card = this.card!;
    const plate = this.plate!;
    const ribbons = weekly.peek().ribbons;
    const count = Math.min(MAX_ROSETTES, ribbons);
    const base = this.gazebo.getWorldPosition(new Vector3());
    const yaw = new Euler().setFromQuaternion(this.gazebo.getWorldQuaternion(new Quaternion()), 'YXZ').y;
    const matrix = new Matrix4();
    const quat = new Quaternion();
    const position = new Vector3();
    const scale = new Vector3();
    const up = new Vector3(0, 1, 0);
    const tint = new Color();
    for (let i = 0; i < count; i++) {
      const side = RAILED_SIDES[Math.floor(i / 2)] + yaw;
      const along = i % 2 ? SLOT_OFFSET : -SLOT_OFFSET;
      // Side midpoint, then slide along the rail (perpendicular to the normal).
      position.set(
        base.x + Math.sin(side) * APOTHEM + Math.cos(side) * along,
        base.y + HANG_Y,
        base.z + Math.cos(side) * APOTHEM - Math.sin(side) * along,
      );
      quat.setFromAxisAngle(up, side);
      // Every fifth ribbon is a larger champion rosette in gold.
      const champion = (i + 1) % 5 === 0;
      scale.setScalar(champion ? 1.35 : 1);
      matrix.compose(position, quat, scale);
      card.setMatrixAt(i, matrix);
      plate.setMatrixAt(i, matrix);
      tint.set(champion ? CHAMPION_COLOR : RIBBON_COLORS[i % RIBBON_COLORS.length]);
      card.setColorAt(i, tint);
      plate.setColorAt(i, tint.multiplyScalar(0.8));
    }
    this.placePennant(ribbons >= PENNANT_AT);
    for (const mesh of [card, plate]) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.visible = count > 0;
    }
  }
}

/** A white rosette (tinted per instance): petals, a centre button, two tails. */
function rosetteTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e8e8e8';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(64, 70);
    ctx.lineTo(64 + side * 34, 186);
    ctx.lineTo(64 + side * 18, 170);
    ctx.lineTo(64 + side * 8, 188);
    ctx.closePath();
    ctx.fill();
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40, 18, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? '#ffffff' : '#d8d8d8';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(64, 64, 30, 0, Math.PI * 2);
  ctx.fillStyle = '#f4f4f4';
  ctx.fill();
  ctx.strokeStyle = '#bcbcbc';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#9a9a9a';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('1st', 64, 76);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Two rosette cards back to back around the satin plate. */
function twoSidedCard(): BufferGeometry {
  const front = new PlaneGeometry(0.2, 0.3).translate(0, -0.05, 0.016);
  const back = new PlaneGeometry(0.2, 0.3).rotateY(Math.PI).translate(0, -0.05, -0.016);
  const merged = new BufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) {
    const a = front.attributes[name].array as Float32Array;
    const b = back.attributes[name].array as Float32Array;
    const data = new Float32Array(a.length + b.length);
    data.set(a, 0);
    data.set(b, a.length);
    merged.setAttribute(name, new BufferAttribute(data, front.attributes[name].itemSize));
  }
  const offset = front.attributes.position.count;
  const index = [
    ...(front.index!.array as Uint16Array),
    ...[...(back.index!.array as Uint16Array)].map((i) => i + offset),
  ];
  merged.setIndex(index);
  front.dispose();
  back.dispose();
  return merged;
}
