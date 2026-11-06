/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Matrix4, Vector3 } from '@iwsdk/core';
import { createFakeWorld, jointTransforms, type FakeWorld } from '../test-utils/fake-world.js';

/** Tool mounts are cached in module state, so each test gets a fresh copy. */
async function freshHands() {
  vi.resetModules();
  return import('./hands.js');
}

/** WebXR Hand Input spec joint order (XRHand iteration order). */
const SPEC_ORDER = [
  'wrist',
  'thumb-metacarpal',
  'thumb-phalanx-proximal',
  'thumb-phalanx-distal',
  'thumb-tip',
  ...['index', 'middle', 'ring', 'pinky'].flatMap((finger) =>
    ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map(
      (joint) => `${finger}-finger-${joint}`,
    ),
  ),
];

let fake: FakeWorld;

beforeEach(() => {
  fake = createFakeWorld();
});

function track(hand: 'left' | 'right', joints: Float32Array): void {
  fake.hands[hand].primary = 'hand';
  fake.hands[hand].joints = joints;
}

describe('HAND_JOINTS', () => {
  it('lists the 25 WebXR joints in XRHand order (the jointTransforms layout)', async () => {
    const { HAND_JOINTS } = await freshHands();
    expect([...HAND_JOINTS]).toEqual(SPEC_ORDER);
  });
});

describe('tracking state', () => {
  it('follows which input is primary on each side', async () => {
    const { anyHandTracked, handTracked, jointTransforms: transforms } = await freshHands();
    expect(anyHandTracked(fake.world)).toBe(false);
    expect(transforms(fake.world, 'left')).toBeNull();
    track('left', jointTransforms({}));
    expect(handTracked(fake.world, 'left')).toBe(true);
    expect(handTracked(fake.world, 'right')).toBe(false);
    expect(anyHandTracked(fake.world)).toBe(true);
  });

  it('reports no pinch on an untracked hand even if the adapter has a value', async () => {
    const { pinchStrength } = await freshHands();
    fake.hands.right.pinch = 0.8;
    expect(pinchStrength(fake.world, 'right')).toBe(0);
    track('right', jointTransforms({}));
    expect(pinchStrength(fake.world, 'right')).toBe(0.8);
  });
});

describe('joint positions', () => {
  it('maps a joint from grip space into world space', async () => {
    const { jointPosition } = await freshHands();
    track('right', jointTransforms({ 'index-finger-tip': [0.01, 0.02, -0.1] }));
    fake.player.gripSpaces.right.position.set(1, 1.2, -0.5);
    fake.player.gripSpaces.right.updateMatrixWorld(true);
    const out = new Vector3();
    expect(jointPosition(fake.world, 'right', 'index-finger-tip', out)).toBe(true);
    expect(out.x).toBeCloseTo(1.01);
    expect(out.y).toBeCloseTo(1.22);
    expect(out.z).toBeCloseTo(-0.6);
  });

  it('leaves the output untouched while the hand is not tracked', async () => {
    const { jointPosition } = await freshHands();
    const out = new Vector3(7, 7, 7);
    expect(jointPosition(fake.world, 'left', 'wrist', out)).toBe(false);
    expect(out.toArray()).toEqual([7, 7, 7]);
  });

  it('puts the pinch point midway between thumb and index tips', async () => {
    const { pinchPoint } = await freshHands();
    track('left', jointTransforms({ 'thumb-tip': [0, 0, -0.1], 'index-finger-tip': [0.04, 0.02, -0.1] }));
    const out = new Vector3();
    expect(pinchPoint(fake.world, 'left', out)).toBe(true);
    expect(out.x).toBeCloseTo(0.02);
    expect(out.y).toBeCloseTo(0.01);
    expect(out.z).toBeCloseTo(-0.1);
    expect(pinchPoint(fake.world, 'right', out)).toBe(false);
  });

  it('places the palm centre towards the fingers and mirrors the palm normal per hand', async () => {
    const { palmPose } = await freshHands();
    const joints = jointTransforms({
      wrist: [0, 0, 0],
      'middle-finger-phalanx-proximal': [0, 0, -0.1],
      'index-finger-phalanx-proximal': [0.03, 0, -0.09],
      'pinky-finger-phalanx-proximal': [-0.03, 0, -0.08],
    });
    track('left', joints);
    track('right', joints);
    const center = new Vector3();
    const left = new Vector3();
    const right = new Vector3();
    expect(palmPose(fake.world, 'left', center, left)).toBe(true);
    expect(center.z).toBeCloseTo(-0.055);
    palmPose(fake.world, 'right', center, right);
    expect(left.length()).toBeCloseTo(1);
    expect(right.toArray().map((n) => n + 0)).toEqual(
      left
        .clone()
        .negate()
        .toArray()
        .map((n) => expect.closeTo(n, 6)),
    );
    expect(Math.abs(left.y)).toBeCloseTo(1); // flat hand: the palm faces straight up or down
  });
});

describe('handHold', () => {
  it('builds a prop pose from its right/up axes, scale and offset', async () => {
    const { handHold } = await freshHands();
    const right = new Vector3(0, 0, -1);
    const up = new Vector3(1, 0, 0);
    const hold = handHold([0.1, 0.2, 0.3], right, up, 2);
    const x = new Vector3(1, 0, 0).applyMatrix4(hold);
    const y = new Vector3(0, 1, 0).applyMatrix4(hold);
    const z = new Vector3(0, 0, 1).applyMatrix4(hold);
    expect(x.toArray()).toEqual([0.1, 0.2, -1.7].map((n) => expect.closeTo(n, 6)));
    expect(y.toArray()).toEqual([2.1, 0.2, 0.3].map((n) => expect.closeTo(n, 6)));
    // +Z is right x up (a right-handed basis).
    const back = new Vector3()
      .crossVectors(right, up)
      .multiplyScalar(2)
      .add(new Vector3(0.1, 0.2, 0.3));
    expect(z.distanceTo(back)).toBeLessThan(1e-6);
  });
});

describe('tool mounts', () => {
  it('returns one cached mount per hand, parented to the grip', async () => {
    const { toolMount } = await freshHands();
    const grip = toolMount(fake.world, 'left');
    expect(toolMount(fake.world, 'left')).toBe(grip);
    expect(toolMount(fake.world, 'right')).not.toBe(grip);
    expect(grip.parent).toBe(fake.player.gripSpaces.left);
    expect(grip.matrixAutoUpdate).toBe(false);
  });

  it('sits exactly on the controller grip while the hand is not tracked', async () => {
    const { toolMount, updateToolMounts } = await freshHands();
    const mount = toolMount(fake.world, 'right');
    mount.matrix.makeTranslation(1, 2, 3);
    updateToolMounts(fake.world);
    expect(mount.matrix.equals(new Matrix4())).toBe(true);
  });

  it('follows the tracked wrist, or the pinch point for pinch-anchored props', async () => {
    const { holdMount, setTrackedWristRest, toolMount, updateToolMounts } = await freshHands();
    setTrackedWristRest('left', new Matrix4()); // virtual grip = wrist
    const wristMount = toolMount(fake.world, 'left');
    const pinchMount = holdMount(fake.world, 'left', 'packet', 'pinch', new Matrix4(), new Matrix4());
    track(
      'left',
      jointTransforms({ wrist: [0, 0.01, 0], 'thumb-tip': [0, 0, -0.12], 'index-finger-tip': [0.02, 0, -0.12] }),
    );
    updateToolMounts(fake.world);
    expect(new Vector3().setFromMatrixPosition(wristMount.matrix).toArray()).toEqual(
      [0, 0.01, 0].map((n) => expect.closeTo(n, 6)),
    );
    expect(new Vector3().setFromMatrixPosition(pinchMount.matrix).toArray()).toEqual(
      [0.01, 0, -0.12].map((n) => expect.closeTo(n, 6)),
    );
  });
});
