/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { join } from 'node:path';
import { PUBLIC, fileExists } from '../test-utils/repo.js';
import { MUSIC_DB, SOUNDS, SOUNDTRACK, type SoundSpec } from './sounds.js';

const AUDIO = join(PUBLIC, 'flowerbed/audio');
const entries = Object.entries(SOUNDS) as [string, SoundSpec][];

describe('SOUNDS', () => {
  it('points every effect at an mp3 that ships in public/flowerbed/audio', () => {
    const missing = entries.filter(([, sound]) => !fileExists(join(AUDIO, sound.file))).map(([id]) => id);
    expect(missing).toEqual([]);
  });

  it('expands every numbered series with zero-padded ids', () => {
    const counts: Record<string, number> = {
      WATER_FLOW_LOOP: 4,
      OCEAN_WAVES_LOOP: 4,
      SEAGULLS_LOOP: 5,
      GRASS_FOOTSTEPS: 6,
      DIRT_FOOTSTEPS: 5,
      STONE_FOOTSTEPS: 5,
      WOOD_FOOTSTEPS: 5,
    };
    for (const [prefix, count] of Object.entries(counts)) {
      const ids = Object.keys(SOUNDS).filter((id) => id.startsWith(`${prefix}_`));
      expect(ids.sort(), prefix).toEqual(Array.from({ length: count }, (_, i) => `${prefix}_0${i + 1}`));
    }
  });

  it('mixes every effect at a sensible attenuation', () => {
    for (const [id, sound] of entries) {
      expect(sound.db, id).toBeLessThanOrEqual(0);
      expect(sound.db, id).toBeGreaterThanOrEqual(-60);
      if (sound.maxDistance != null) expect(sound.maxDistance, id).toBeGreaterThan(0);
    }
    expect(MUSIC_DB).toBeLessThan(0);
  });

  it('keeps the head-locked wind non-spatial and the rest spatial', () => {
    expect(SOUNDS.HEADLOCKED_AMBIENT_LOOP.rolloff).toBe(0);
    const nonSpatial = entries.filter(([, sound]) => sound.rolloff === 0).map(([id]) => id);
    expect(nonSpatial).toEqual(['HEADLOCKED_AMBIENT_LOOP']);
  });

  it('keeps the deliberate legacy swap of the menu open/close files', () => {
    expect(SOUNDS.MENU_OPEN.file).toBe('sounds/woodland_pui_close.mp3');
    expect(SOUNDS.MENU_CLOSE.file).toBe('sounds/woodland_pui_open.mp3');
  });
});

describe('SOUNDTRACK', () => {
  it('streams tracks that ship in public/flowerbed/audio', () => {
    const missing = SOUNDTRACK.filter((track) => !fileExists(join(AUDIO, track.file))).map((track) => track.id);
    expect(missing).toEqual([]);
  });

  it('has unique ids and titled tracks', () => {
    expect(new Set(SOUNDTRACK.map((track) => track.id)).size).toBe(SOUNDTRACK.length);
    for (const track of SOUNDTRACK) expect(track.title.trim()).not.toBe('');
  });
});
