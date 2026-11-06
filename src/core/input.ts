/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Thin helpers over IWSDK XR input: haptics, controller poses, a check for
 * whether a ray is busy with UI, and "select" that means the trigger on a
 * controller and a pinch on a tracked hand, so tools work either way.
 */

import { InputComponent, Quaternion, Vector3, type World } from '@iwsdk/core';

export type Hand = 'left' | 'right';
export { InputComponent };

export function gamepad(world: World, hand: Hand) {
  return world.input.xr.gamepads[hand];
}

export function pressedDown(world: World, hand: Hand, button: InputComponent): boolean {
  return gamepad(world, hand)?.getButtonDown(button) ?? false;
}

export function released(world: World, hand: Hand, button: InputComponent): boolean {
  return gamepad(world, hand)?.getButtonUp(button) ?? false;
}

export function held(world: World, hand: Hand, button: InputComponent): boolean {
  return gamepad(world, hand)?.getButtonPressed(button) ?? false;
}

export function value(world: World, hand: Hand, button: InputComponent): number {
  return gamepad(world, hand)?.getButtonValue(button) ?? 0;
}

const pulseTimes = { left: 0, right: 0 };

/** Fire a haptic pulse; repeated calls inside 8 ms are coalesced. */
export function haptic(world: World, hand: Hand, intensity: number, ms: number): void {
  const now = performance.now();
  if (now - pulseTimes[hand] < 8 && intensity < 0.5) return;
  pulseTimes[hand] = now;
  const actuator = gamepad(world, hand)?.gamepad.hapticActuators?.[0] as
    { pulse?: (value: number, duration: number) => Promise<boolean> } | undefined;
  void actuator?.pulse?.(intensity, ms)?.catch?.(() => {});
}

/** Select pressed this frame: trigger on a controller, pinch on a hand. */
export function selectDown(world: World, hand: Hand): boolean {
  if (world.input.xr.isPrimary('hand', hand)) return world.input.xr.getSelectState(hand).start;
  return gamepad(world, hand)?.getButtonDown(InputComponent.Trigger) ?? false;
}

/** Select held: trigger on a controller, pinch on a hand. */
export function selectHeld(world: World, hand: Hand): boolean {
  if (world.input.xr.isPrimary('hand', hand)) return world.input.xr.getSelectState(hand).active;
  return gamepad(world, hand)?.getButtonPressed(InputComponent.Trigger) ?? false;
}

/** Select released this frame. */
export function selectUp(world: World, hand: Hand): boolean {
  if (world.input.xr.isPrimary('hand', hand)) return world.input.xr.getSelectState(hand).end;
  return gamepad(world, hand)?.getButtonUp(InputComponent.Trigger) ?? false;
}

/** Analog select: trigger travel, or how closed the pinch is. */
export function selectValue(world: World, hand: Hand): number {
  const xr = world.input.xr;
  if (xr.isPrimary('hand', hand)) {
    return xr.getSelectState(hand).active ? 1 : xr.visualAdapters.hand[hand].getPinchStrength();
  }
  return gamepad(world, hand)?.getButtonValue(InputComponent.Trigger) ?? 0;
}

/** The hand pointing at UI (for UI haptics); trigger breaks ties. */
export function clickingHand(world: World): Hand {
  const leftBusy = rayBusy(world, 'left');
  if (leftBusy !== rayBusy(world, 'right')) return leftBusy ? 'left' : 'right';
  const left = selectValue(world, 'left');
  const right = selectValue(world, 'right');
  return left > right ? 'left' : 'right';
}

/** True when the right-hand ray is hovering an IWSDK interactable (UI etc). */
export function rayBusy(world: World, hand: Hand = 'right'): boolean {
  return world.input.xr.multiPointers[hand].getRayBusy();
}

export function gripPosition(world: World, hand: Hand, out: Vector3): Vector3 {
  return world.player.gripSpaces[hand].getWorldPosition(out);
}

export function rayPose(world: World, hand: Hand, origin: Vector3, direction: Vector3): void {
  const space = world.player.raySpaces[hand];
  space.getWorldPosition(origin);
  space.getWorldQuaternion(tmpQuat);
  direction.set(0, 0, -1).applyQuaternion(tmpQuat);
}

export function headPosition(world: World, out: Vector3): Vector3 {
  return world.player.head.getWorldPosition(out);
}

const tmpQuat = new Quaternion();

/** Whether a controller (not a tracked hand) is connected on this side. */
export function hasController(world: World, hand: Hand): boolean {
  return world.input.xr.gamepads[hand] != null;
}
