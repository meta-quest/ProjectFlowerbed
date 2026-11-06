/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Tracked hands: joint positions, palm pose and pinch, read from IWSDK's hand
 * visual adapter (joint matrices relative to the grip space, refreshed each
 * frame from XRFrame.fillPoses). Nothing here allocates per call.
 */

import { Matrix4, Object3D, Vector3, type World } from '@iwsdk/core';
import type { Hand } from './input.js';

/** WebXR hand joints in XRHand order (the order of jointTransforms). */
export const HAND_JOINTS = [
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
] as const;
export type HandJoint = (typeof HAND_JOINTS)[number];
const JOINT_INDEX = new Map<string, number>(HAND_JOINTS.map((name, i) => [name, i]));

const scratch = new Matrix4();
const across = new Vector3();
const forward = new Vector3();

/** True while this hand is tracked (hand tracking is its primary input). */
export function handTracked(world: World, hand: Hand): boolean {
  return world.input.xr.isPrimary('hand', hand);
}

/** True when either hand is tracked; the game then shows hand wording. */
export function anyHandTracked(world: World): boolean {
  return handTracked(world, 'left') || handTracked(world, 'right');
}

/** Joint matrices relative to the grip space, or null while not tracked. */
export function jointTransforms(world: World, hand: Hand): Float32Array | null {
  if (!handTracked(world, hand)) return null;
  return world.input.xr.visualAdapters.hand[hand].jointTransforms ?? null;
}

/** World-space position of a joint; false (out untouched) when not tracked. */
export function jointPosition(world: World, hand: Hand, joint: HandJoint, out: Vector3): boolean {
  const transforms = jointTransforms(world, hand);
  const index = JOINT_INDEX.get(joint);
  if (!transforms || index === undefined) return false;
  scratch.fromArray(transforms, index * 16);
  out.setFromMatrixPosition(scratch).applyMatrix4(world.player.gripSpaces[hand].matrixWorld);
  return true;
}

/**
 * Palm centre and the direction the palm faces (world space). The palm
 * normal comes from the knuckle line and the wrist-to-middle direction, so it
 * holds for any hand pose.
 */
export function palmPose(world: World, hand: Hand, center: Vector3, normal: Vector3): boolean {
  if (!jointPosition(world, hand, 'wrist', center)) return false;
  jointPosition(world, hand, 'middle-finger-phalanx-proximal', forward);
  jointPosition(world, hand, 'index-finger-phalanx-proximal', across);
  jointPosition(world, hand, 'pinky-finger-phalanx-proximal', normal);
  across.sub(normal);
  forward.sub(center);
  center.addScaledVector(forward, 0.55);
  // Left hand: forward x across points out of the palm; right is mirrored.
  normal.crossVectors(forward, across).normalize();
  if (hand === 'right') normal.negate();
  return true;
}

const thumbTip = new Vector3();

/** Midpoint of the thumb and index tips: where a pinch picks things up. */
export function pinchPoint(world: World, hand: Hand, out: Vector3): boolean {
  if (!jointPosition(world, hand, 'index-finger-tip', out)) return false;
  jointPosition(world, hand, 'thumb-tip', thumbTip);
  out.lerp(thumbTip, 0.5);
  return true;
}

/** Continuous 0..1 pinch closure (0 open hand, 1 fingertips touching). */
export function pinchStrength(world: World, hand: Hand): number {
  if (!handTracked(world, hand)) return 0;
  return world.input.xr.visualAdapters.hand[hand].getPinchStrength();
}

/**
 * Where a controller grip would sit in a tracked hand, as the inverse of the
 * tracked glove's wrist rest pose. The tracked glove at rest coincides with
 * the controller glove (same mesh, same place in grip space), so props keep
 * the exact relation to the wrist that the legacy offsets were calibrated
 * against. Set by HandsSystem once the tracked glove has loaded.
 */
const VIRTUAL_GRIP: Record<Hand, Matrix4> = { left: new Matrix4(), right: new Matrix4() };

export function setTrackedWristRest(hand: Hand, rest: Matrix4): void {
  VIRTUAL_GRIP[hand].copy(rest).invert();
}

type Anchor = 'wrist' | 'pinch';
interface Mount {
  hand: Hand;
  anchor: Anchor;
  /** Mount pose in the anchor frame while the hand is tracked. */
  offset: Matrix4;
  object: Object3D;
}
const mounts = new Map<string, Mount>();

function mountFor(world: World, hand: Hand, name: string, anchor: Anchor, offset: Matrix4): Object3D {
  const key = `${hand}:${name}`;
  let mount = mounts.get(key);
  if (!mount) {
    const object = new Object3D();
    object.name = `tool-mount:${key}`;
    object.matrixAutoUpdate = false;
    world.player.gripSpaces[hand].add(object);
    mount = { hand, anchor, offset, object };
    mounts.set(key, mount);
  }
  return mount.object;
}

/**
 * Parent for anything held in a hand (glove poses, tools, seedbox, packet).
 * With a controller it is the grip itself; with a tracked hand it follows a
 * virtual controller grip in the palm, so offsets tuned for controllers fit.
 */
export function toolMount(world: World, hand: Hand): Object3D {
  return mountFor(world, hand, 'grip', 'wrist', VIRTUAL_GRIP[hand]);
}

/**
 * A prop pose for tracked hands, in wrist-joint axes (-Z toward the fingers,
 * -Y out of the palm; the thumb is on -X for the right hand, +X for the left).
 * `right` and `up` are the prop's +X and +Y in those axes; `at` is where its
 * origin sits relative to the anchor.
 */
export function handHold(at: [number, number, number], right: Vector3, up: Vector3, scale = 1): Matrix4 {
  const back = new Vector3().crossVectors(right, up);
  return new Matrix4()
    .makeBasis(right, up, back)
    .scale(new Vector3(scale, scale, scale))
    .setPosition(...at);
}

/**
 * Parent for a prop whose controller offset suits the glove's scripted poses
 * but not a bare hand. With a controller it is the grip, so the prop keeps
 * `controller` as its local transform; with a tracked hand the prop lands on
 * `hold`, anchored at the wrist or at the pinch point (between thumb and
 * index tips) so it stays between the fingers as they move.
 */
export function holdMount(
  world: World,
  hand: Hand,
  name: string,
  anchor: Anchor,
  hold: Matrix4,
  controller: Matrix4,
): Object3D {
  return mountFor(world, hand, name, anchor, hold.clone().multiply(controller.clone().invert()));
}

const tipA = new Vector3();
const tipB = new Vector3();
const THUMB_TIP = JOINT_INDEX.get('thumb-tip')! * 16 + 12;
const INDEX_TIP = JOINT_INDEX.get('index-finger-tip')! * 16 + 12;

/** Per frame: move each mount to the controller grip or its place in the hand. */
export function updateToolMounts(world: World): void {
  for (const { hand, anchor, offset, object } of mounts.values()) {
    const transforms = jointTransforms(world, hand);
    if (transforms) {
      object.matrix.fromArray(transforms, 0);
      if (anchor === 'pinch') {
        tipA.fromArray(transforms, THUMB_TIP);
        tipB.fromArray(transforms, INDEX_TIP);
        object.matrix.setPosition(tipA.lerp(tipB, 0.5));
      }
      object.matrix.multiply(offset);
    } else object.matrix.identity();
    object.matrixWorldNeedsUpdate = true;
  }
}
