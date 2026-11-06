/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Lazy gaze-follow placement (legacy GazeFollowSystem): the panel rests at a
 * point `radius` metres ahead of the head and only re-targets when the view
 * drifts more than 30 degrees away or the head height changes by 20 cm. It
 * glides there on a critically damped spring and turns to face the player.
 */

import { Vector3, type Object3D, type World } from '@iwsdk/core';

const ANGLE_LIMIT = Math.PI / 6;
const HEIGHT_LIMIT = 0.2;

export class GazeFollower {
  private target = new Vector3();
  private velocity = new Vector3();
  private head = new Vector3();
  private forward = new Vector3();
  private toTarget = new Vector3();
  private placed = false;

  constructor(
    private readonly object: Object3D,
    private readonly radius = 1.5,
    private readonly yOffset = -0.1,
    private readonly frequency = 0.5,
  ) {}

  /** Snap into place on the next update (legacy shouldMoveImmediately). */
  reset(): void {
    this.placed = false;
  }

  update(world: World, delta: number): void {
    const head = world.player.head;
    head.getWorldPosition(this.head);
    head.getWorldDirection(this.forward).negate();
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();

    this.toTarget.subVectors(this.target, this.head);
    const heightDelta = Math.abs(this.target.y - (this.head.y + this.yOffset));
    this.toTarget.y = 0;
    const drift = this.toTarget.lengthSq() > 1e-6 ? this.toTarget.angleTo(this.forward) : Math.PI;
    // Also re-target when the player moved (teleport, glide) away from it.
    const distanceDrift = Math.abs(this.toTarget.length() - this.radius);
    if (!this.placed || drift > ANGLE_LIMIT || heightDelta > HEIGHT_LIMIT || distanceDrift > 0.6) {
      this.target.copy(this.head).addScaledVector(this.forward, this.radius);
      this.target.y = this.head.y + this.yOffset;
    }
    if (!this.placed) {
      this.object.position.copy(this.target);
      this.velocity.set(0, 0, 0);
      this.placed = true;
    } else {
      // Critically damped spring toward the target.
      const omega = 2 * Math.PI * this.frequency * 2;
      const dt = Math.min(delta, 0.05);
      const k = omega * omega;
      const c = 2 * omega;
      this.velocity.x += (k * (this.target.x - this.object.position.x) - c * this.velocity.x) * dt;
      this.velocity.y += (k * (this.target.y - this.object.position.y) - c * this.velocity.y) * dt;
      this.velocity.z += (k * (this.target.z - this.object.position.z) - c * this.velocity.z) * dt;
      this.object.position.addScaledVector(this.velocity, dt);
    }
    // Yaw only, toward the head.
    const yaw = Math.atan2(this.head.x - this.object.position.x, this.head.z - this.object.position.z);
    this.object.rotation.set(0, yaw, 0);
  }
}

/** Place `object` in front of the head once (static panels). */
export function placeInFront(world: World, object: Object3D, distance: number, yOffset: number): void {
  const head = new Vector3();
  const forward = new Vector3();
  world.player.head.getWorldPosition(head);
  world.player.head.getWorldDirection(forward).negate();
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();
  object.position.copy(head).addScaledVector(forward, distance);
  object.position.y = head.y + yOffset;
  object.rotation.set(0, Math.atan2(head.x - object.position.x, head.z - object.position.z), 0);
}
