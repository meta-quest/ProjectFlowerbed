/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Shared, observable game state. Systems read with `.peek()` in update loops
 * and subscribe for transitions; UI binds directly to these signals.
 */

import { signal } from '@iwsdk/core';

export const Tool = {
  Explore: 'explore',
  Seeds: 'seeds',
  Remove: 'remove',
  Water: 'water',
  Camera: 'camera',
  Settings: 'settings',
} as const;
export type Tool = (typeof Tool)[keyof typeof Tool];

export const TOOL_ORDER: readonly Tool[] = [
  Tool.Seeds,
  Tool.Water,
  Tool.Remove,
  Tool.Camera,
  Tool.Explore,
  Tool.Settings,
];

export const TOOL_INFO: Record<Tool, { label: string; hint: string; handHint?: string; icon: string; color: string }> =
  {
    explore: {
      label: 'Explore',
      hint: 'Wander and enjoy the island',
      icon: 'Footprints',
      color: '#8fb8de',
    },
    seeds: {
      label: 'Seeds',
      hint: 'Pick a seed, aim, release the trigger',
      handHint: 'Pinch a packet in the seedbox, aim, pinch to plant',
      icon: 'Sprout',
      color: '#86dc3d',
    },
    remove: {
      label: 'Remove',
      hint: 'Point at a plant, hold the trigger until the ring fills',
      handHint: 'Point at a plant, pinch and hold until the ring fills',
      icon: 'Shovel',
      color: '#ef8a6f',
    },
    water: {
      label: 'Water',
      hint: 'Hold the trigger to make plants grow bigger',
      handHint: 'Pinch and hold to pour - plants grow bigger',
      icon: 'Droplets',
      color: '#5aa7ff',
    },
    camera: {
      label: 'Camera',
      hint: 'Trigger to shoot - X/Y to zoom',
      handHint: 'Pinch to shoot - drop the print on Keep or Discard',
      icon: 'Camera',
      color: '#f6c443',
    },
    settings: {
      label: 'Settings',
      hint: 'Garden, comfort and sound',
      icon: 'Settings',
      color: '#c3a6ea',
    },
  };

/** The active tool. Settings is a panel, so it never becomes the held tool. */
export const activeTool = signal<Tool>(Tool.Explore);
/** True while the tool dial is open; every tool behaves as unequipped. */
export const toolDialOpen = signal(false);
/** True while the teleport arc is engaged. */
export const teleporting = signal(false);
/** Index into PLANTS of the selected seed. */
export const selectedPlant = signal(0);
/** Seedbox page currently shown. */
export const seedboxPage = signal(0);
/** Tutorial running; restricts the dial to Seeds. */
export const tutorialActive = signal(false);
/** The dial cannot open at all (early tutorial steps, legacy NUX). */
export const dialLocked = signal(false);
/** Open spatial panel, if any. */
export const openPanel = signal<'none' | 'settings' | 'controls'>('none');
/** Total plants in the active garden (for UI). */
export const plantCount = signal(0);
/** Bumped whenever the garden changes and should be persisted. */
export const gardenDirty = signal(0);

/** Short confirmation shown on the hand chip (e.g. "Garden saved"). */
export const toast = signal<{
  label: string;
  sub: string;
  color: string;
  hand: 'left' | 'right';
  at: number;
  /** How many identical toasts were merged into this one. */
  count: number;
} | null>(null);

export function showToast(label: string, sub: string, color = '#86dc3d', hand: 'left' | 'right' = 'right'): void {
  // Repeats of the same toast merge into one with a counter.
  const current = toast.peek();
  const now = performance.now();
  const merge = current && current.label === label && now - current.at < 2500;
  toast.value = { label, sub, color, hand, at: now, count: merge ? current.count + 1 : 1 };
}

export function markGardenDirty(): void {
  gardenDirty.value = gardenDirty.peek() + 1;
}

/** True while the seedbox label should pulse its X / Y key badges. */
export const seedPagingHint = signal(false);

/** Bumped to request a brief comfort blink (teleports). */
export const blink = signal(0);

/** True while an XR session (real or emulated) is presenting. */
export const inXR = signal(false);

/** True while hand tracking is in use (either hand); UI then says "pinch". */
export const handMode = signal(false);

/** Pick the wording for the current input: controllers or tracked hands. */
export function byInput(controller: string, hands: string): string {
  return handMode.peek() ? hands : controller;
}

/** A tool's hint line for the current input. */
export function toolHint(tool: Tool): string {
  const info = TOOL_INFO[tool];
  return handMode.peek() && info.handHint ? info.handHint : info.hint;
}

/** The time-of-day look currently shown (Auto resolves to one of these). */
export const timePreset = signal<'morning' | 'sunset' | 'night'>('sunset');

/** A tool is "live" when it is held and nothing overrides it. */
export function isToolLive(tool: Tool): boolean {
  return (
    inXR.peek() &&
    activeTool.peek() === tool &&
    !toolDialOpen.peek() &&
    !teleporting.peek() &&
    // An open panel (Settings) puts the props away so both hands are free for it.
    openPanel.peek() === 'none'
  );
}
