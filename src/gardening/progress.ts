/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Gentle progression: seed pages 2-4 unlock through small gardening
 * milestones (plant, water, photograph). Stats persist per player, across
 * gardens. Existing players keep everything they had already earned.
 */

import { signal } from '@iwsdk/core';
import { BURST_STYLES, bursts } from '../core/bursts.js';
import { readStored, writeStored } from '../core/storage.js';
import { showToast } from '../core/state.js';
import { uiUnlock } from '../core/ui-sounds.js';
import type { Vector3 } from '@iwsdk/core';

const KEY = 'progress';

/** Stored string arrays, ignoring anything a corrupt or older save left behind. */
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

export interface Stats {
  planted: number;
  watered: number;
  photos: number;
  /** Plants watered to full size. */
  maxed: number;
  /** Thirsty plants revived. */
  revived: number;
  /** Photos kept in the album. */
  kept: number;
  /** Distinct varieties ever planted (count of `varieties`). */
  varietyCount: number;
  /** Largest garden so far. */
  biggestGarden: number;
  /** Most photos standing in one garden at once. */
  displayed: number;
  /** Seeds planted at night. */
  nightPlanted: number;
  /** Plants revived or fully grown in the morning / at sunset. */
  morningCared: number;
  sunsetCared: number;
  /** Garden tours taken. */
  tours: number;
  /** Photos placed on easels. */
  displaysPlaced: number;
}

/** Goals that award cosmetic finishes, in two sets of six. */
export interface Goal {
  id: string;
  set: 'tools' | 'garden';
  /** Finishes in the same slot replace each other. */
  slot: 'can' | 'camera' | 'seedbox' | 'frames' | 'easel' | 'fireflies' | 'lanterns' | 'petals';
  title: string;
  stat: keyof Stats;
  goal: number;
  reward: string;
  /** Swatch for the reward icon. */
  color: string;
  /** Hand holding the tool that gets the finish (for the reveal). */
  hand: 'left' | 'right' | null;
}

export const GOALS: Goal[] = [
  {
    id: 'variety',
    set: 'tools',
    slot: 'can',
    hand: 'right',
    title: 'Plant 8 different varieties',
    stat: 'varietyCount',
    goal: 8,
    reward: 'Copper watering can',
    color: '#e0875a',
  },
  {
    id: 'earlybird',
    set: 'tools',
    slot: 'can',
    hand: 'right',
    title: 'Revive or fully grow 5 plants in the morning',
    stat: 'morningCared',
    goal: 5,
    reward: 'Dew-blue watering can',
    color: '#8cc8ff',
  },
  {
    id: 'meadow',
    set: 'tools',
    slot: 'can',
    hand: 'right',
    title: 'Grow a garden of 25 plants',
    stat: 'biggestGarden',
    goal: 25,
    reward: 'Golden watering can',
    color: '#f6c443',
  },
  {
    id: 'greenthumb',
    set: 'tools',
    slot: 'camera',
    hand: 'right',
    title: 'Grow 5 plants to full size',
    stat: 'maxed',
    goal: 5,
    reward: 'Mint camera',
    color: '#8cf2c6',
  },
  {
    id: 'photographer',
    set: 'tools',
    slot: 'camera',
    hand: 'right',
    title: 'Take 15 photos',
    stat: 'photos',
    goal: 15,
    reward: 'Silver camera',
    color: '#d9dee6',
  },
  {
    id: 'caretaker',
    set: 'tools',
    slot: 'seedbox',
    hand: 'left',
    title: 'Revive 5 thirsty plants',
    stat: 'revived',
    goal: 5,
    reward: 'Golden seedbox',
    color: '#f6c443',
  },
  {
    id: 'album',
    set: 'garden',
    slot: 'frames',
    hand: null,
    title: 'Keep 5 photos',
    stat: 'kept',
    goal: 5,
    reward: 'Gilded photo frames',
    color: '#e8b84a',
  },
  {
    id: 'curator',
    set: 'garden',
    slot: 'easel',
    hand: null,
    title: 'Display 3 photos in one garden',
    stat: 'displayed',
    goal: 3,
    reward: 'Walnut easels',
    color: '#8a5a3a',
  },
  {
    id: 'nightowl',
    set: 'garden',
    slot: 'fireflies',
    hand: null,
    title: 'Plant 5 seeds at night',
    stat: 'nightPlanted',
    goal: 5,
    reward: 'Firefly swarm',
    color: '#d8ff6a',
  },
  {
    id: 'duskkeeper',
    set: 'garden',
    slot: 'lanterns',
    hand: null,
    title: 'Revive or fully grow 5 plants at sunset',
    stat: 'sunsetCared',
    goal: 5,
    reward: 'Sunset lanterns',
    color: '#ffa04a',
  },
  {
    id: 'bloomer',
    set: 'garden',
    slot: 'petals',
    hand: null,
    title: 'Grow 15 plants to full size',
    stat: 'maxed',
    goal: 15,
    reward: 'Blossom petals',
    color: '#ff9ccf',
  },
  {
    id: 'florist',
    set: 'garden',
    slot: 'petals',
    hand: null,
    title: 'Plant 40 seeds',
    stat: 'planted',
    goal: 40,
    reward: 'Golden pollen',
    color: '#ffe27a',
  },
];

export function goalDone(id: string): boolean {
  const goal = GOALS.find((entry) => entry.id === id);
  return goal != null && stats.peek()[goal.stat] >= goal.goal;
}

const FINISH_KEY = 'finishes-off';

/** Earned finishes the player has switched off (Settings > Goals). */
export const finishesOff = signal<string[]>(stringList(readStored(FINISH_KEY, [])));

/** Whether a goal's finish is earned and equipped. */
export function finishOn(id: string): boolean {
  return goalDone(id) && !finishesOff.peek().includes(id);
}

/** Equip or unequip a finish; equipping replaces others in its slot. */
export function toggleFinish(id: string, on = !finishOn(id)): void {
  const goal = GOALS.find((entry) => entry.id === id);
  if (!goal) return;
  const off = finishesOff.peek().filter((entry) => entry !== id);
  if (on) {
    for (const other of GOALS) {
      if (other.slot === goal.slot && other.id !== id && !off.includes(other.id)) off.push(other.id);
    }
  } else {
    off.push(id);
  }
  finishesOff.value = off;
  writeStored(FINISH_KEY, off);
}

/** Fires on any change that can alter a finish (progress or equip). */
export function onFinishChange(run: () => void): () => void {
  const a = stats.subscribe(run);
  const b = finishesOff.subscribe(run);
  return () => {
    a();
    b();
  };
}

export interface Milestone {
  page: number;
  stat: keyof Stats;
  goal: number;
  /** Shown on the locked page. */
  task: string;
  reward: string;
}

export const MILESTONES: Milestone[] = [
  { page: 1, stat: 'planted', goal: 3, task: 'Plant 3 seeds', reward: 'Nasturtiums, tulips and carnations' },
  { page: 2, stat: 'watered', goal: 2, task: 'Revive or fully grow 2 plants', reward: 'Daffodils, roses and pansies' },
  { page: 3, stat: 'photos', goal: 2, task: 'Take 2 photos', reward: 'Succulents and lavender' },
];

const EMPTY: Stats = {
  planted: 0,
  watered: 0,
  photos: 0,
  maxed: 0,
  revived: 0,
  kept: 0,
  varietyCount: 0,
  biggestGarden: 0,
  displayed: 0,
  nightPlanted: 0,
  morningCared: 0,
  sunsetCared: 0,
  tours: 0,
  displaysPlaced: 0,
};
const VARIETY_KEY = 'varieties';

function load(): Stats {
  const saved = readStored<unknown>(KEY, {});
  const stats = { ...EMPTY };
  if (saved && typeof saved === 'object') {
    for (const key of Object.keys(EMPTY) as (keyof Stats)[]) {
      const value = (saved as Partial<Record<keyof Stats, unknown>>)[key];
      if (typeof value === 'number' && Number.isFinite(value)) stats[key] = value;
    }
  }
  return stats;
}

const varieties = new Set<string>(stringList(readStored(VARIETY_KEY, [])));

/** Remember a planted variety for the diversity goal. */
export function recordVariety(plantId: string, quiet = false): void {
  if (varieties.has(plantId)) return;
  varieties.add(plantId);
  writeStored(VARIETY_KEY, [...varieties]);
  record('varietyCount', undefined, varieties.size - stats.peek().varietyCount, quiet);
}

/** Track a best-ever value (garden size, photos on display); never counts down. */
export function recordBest(stat: 'biggestGarden' | 'displayed', value: number, quiet = false): void {
  const best = stats.peek()[stat];
  if (value > best) record(stat, undefined, value - best, quiet);
}

export function recordGardenSize(size: number, quiet = false): void {
  recordBest('biggestGarden', size, quiet);
}

export const stats = signal<Stats>(load());

/**
 * Weekly challenges: three small goals drawn from a pool each week
 * (Monday to Monday, local time), counted from where your stats stood when
 * the week began. Finishing all three earns a ribbon.
 */
export interface WeeklyGoal {
  id: string;
  title: string;
  stat: keyof Stats;
  goal: number;
  /** A short nudge shown under the challenge. */
  hint: string;
  icon: 'sprout' | 'water' | 'camera';
}

const WEEKLY_POOL: WeeklyGoal[] = [
  {
    id: 'w-plant',
    title: 'Plant 10 seeds',
    stat: 'planted',
    goal: 10,
    hint: 'Any variety, any garden',
    icon: 'sprout',
  },
  {
    id: 'w-grow',
    title: 'Grow 4 plants to full size',
    stat: 'maxed',
    goal: 4,
    hint: 'Keep watering until they bloom',
    icon: 'water',
  },
  {
    id: 'w-photo',
    title: 'Take 5 photos',
    stat: 'photos',
    goal: 5,
    hint: 'Try a portrait: tilt the camera',
    icon: 'camera',
  },
  {
    id: 'w-revive',
    title: 'Revive 3 thirsty plants',
    stat: 'revived',
    goal: 3,
    hint: 'Faded plants want water',
    icon: 'water',
  },
  {
    id: 'w-night',
    title: 'Plant 3 seeds at night',
    stat: 'nightPlanted',
    goal: 3,
    hint: 'Set Night on the Garden tab',
    icon: 'sprout',
  },
  { id: 'w-keep', title: 'Keep 2 photos', stat: 'kept', goal: 2, hint: 'Press Keep on a print', icon: 'camera' },
  {
    id: 'w-morning',
    title: 'Revive or grow 3 plants in the morning',
    stat: 'morningCared',
    goal: 3,
    hint: 'Set Morning on the Garden tab',
    icon: 'water',
  },
  {
    id: 'w-dusk',
    title: 'Revive or grow 3 plants at sunset',
    stat: 'sunsetCared',
    goal: 3,
    hint: 'Sunset is the default light',
    icon: 'water',
  },
  {
    id: 'w-tour',
    title: 'Take a garden tour',
    stat: 'tours',
    goal: 1,
    hint: 'Photos tab - needs an easel',
    icon: 'camera',
  },
  {
    id: 'w-display',
    title: 'Put 2 photos on easels',
    stat: 'displaysPlaced',
    goal: 2,
    hint: 'Display one from the Photos tab',
    icon: 'camera',
  },
  {
    id: 'w-variety',
    title: 'Plant 2 new varieties',
    stat: 'varietyCount',
    goal: 2,
    hint: 'Page through the seedbox',
    icon: 'sprout',
  },
  {
    id: 'w-nurture',
    title: 'Revive or grow 6 plants',
    stat: 'watered',
    goal: 6,
    hint: 'Any time of day',
    icon: 'water',
  },
  {
    id: 'w-album',
    title: 'Take 10 photos',
    stat: 'photos',
    goal: 10,
    hint: 'Portraits: tilt the camera',
    icon: 'camera',
  },
  { id: 'w-bloom', title: 'Plant 20 seeds', stat: 'planted', goal: 20, hint: 'Fill a whole planter', icon: 'sprout' },
];
const WEEKLY_KEY = 'weekly';
/** Ribbon colours, shared by the gazebo, plaques and Goals panel. */
export const RIBBON_COLORS = ['#5aa7ff', '#ef6a8a', '#5cc98a'];
/** Rewards for weekly ribbons collected over time. */
export const RIBBON_MILESTONES = [
  { at: 5, title: "Champion's pennant", detail: 'A gold pennant now flies over the gazebo' },
  { at: 10, title: 'Gold lanterns', detail: 'Every lantern glows gold, from sunset on' },
  { at: 15, title: 'Ribboned plaques', detail: 'Your photo plaques wear a gold ribbon' },
  { at: 20, title: 'Grand Champion', detail: 'Your garden carries the Grand Champion title' },
];

export function nextRibbonMilestone(ribbons: number): (typeof RIBBON_MILESTONES)[number] | null {
  return RIBBON_MILESTONES.find((m) => m.at > ribbons) ?? null;
}

/** Fired when a ribbon milestone is reached (for a fanfare and a visit offer). */
export const ribbonMilestone = signal<(typeof RIBBON_MILESTONES)[number] | null>(null);

/** Every fifth ribbon is a gold champion, a colour no other ribbon uses. */
export const CHAMPION_COLOR = '#f6c443';

interface WeeklyState {
  week: number;
  base: Partial<Stats>;
  done: string[];
  ribbons: number;
}

/** Weeks since an epoch Monday, in local time. */
function weekIndex(): number {
  const now = new Date();
  const local = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((local / 86400000 - 4) / 7);
}

function weeklyPicks(week: number): WeeklyGoal[] {
  // Deterministic shuffle: everyone sees the same three this week.
  let seed = (week * 2654435761) >>> 0;
  const pool = [...WEEKLY_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

function loadWeekly(current: Stats): WeeklyState {
  const saved = readStored<WeeklyState | null>(WEEKLY_KEY, null);
  const valid =
    saved != null && typeof saved === 'object' && Array.isArray(saved.done) && typeof saved.base === 'object';
  let state = valid ? saved : null;
  const week = weekIndex();
  if (!state || state.week !== week) {
    const ribbons = typeof saved?.ribbons === 'number' ? saved.ribbons : 0;
    state = { week, base: { ...current }, done: [], ribbons };
    writeStored(WEEKLY_KEY, state);
  }
  return state;
}

export const weekly = signal<WeeklyState>(loadWeekly(stats.peek()));

/** Start the new week's challenges once Monday has come, counting from `current`. */
function rollWeek(current: Stats): void {
  if (weekly.peek().week !== weekIndex()) weekly.value = loadWeekly(current);
}

/** Whole days until the next Monday reset (1-7). */
export function weeklyDaysLeft(): number {
  const day = new Date().getDay();
  return day === 1 ? 7 : (8 - day) % 7 || 7;
}

/** This week's three challenges with progress. */
export function weeklyGoals(): (WeeklyGoal & { have: number; done: boolean })[] {
  rollWeek(stats.peek());
  const state = weekly.peek();
  const current = stats.peek();
  return weeklyPicks(state.week).map((goal) => ({
    ...goal,
    have: Math.max(0, current[goal.stat] - (state.base[goal.stat] ?? 0)),
    done: state.done.includes(goal.id),
  }));
}

function checkWeekly(quiet: boolean): void {
  const state = weekly.peek();
  const newly = weeklyGoals().filter((goal) => !goal.done && goal.have >= goal.goal);
  if (!newly.length) return;
  const done = [...state.done, ...newly.map((goal) => goal.id)];
  const ribbon = done.length >= 3 && state.done.length < 3;
  weekly.value = { ...state, done, ribbons: state.ribbons + (ribbon ? 1 : 0) };
  writeStored(WEEKLY_KEY, weekly.peek());
  if (quiet) return;
  uiUnlock();
  if (ribbon) goalReveal.value = { ...GOALS[0], id: 'weekly', hand: 'left', reward: 'Weekly ribbon' };
  const milestone = ribbon ? RIBBON_MILESTONES.find((m) => m.at === weekly.peek().ribbons) : undefined;
  if (milestone) {
    ribbonMilestone.value = milestone;
    showToast(
      `${milestone.title} unlocked!`,
      `${milestone.detail} - visit it from Settings > Goals`,
      '#f6c443',
      'left',
    );
  } else if (ribbon)
    showToast(
      'Weekly ribbon earned!',
      `All three challenges done - ${weekly.peek().ribbons} ribbon${weekly.peek().ribbons === 1 ? '' : 's'} so far`,
      '#f6c443',
      'left',
    );
  else showToast('Weekly challenge done', newly[0].title, '#f6c443', 'left');
}

/** The goal just completed, for the reward reveal (see FeedbackSystem). */
export const goalReveal = signal<Goal | null>(null);

export function isPageUnlocked(page: number): boolean {
  const milestone = MILESTONES.find((entry) => entry.page === page);
  return !milestone || stats.peek()[milestone.stat] >= milestone.goal;
}

export function lockFor(page: number): { milestone: Milestone; have: number } | null {
  const milestone = MILESTONES.find((entry) => entry.page === page);
  if (!milestone) return null;
  const have = stats.peek()[milestone.stat];
  return have >= milestone.goal ? null : { milestone, have };
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function flushStats(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  // Storage full or disabled: progress still works for this session.
  writeStored(KEY, stats.peek());
}

/**
 * Stats are written at most once a second: each localStorage write stalls
 * the Quest main thread, and one watering pass can record a dozen actions.
 */
function persistStats(): void {
  persistTimer ??= setTimeout(flushStats, 1000);
}
addEventListener('pagehide', flushStats);

/**
 * Count a gardening action; celebrates any page or finish it unlocks.
 * `quiet` updates silently (credit computed on load).
 */
export function record(stat: keyof Stats, at?: Vector3, amount = 1, quiet = false): void {
  const before = stats.peek();
  // The first action of a new week counts toward that week's challenges.
  rollWeek(before);
  const next = { ...before, [stat]: before[stat] + amount };
  stats.value = next;
  persistStats();
  for (const goal of GOALS) {
    if (goal.stat !== stat) continue;
    if (before[stat] < goal.goal && next[stat] >= goal.goal) {
      // A new finish is equipped straight away (replacing its slot).
      toggleFinish(goal.id, true);
      if (quiet) continue;
      uiUnlock();
      if (at) bursts.emit(at, BURST_STYLES.bloom);
      goalReveal.value = goal;
      showToast(
        `${goal.reward} unlocked!`,
        'Equipped now - switch it in Settings > Goals',
        '#f6c443',
        goal.hand ?? 'left',
      );
    }
  }
  if (!quiet) checkWeekly(false);
  for (const milestone of MILESTONES) {
    if (milestone.stat !== stat) continue;
    if (before[stat] < milestone.goal && next[stat] >= milestone.goal) {
      if (quiet) continue;
      uiUnlock();
      if (at) bursts.emit(at, BURST_STYLES.bloom);
      showToast('New seeds unlocked!', milestone.reward, '#f6c443', 'left');
    }
  }
}

/** Players with existing gardens get credit for what they already grew. */
export function seedProgressFromGardens(gardens: { plants: { type: string }[]; displays?: unknown[] }[]): void {
  const before = GOALS.filter((goal) => goalDone(goal.id)).length;
  const statsBefore = stats.peek();
  const total = gardens.reduce((sum, garden) => sum + garden.plants.length, 0);
  if (stats.peek().planted < total) record('planted', undefined, total - stats.peek().planted, true);
  for (const garden of gardens) {
    recordGardenSize(garden.plants.length, true);
    recordBest('displayed', garden.displays?.length ?? 0, true);
    for (const plant of garden.plants) recordVariety(plant.type, true);
  }
  // Credit for old gardens is not progress this week: move the baseline.
  const state = weekly.peek();
  const base = { ...state.base };
  for (const key of Object.keys(statsBefore) as (keyof Stats)[]) {
    base[key] = (base[key] ?? 0) + stats.peek()[key] - statsBefore[key];
  }
  weekly.value = { ...state, base };
  writeStored(WEEKLY_KEY, weekly.peek());
  // One calm summary instead of a burst of reveals on load.
  const earned = GOALS.filter((goal) => goalDone(goal.id)).length - before;
  if (earned > 0) {
    showToast(
      earned === 1 ? 'A finish was waiting for you' : `${earned} finishes were waiting for you`,
      'Your saved gardens earned them - see Settings > Goals',
      '#f6c443',
      'left',
    );
  }
}
