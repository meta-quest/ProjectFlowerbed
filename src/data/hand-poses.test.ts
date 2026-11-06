/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { join } from 'node:path';
import { PUBLIC, appSources, gltfNames, matchAll } from '../test-utils/repo.js';
import { HAND_POSES, type HandPose, type PoseGroup, type Quat } from './hand-poses.js';

const GROUPS: Record<keyof HandPose, string[]> = {
  THUMB: ['Thumb_Metacarpal', 'Thumb_A', 'Thumb_B', 'Thumb_C'],
  INDEX: ['Index_Metacarpal', 'Index_A', 'Index_B', 'Index_C'],
  HAND: ['Middle', 'Ring', 'Pinky'].flatMap((finger) => ['Metacarpal', 'A', 'B', 'C'].map((b) => `${finger}_${b}`)),
};
const GROUP_NAMES = Object.keys(GROUPS) as (keyof HandPose)[];

const poses = Object.entries(HAND_POSES);
const quatLength = (q: Quat) => Math.hypot(...q);

it('defines the six legacy poses', () => {
  expect(Object.keys(HAND_POSES).sort()).toEqual(['CAMERA', 'EMPTY', 'GRABBING', 'PLANTING', 'SEEDBOX', 'WATERING']);
});

it('gives every pose the THUMB, INDEX and HAND groups with every bone', () => {
  for (const [name, pose] of poses) {
    expect(Object.keys(pose).sort(), name).toEqual([...GROUP_NAMES].sort());
    for (const group of GROUP_NAMES) {
      expect(Object.keys(pose[group]).sort(), `${name}.${group}`).toEqual([...GROUPS[group]].sort());
    }
  }
});

it('uses finite unit quaternions for every default and pressed bone pose', () => {
  for (const [name, pose] of poses) {
    for (const group of GROUP_NAMES) {
      const bones: PoseGroup = pose[group];
      for (const [bone, [rest, pressed]] of Object.entries(bones)) {
        for (const q of [rest, pressed]) {
          const label = `${name}.${bone}`;
          expect(q, label).toHaveLength(4);
          expect(q.every(Number.isFinite), label).toBe(true);
          expect(Math.abs(quatLength(q) - 1), label).toBeLessThan(1e-3);
        }
      }
    }
  }
});

it('only animates poses that exist (names used by HandsSystem)', () => {
  const source = appSources().find((file) => file.rel === 'src/world/hands-system.ts')!.text;
  const used = new Set(matchAll(source, /this\.(?:fixed|animate)\(rig, '([A-Z]+)'/g));
  expect(used.size).toBeGreaterThan(0);
  for (const name of used) expect(Object.keys(HAND_POSES)).toContain(name);
});

it('names bones that exist in the glove model (missing ones are skipped silently)', () => {
  const names = gltfNames(join(PUBLIC, 'flowerbed/models/hands/PlayerElement_Hand_Left.gltf'));
  const missing = Object.values(GROUPS)
    .flat()
    .filter((bone) => !names.has(bone));
  expect(missing).toEqual([]);
});
