/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Ground target marker: the legacy indicator ring (torus r 0.5 scaled 0.6)
 * plus an optional bobbing arrow (planting) and a soft inner disc.
 */

import {
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';

export class TargetMarker extends Group {
  private ringMaterial: MeshStandardMaterial;
  private discMaterial: MeshBasicMaterial;
  private arrowMaterial: MeshStandardMaterial;
  private beamMaterial: MeshBasicMaterial;
  private arrow: Group;
  private ring: Mesh;
  private t = 0;
  private targetScale = 1;
  private currentScale = 0;
  private worldUp = new Vector3(0, 1, 0);

  constructor(options: { arrow: boolean; radius?: number }) {
    super();
    this.name = 'target-marker';
    this.ringMaterial = new MeshStandardMaterial({
      color: 0x86dc3d,
      emissive: 0x86dc3d,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.85,
      metalness: 0.1,
      roughness: 0.7,
      depthWrite: false,
    });
    this.ring = new Mesh(new TorusGeometry(0.5, 0.05, 8, 48), this.ringMaterial);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.scale.setScalar(options.radius ?? 0.6);
    this.add(this.ring);

    this.discMaterial = new MeshBasicMaterial({
      color: 0x86dc3d,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    const disc = new Mesh(new CircleGeometry(0.3 * ((options.radius ?? 0.6) / 0.6), 40), this.discMaterial);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.01;
    this.add(disc);

    this.arrowMaterial = new MeshStandardMaterial({
      color: 0x86dc3d,
      emissive: 0x86dc3d,
      emissiveIntensity: 0.35,
      metalness: 0.1,
      roughness: 0.7,
    });
    this.beamMaterial = new MeshBasicMaterial({
      color: 0x86dc3d,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.arrow = new Group();
    const cone = new Mesh(new ConeGeometry(0.1, 0.1, 32), this.arrowMaterial);
    cone.rotation.x = Math.PI;
    cone.position.y = 0.3;
    const beam = new Mesh(new CylinderGeometry(0.05, 0.05, 0.2, 24, 1, true), this.beamMaterial);
    beam.position.y = 0.45;
    this.arrow.add(cone, beam);
    this.arrow.visible = options.arrow;
    this.add(this.arrow);

    for (const child of [this.ring, disc, cone, beam]) {
      child.renderOrder = 1000;
      child.castShadow = false;
    }
    this.visible = false;
  }

  setColor(hex: number): void {
    this.ringMaterial.color.setHex(hex);
    this.ringMaterial.emissive.setHex(hex);
    this.discMaterial.color.setHex(hex);
    this.arrowMaterial.color.setHex(hex);
    this.arrowMaterial.emissive.setHex(hex);
    this.beamMaterial.color.setHex(hex);
  }

  /** Show at `position`, aligned to `normal`, animating in. */
  place(position: Vector3, normal?: Vector3): void {
    if (!this.visible) this.currentScale = 0;
    this.visible = true;
    this.position.copy(position);
    if (normal) this.quaternion.setFromUnitVectors(this.worldUp, normal);
    else this.quaternion.identity();
    this.targetScale = 1;
  }

  hide(): void {
    this.visible = false;
  }

  tick(delta: number, spin = 0): void {
    if (!this.visible) return;
    this.t += delta;
    this.currentScale += (this.targetScale - this.currentScale) * Math.min(1, delta * 14);
    this.ring.scale.setScalar(0.6 * (0.92 + 0.08 * Math.sin(this.t * 4)) * this.currentScale);
    this.arrow.position.y = 0.04 * Math.sin(this.t * 3.2);
    this.arrow.rotation.y = spin;
  }

  static readonly GREEN = 0x86dc3d;
  static readonly RED = 0xc0392b;
  static readonly BLUE = 0x48adc8;
}

export const markerColor = (hex: number) => new Color(hex);
