/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Footsteps while gliding (new; the legacy sounds shipped but were never
 * played). The surface under the player picks grass, stone, wood or dirt.
 */

import { Vector3, createSystem } from '@iwsdk/core';
import { audio } from '../core/audio.js';
import { Layer, collisionWorld, createHit } from '../core/colliders.js';
import type { SoundId } from '../data/sounds.js';

const STRIDE = 0.62;
const SURFACES: { test: RegExp; prefix: string; count: number }[] = [
  { test: /road|stone|stair/i, prefix: 'STONE_FOOTSTEPS', count: 5 },
  { test: /bridge|gazebo/i, prefix: 'WOOD_FOOTSTEPS', count: 5 },
  // Planter beds' colliders are named Circular_N / Long_N.
  { test: /planter|circular|long_/i, prefix: 'DIRT_FOOTSTEPS', count: 5 },
];

export class FootstepsSystem extends createSystem({}) {
  private last = new Vector3();
  private travelled = 0;
  private ready = false;
  private hit = createHit();
  private from = new Vector3();
  private to = new Vector3();
  private lastIndex = -1;

  override update(): void {
    const position = this.world.player.position;
    if (!this.ready) {
      this.last.copy(position);
      this.ready = true;
      return;
    }
    const dx = position.x - this.last.x;
    const dz = position.z - this.last.z;
    this.last.copy(position);
    const step = Math.hypot(dx, dz);
    // Teleports and garden switches jump; only count continuous gliding.
    if (step > 0.5 || step < 1e-4) {
      if (step > 0.5) this.travelled = 0;
      return;
    }
    this.travelled += step;
    if (this.travelled < STRIDE) return;
    this.travelled = 0;
    this.step(position);
  }

  private step(position: Vector3): void {
    this.from.set(position.x, position.y + 1, position.z);
    this.to.set(position.x, position.y - 1, position.z);
    let prefix = 'GRASS_FOOTSTEPS';
    let count = 6;
    if (collisionWorld.raySegment(this.from, this.to, Layer.Obstacle, this.hit)) {
      const surface = SURFACES.find((entry) => entry.test.test(this.hit.mesh.name));
      if (surface) {
        prefix = surface.prefix;
        count = surface.count;
      }
    }
    let index = Math.floor(Math.random() * count);
    if (index === this.lastIndex) index = (index + 1) % count;
    this.lastIndex = index;
    audio.play(`${prefix}_0${index + 1}` as SoundId, position);
  }
}
