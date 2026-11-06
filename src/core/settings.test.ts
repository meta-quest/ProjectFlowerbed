/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { DEFAULT_SETTINGS } from './storage.js';

const SETTINGS_KEY = 'flowerbed:v1:settings';

/** settings.ts reads storage at import time, so load a fresh copy per test. */
async function freshSettings() {
  vi.resetModules();
  const module = await import('./settings.js');
  const storage = await import('./storage.js');
  return { ...module, loadSettings: storage.loadSettings };
}

beforeEach(() => localStorage.clear());

describe('settings signal', () => {
  it('starts from defaults on a fresh install', async () => {
    const { settings } = await freshSettings();
    expect(settings.peek()).toEqual(DEFAULT_SETTINGS);
  });

  it('starts from the stored settings merged over defaults', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ music: false, moveSpeed: 4.5 }));
    const { settings } = await freshSettings();
    expect(settings.peek()).toEqual({ ...DEFAULT_SETTINGS, music: false, moveSpeed: 4.5 });
  });

  it('merges a patch, keeps other fields and persists it', async () => {
    const { settings, updateSettings, loadSettings } = await freshSettings();
    updateSettings({ snapTurnDeg: 90 });
    expect(settings.peek()).toEqual({ ...DEFAULT_SETTINGS, snapTurnDeg: 90 });
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, snapTurnDeg: 90 });
  });

  it('accumulates successive patches and survives a reload', async () => {
    const first = await freshSettings();
    first.updateSettings({ vignette: false });
    first.updateSettings({ turnStyle: 'smooth', timeOfDay: 'night' });
    const second = await freshSettings();
    expect(second.settings.peek()).toEqual({
      ...DEFAULT_SETTINGS,
      vignette: false,
      turnStyle: 'smooth',
      timeOfDay: 'night',
    });
  });

  it('notifies subscribers with a new object on each update', async () => {
    const { settings, updateSettings } = await freshSettings();
    const seen: unknown[] = [];
    const unsubscribe = settings.subscribe((value) => seen.push(value));
    const before = settings.peek();
    updateSettings({ uiSounds: false });
    unsubscribe();
    expect(seen).toHaveLength(2); // initial call + one update
    expect(seen[1]).not.toBe(before);
    expect(before.uiSounds).toBe(true);
  });
});
