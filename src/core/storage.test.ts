/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  DEFAULT_SETTINGS,
  createGarden,
  deleteGarden,
  getActiveGardenId,
  hasFlag,
  listGardens,
  loadGarden,
  loadSettings,
  readStored,
  renameGarden,
  resolveStartupGarden,
  saveGarden,
  saveSettings,
  setActiveGardenId,
  setFlag,
  writeStored,
  type SavedPlant,
} from './storage.js';
import { fullStorage } from '../test-utils/storage.js';

const INDEX_KEY = 'flowerbed:v1:gardens';
const ACTIVE_KEY = 'flowerbed:v1:active-garden';
const SETTINGS_KEY = 'flowerbed:v1:settings';
const FLAG_KEY = 'flowerbed:v1:flags';

const plant = (type: string, x = 0): SavedPlant => ({
  type,
  position: [x, 0, 0],
  yaw: 0.5,
  scale: [1, 1.1, 1],
  growth: 1.5,
  segments: [1, 1, 1, 1],
  thirst: 0.2,
});

let clock = new Date(2026, 9, 28, 12).getTime();
/** Advance the mocked clock so `updated` timestamps differ. */
const tick = (ms = 1000) => vi.setSystemTime((clock += ms));

beforeEach(() => {
  localStorage.clear();
  clock = new Date(2026, 9, 28, 12).getTime();
  vi.setSystemTime(clock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('garden index', () => {
  it('creates numbered gardens with unique ids and an empty record', () => {
    expect(listGardens()).toEqual([]);
    const first = createGarden();
    tick();
    const second = createGarden();
    expect(first.name).toBe('Garden 1');
    expect(second.name).toBe('Garden 2');
    expect(createGarden('Rose bed').name).toBe('Rose bed');
    expect(first.id).not.toBe(second.id);
    expect(first).toMatchObject({ plants: 0, created: clock - 1000, updated: clock - 1000 });
    expect(loadGarden(first.id)).toEqual({ id: first.id, plants: [] });
  });

  it('lists the most recently updated garden first', () => {
    const a = createGarden('A');
    tick();
    const b = createGarden('B');
    tick();
    const c = createGarden('C');
    expect(listGardens().map((g) => g.id)).toEqual([c.id, b.id, a.id]);
    tick();
    saveGarden(a.id, [plant('oak')]);
    expect(listGardens().map((g) => g.id)).toEqual([a.id, c.id, b.id]);
  });

  it('uses the namespaced v1 keys that existing saves rely on', () => {
    const meta = createGarden();
    expect(JSON.parse(localStorage.getItem(INDEX_KEY)!)).toEqual([meta]);
    expect(localStorage.getItem(`flowerbed:v1:garden:${meta.id}`)).not.toBeNull();
  });

  it('reads a save written by an earlier build (no thirst, no displays)', () => {
    const legacy = { type: 'rose_a', position: [1, 2, 3], yaw: 0, scale: [1, 1, 1], growth: 1, segments: [1, 1, 1, 1] };
    localStorage.setItem(INDEX_KEY, JSON.stringify([{ id: 'old', name: 'Old', created: 1, updated: 2, plants: 1 }]));
    localStorage.setItem('flowerbed:v1:garden:old', JSON.stringify({ id: 'old', plants: [legacy] }));
    expect(listGardens()[0].name).toBe('Old');
    expect(loadGarden('old')).toEqual({ id: 'old', plants: [legacy] });
  });

  it('treats a well-formed but non-array index as empty', () => {
    localStorage.setItem(INDEX_KEY, 'null');
    expect(listGardens()).toEqual([]);
    localStorage.setItem(INDEX_KEY, '{"id": "g1"}');
    expect(listGardens()).toEqual([]);
  });
});

describe('saveGarden / loadGarden', () => {
  it('stores plants and displays and updates only that garden in the index', () => {
    const meta = createGarden('A');
    const other = createGarden('B');
    tick(5000);
    const plants = [plant('oak', 1), plant('rose_a', 2)];
    const displays = [{ photoId: 'p1', position: [1, 0, 2] as [number, number, number], yaw: 1 }];
    expect(saveGarden(meta.id, plants, displays)).toBe(true);
    expect(loadGarden(meta.id)).toEqual({ id: meta.id, plants, displays });
    expect(listGardens()[0]).toMatchObject({ id: meta.id, plants: 2, updated: clock, created: meta.created });
    expect(listGardens().find((g) => g.id === other.id)).toEqual(other);
  });

  it('defaults displays to an empty list', () => {
    const meta = createGarden();
    saveGarden(meta.id, [plant('oak')]);
    expect(loadGarden(meta.id)?.displays).toEqual([]);
  });

  it('returns null for an unknown or corrupt garden record', () => {
    expect(loadGarden('missing')).toBeNull();
    const meta = createGarden();
    localStorage.setItem(`flowerbed:v1:garden:${meta.id}`, '{"id": oops');
    expect(loadGarden(meta.id)).toBeNull();
  });

  it('does not add an index entry when saving an unknown id', () => {
    saveGarden('ghost', [plant('oak')]);
    expect(loadGarden('ghost')?.plants).toHaveLength(1);
    expect(listGardens()).toEqual([]);
  });

  it('reports a failed save and keeps the previous record and metadata', () => {
    const meta = createGarden();
    saveGarden(meta.id, [plant('oak')]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('localStorage', fullStorage(localStorage));
    tick();
    expect(saveGarden(meta.id, [plant('oak'), plant('fir')])).toBe(false);
    vi.unstubAllGlobals();
    expect(loadGarden(meta.id)?.plants).toHaveLength(1);
    expect(listGardens()[0].plants).toBe(1);
  });
});

describe('renameGarden / deleteGarden', () => {
  it('renames only the target garden and ignores unknown ids', () => {
    const a = createGarden('A');
    const b = createGarden('B');
    renameGarden(a.id, 'Herbs');
    renameGarden('nope', 'X');
    expect(listGardens().find((g) => g.id === a.id)?.name).toBe('Herbs');
    expect(listGardens().find((g) => g.id === b.id)?.name).toBe('B');
    expect(listGardens()).toHaveLength(2);
  });

  it('removes the record and the index entry, and forgets it as active', () => {
    const a = createGarden('A');
    const b = createGarden('B');
    setActiveGardenId(a.id);
    deleteGarden(a.id);
    expect(loadGarden(a.id)).toBeNull();
    expect(listGardens()).toEqual([b]);
    expect(getActiveGardenId()).toBeNull();
  });

  it('clears the stored active-garden key when the active garden is deleted', () => {
    const a = createGarden('A');
    setActiveGardenId(a.id);
    deleteGarden(a.id);
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
  });

  it('keeps default garden names unique after a deletion', () => {
    const first = createGarden();
    createGarden();
    deleteGarden(first.id);
    createGarden();
    const names = listGardens().map((g) => g.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('resolveStartupGarden', () => {
  it('creates and activates a first garden on empty storage, once', () => {
    const meta = resolveStartupGarden();
    expect(meta.name).toBe('Garden 1');
    expect(getActiveGardenId()).toBe(meta.id);
    expect(resolveStartupGarden().id).toBe(meta.id);
    expect(listGardens()).toHaveLength(1);
  });

  it('prefers the remembered garden over the newest one', () => {
    const old = createGarden('Old');
    tick();
    createGarden('New');
    setActiveGardenId(old.id);
    expect(resolveStartupGarden().id).toBe(old.id);
  });

  it('falls back to the newest garden when the remembered one is gone', () => {
    createGarden('Old');
    tick();
    const newest = createGarden('New');
    localStorage.setItem(ACTIVE_KEY, JSON.stringify('deleted-elsewhere'));
    expect(getActiveGardenId()).toBeNull();
    expect(resolveStartupGarden().id).toBe(newest.id);
    expect(getActiveGardenId()).toBe(newest.id);
  });

  it('recovers from a corrupt index by starting a new garden', () => {
    localStorage.setItem(INDEX_KEY, '[{"id": "broken"');
    localStorage.setItem(ACTIVE_KEY, '{nope');
    const meta = resolveStartupGarden();
    expect(meta.name).toBe('Garden 1');
    expect(listGardens()).toEqual([meta]);
  });

  it('still returns a garden when storage rejects writes', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('localStorage', fullStorage(localStorage));
    expect(resolveStartupGarden().name).toBe('Garden 1');
  });
});

describe('settings', () => {
  it('fills keys missing from an older save with defaults', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ vignette: false, snapTurnDeg: 30 }));
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, vignette: false, snapTurnDeg: 30 });
  });

  it('falls back to defaults on corrupt JSON', () => {
    localStorage.setItem(SETTINGS_KEY, '{"music":');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips saved settings without sharing the defaults object', () => {
    const custom = { ...DEFAULT_SETTINGS, music: false, turnStyle: 'smooth' as const, timeOfDay: 'night' as const };
    saveSettings(custom);
    expect(loadSettings()).toEqual(custom);
    localStorage.clear();
    loadSettings().vignette = !DEFAULT_SETTINGS.vignette;
    expect(loadSettings().vignette).toBe(DEFAULT_SETTINGS.vignette);
  });
});

describe('hint flags', () => {
  it('are unset by default and can be set and cleared independently', () => {
    expect(hasFlag('seenTutorial')).toBe(false);
    setFlag('seenTutorial');
    setFlag('seenWaterTip');
    setFlag('seenWaterTip', false);
    expect(hasFlag('seenTutorial')).toBe(true);
    expect(hasFlag('seenWaterTip')).toBe(false);
    expect(hasFlag('seenCameraTip')).toBe(false);
  });

  it('recover from corrupt storage and only treat a literal true as set', () => {
    localStorage.setItem(FLAG_KEY, 'not json');
    expect(hasFlag('seenTutorial')).toBe(false);
    setFlag('seenTutorial');
    expect(hasFlag('seenTutorial')).toBe(true);
    localStorage.setItem(FLAG_KEY, JSON.stringify({ seenTutorial: 'yes' }));
    expect(hasFlag('seenTutorial')).toBe(false);
  });
});

describe('readStored / writeStored', () => {
  it('namespace records under flowerbed:v1: and fall back when missing or corrupt', () => {
    expect(writeStored('progress', { planted: 2 })).toBe(true);
    expect(localStorage.getItem('flowerbed:v1:progress')).toBe('{"planted":2}');
    expect(readStored('progress', null)).toEqual({ planted: 2 });
    expect(readStored('missing', 'fallback')).toBe('fallback');
    localStorage.setItem('flowerbed:v1:broken', '{');
    expect(readStored('broken', 7)).toBe(7);
  });

  it('report failed writes instead of throwing (storage full or blocked)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('localStorage', fullStorage(localStorage));
    expect(writeStored('progress', {})).toBe(false);
    expect(() => createGarden()).not.toThrow();
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
    expect(() => setFlag('seenTutorial')).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});
