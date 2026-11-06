/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * A minimal stand-in for the parts of an IWSDK World that the input and
 * hand helpers read (input.xr and player spaces), so they can be tested
 * without a renderer or an XR session.
 */

import { Matrix4, Object3D, type World } from '@iwsdk/core';
import { HAND_JOINTS, type HandJoint } from '../core/hands.js';
import type { Hand } from '../core/input.js';

export class FakePad {
  readonly down = new Set<string>();
  readonly up = new Set<string>();
  readonly pressed = new Set<string>();
  readonly values = new Map<string, number>();
  /** Every haptic pulse fired, as [intensity, milliseconds]. */
  readonly pulses: [number, number][] = [];
  hasActuator = true;
  pulseResult: () => Promise<boolean> = () => Promise.resolve(true);

  getButtonDown(button: string): boolean {
    return this.down.has(button);
  }

  getButtonUp(button: string): boolean {
    return this.up.has(button);
  }

  getButtonPressed(button: string): boolean {
    return this.pressed.has(button);
  }

  getButtonValue(button: string): number {
    return this.values.get(button) ?? 0;
  }

  get gamepad(): { hapticActuators: { pulse: (value: number, duration: number) => Promise<boolean> }[] } {
    return {
      hapticActuators: this.hasActuator
        ? [
            {
              pulse: (value, duration) => {
                this.pulses.push([value, duration]);
                return this.pulseResult();
              },
            },
          ]
        : [],
    };
  }
}

export interface FakeHandState {
  /** Which input source is primary on this side. */
  primary: 'hand' | 'controller' | null;
  select: { start: boolean; active: boolean; end: boolean };
  pinch: number;
  /** 25 joint matrices relative to the grip space, or null when untracked. */
  joints: Float32Array | null;
  rayBusy: boolean;
}

export interface FakeWorld {
  world: World;
  hands: Record<Hand, FakeHandState>;
  gamepads: Partial<Record<Hand, FakePad>>;
  player: {
    head: Object3D;
    gripSpaces: Record<Hand, Object3D>;
    raySpaces: Record<Hand, Object3D>;
  };
}

const newHand = (): FakeHandState => ({
  primary: null,
  select: { start: false, active: false, end: false },
  pinch: 0,
  joints: null,
  rayBusy: false,
});

export function createFakeWorld(): FakeWorld {
  const hands: Record<Hand, FakeHandState> = { left: newHand(), right: newHand() };
  const gamepads: Partial<Record<Hand, FakePad>> = {};
  const player = {
    head: new Object3D(),
    gripSpaces: { left: new Object3D(), right: new Object3D() },
    raySpaces: { left: new Object3D(), right: new Object3D() },
  };
  const adapter = (hand: Hand) => ({
    get jointTransforms() {
      return hands[hand].joints;
    },
    getPinchStrength: () => hands[hand].pinch,
  });
  const xr = {
    gamepads,
    isPrimary: (kind: string, hand: Hand) => hands[hand].primary === kind,
    getSelectState: (hand: Hand) => hands[hand].select,
    visualAdapters: { hand: { left: adapter('left'), right: adapter('right') } },
    multiPointers: {
      left: { getRayBusy: () => hands.left.rayBusy },
      right: { getRayBusy: () => hands.right.rayBusy },
    },
  };
  const world = { input: { xr }, player } as unknown as World;
  return { world, hands, gamepads, player };
}

/**
 * Joint matrices (XRHand order, grip space) with identity rotation and the
 * given translations; unspecified joints sit at the grip origin.
 */
export function jointTransforms(
  positions: Partial<Record<HandJoint, [number, number, number]>>,
  rotation = new Matrix4(),
): Float32Array {
  const out = new Float32Array(HAND_JOINTS.length * 16);
  const matrix = new Matrix4();
  HAND_JOINTS.forEach((joint, i) => {
    const [x, y, z] = positions[joint] ?? [0, 0, 0];
    matrix.copy(rotation).setPosition(x, y, z);
    matrix.toArray(out, i * 16);
  });
  return out;
}
