/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * The one place that reaches into LocomotionSystem internals (verified
 * against @iwsdk/core 1.1.0-rc.2).
 *
 * Its only public move is setPlayerPosition, which also rewrites the
 * respawn point, and the manifest has no switch for stock teleport. Flowerbed
 * needs plain teleports (garden tour, easel and gazebo visits, fall recovery),
 * so it borrows the locomotor.
 * If an IWSDK upgrade renames them, development builds say so instead of
 * those features silently doing nothing.
 */

import { LocomotionSystem, type Vector3, type World } from '@iwsdk/core';

export interface Locomotor {
  teleport(position: Vector3): void;
  isGrounded: boolean;
}

export interface LocomotionInternals {
  locomotor?: Locomotor;
}

let warned = false;

/** Development builds report once when the internals this app relies on have moved. */
export function warnLocomotionMissing(): void {
  if (!import.meta.env.DEV || warned) return;
  warned = true;
  console.error('[flowerbed] LocomotionSystem internals not found; teleports are disabled. Check the IWSDK version.');
}

/** LocomotionSystem's internals, or null while it boots (or if they moved). */
export function locomotionInternals(world: World): LocomotionInternals | null {
  const system = world.getSystem(LocomotionSystem) as unknown as LocomotionInternals | undefined;
  return system?.locomotor ? system : null;
}

/** When the app last moved the player itself (ms), so its jumps aren't mistaken for the player's. */
export const appTeleportAt = { value: -Infinity };

/** Move the player without touching the respawn point. Returns false if locomotion is unavailable. */
export function teleportPlayer(world: World, position: Vector3): boolean {
  const locomotor = locomotionInternals(world)?.locomotor;
  if (!locomotor) {
    warnLocomotionMissing();
    return false;
  }
  appTeleportAt.value = performance.now();
  locomotor.teleport(position);
  return true;
}

/** The authored player spawn (the scene's spawn point, or the configured start). */
export function playerSpawn(world: World, out: Vector3): Vector3 {
  const value = world.getSystem(LocomotionSystem)?.config.initialPlayerPosition.value;
  return value ? out.fromArray(value) : out.set(0, 0, 0);
}
