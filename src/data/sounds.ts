/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Sound effect catalog and mix, transcribed from the legacy AudioMixing.js.
 * Volumes are decibels; `maxDistance` is where linear rolloff bottoms out.
 * A `rolloff` of 0 makes a sound non-spatial.
 */

export interface SoundSpec {
  file: string;
  db: number;
  maxDistance?: number;
  rolloff?: number;
}

const sfx = (name: string, db: number, maxDistance?: number): SoundSpec => ({
  file: `sounds/woodland_${name}.mp3`,
  db,
  ...(maxDistance ? { maxDistance } : {}),
});

const series = (
  prefix: string,
  name: string,
  count: number,
  db: number,
  maxDistance?: number,
): Record<string, SoundSpec> =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      return [`${prefix}_${n}`, sfx(`${name}_${n}`, db, maxDistance)];
    }),
  );

type N4 = '01' | '02' | '03' | '04';
type N5 = N4 | '05';
type SeriesId =
  | `WATER_FLOW_LOOP_${N4}`
  | `OCEAN_WAVES_LOOP_${N4}`
  | `SEAGULLS_LOOP_${N5}`
  | `GRASS_FOOTSTEPS_${N5 | '06'}`
  | `DIRT_FOOTSTEPS_${N5}`
  | `STONE_FOOTSTEPS_${N5}`
  | `WOOD_FOOTSTEPS_${N5}`;

const NAMED = {
  CAMERA_DELETE: sfx('camera_delete', -8),
  CAMERA_SAVE: sfx('camera_save', -8),
  CAMERA_SHUTTER: sfx('camera_shutter', -8),
  CAMERA_PICTURE_SLIDING: sfx('camera_picture_sliding_out', -20),
  CHOOSING_SEED: sfx('choosing_seed', -12),
  // The legacy mix deliberately swaps these two files.
  MENU_OPEN: sfx('pui_close', -10),
  MENU_CLOSE: sfx('pui_open', -10),
  PLANTING_SEED: sfx('planting_seed', -8),
  PLANT_GROWTH_LOOP: sfx('plant_growth_loop', -36),
  PLANT_GROWTH_LOOP_02: sfx('plant_growth_loop_2', -30),
  REMOVING_SEED: sfx('removing_seed', -10),
  SEEDBOX_OPEN: sfx('seedbox_open', -20),
  SEEDBOX_PAGINATE_NEXT: sfx('seedbox_paginate_next', -10),
  SEEDBOX_PAGINATE_PREV: sfx('seedbox_paginate_previous', -10),
  TELEPORT_EXTEND_LINE: sfx('teleport_extend_line', -21),
  TELEPORT_SNAP_TURN: sfx('teleport_snap_turn_rotate', -32),
  TELEPORT: sfx('teleport', -30),
  THROW_SEED: sfx('throwing_seed', -15),
  WATERING_GROUND_LOOP: sfx('watering_ground_loop', -18),
  WATERING_SEED_LOOP: sfx('watering_seed_loop', -18),
  OCEAN_AMBIENT_LOOP: sfx('ocean_amb_loop', -25),
  HEADLOCKED_AMBIENT_LOOP: { ...sfx('headlocked_wind_amb_loop', -34), rolloff: 0 },
  DUCKS_LOOP: sfx('ducks_loop_06', -27, 12),
} satisfies Record<string, SoundSpec>;

export type SoundId = keyof typeof NAMED | SeriesId;

export const SOUNDS = {
  ...NAMED,
  ...series('WATER_FLOW_LOOP', 'water_flow_loop', 4, -20, 30),
  ...series('OCEAN_WAVES_LOOP', 'ocean_waves_loop', 4, -15, 30),
  ...series('SEAGULLS_LOOP', 'seagulls_loop', 5, -24, 30),
  ...series('GRASS_FOOTSTEPS', 'grass_footsteps', 6, -30),
  ...series('DIRT_FOOTSTEPS', 'dirt_footsteps', 5, -30),
  ...series('STONE_FOOTSTEPS', 'stone_footsteps', 5, -30),
  ...series('WOOD_FOOTSTEPS', 'wood_footsteps', 5, -30),
} as Record<SoundId, SoundSpec>;

/**
 * Streamed (not preloaded) background music: the two open-licensed tracks the
 * legacy GitHub build shipped, at its -33 dB mix.
 */
export const SOUNDTRACK = [
  { id: 'MUSIC_ARABESQUE', title: 'Arabesque No. 1 (Debussy)', file: 'soundtrack/arabesque.mp3' },
  { id: 'MUSIC_SPINDLE', title: 'Spindle', file: 'soundtrack/spindle.mp3' },
] as const;

export const MUSIC_DB = -33;
