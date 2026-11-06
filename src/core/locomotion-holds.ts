/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Shared pauses for IWSDK's TurnSystem and TeleportSystem. The tool dial,
 * teleport aiming and the tutorial each hold them for their own reasons; a
 * system resumes only when none of them still does.
 */

import { TeleportSystem, TurnSystem, type World } from '@iwsdk/core';

const turnHolders = new Set<string>();
const teleportHolders = new Set<string>();

export function holdTurning(world: World, owner: string, held: boolean): void {
  if (held) turnHolders.add(owner);
  else turnHolders.delete(owner);
  syncLocomotionHolds(world);
}

export function holdTeleport(world: World, owner: string, held: boolean): void {
  if (held) teleportHolders.add(owner);
  else teleportHolders.delete(owner);
  syncLocomotionHolds(world);
}

export function teleportHeld(): boolean {
  return teleportHolders.size > 0;
}

/**
 * Apply the holds. Also called every frame, because LocomotionSystem
 * registers TeleportSystem only once its worker is ready.
 */
export function syncLocomotionHolds(world: World): void {
  const turn = world.getSystem(TurnSystem);
  if (turn && turn.isPaused !== turnHolders.size > 0) {
    if (turnHolders.size > 0) turn.stop();
    else turn.play();
  }
  const teleport = world.getSystem(TeleportSystem);
  if (teleport && teleport.isPaused !== teleportHolders.size > 0) {
    if (teleportHolders.size > 0) teleport.stop();
    else teleport.play();
  }
}
