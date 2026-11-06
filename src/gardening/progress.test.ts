/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { PAGE_COUNT, PLANTS, SLOTS_PER_PAGE } from '../data/plants.js';
import { fullStorage, wrapStorage } from '../test-utils/storage.js';
import type { Stats } from './progress.js';

const KEY = 'flowerbed:v1:progress';
const FINISH_KEY = 'flowerbed:v1:finishes-off';
const VARIETY_KEY = 'flowerbed:v1:varieties';
const WEEKLY_KEY = 'flowerbed:v1:weekly';

const DAY = 86400000;
/** Wednesday 28 October 2026, noon local time. */
const WEDNESDAY = new Date(2026, 9, 28, 12).getTime();

/** progress.ts reads storage at import, so every test gets a fresh copy. */
async function fresh() {
  vi.resetModules();
  const progress = await import('./progress.js');
  const state = await import('../core/state.js');
  return { ...progress, toast: state.toast };
}

const storedStats = (): Partial<Stats> => JSON.parse(localStorage.getItem(KEY) ?? 'null');

/** Every stat at `value` (so no goal or milestone threshold is crossed). */
function allStats(value: number): Stats {
  return {
    planted: value,
    watered: value,
    photos: value,
    maxed: value,
    revived: value,
    kept: value,
    varietyCount: value,
    biggestGarden: value,
    displayed: value,
    nightPlanted: value,
    morningCared: value,
    sunsetCared: value,
    tours: value,
    displaysPlaced: value,
  };
}

/** Reject every storage write (quota exceeded, private mode, sandboxed embed). */
function blockWrites(): void {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('localStorage', fullStorage(localStorage));
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(WEDNESDAY);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('stats persistence', () => {
  it('starts at zero and increments by one or by an amount', async () => {
    const { stats, record } = await fresh();
    expect(stats.peek()).toEqual(allStats(0));
    record('watered');
    record('watered', undefined, 4);
    expect(stats.peek().watered).toBe(5);
  });

  it('debounces writes to one per second', async () => {
    const { record } = await fresh();
    const writes: string[] = [];
    vi.stubGlobal('localStorage', wrapStorage(localStorage, { onSet: (key) => writes.push(key) }));
    record('planted');
    record('planted');
    record('planted');
    vi.advanceTimersByTime(999);
    expect(storedStats()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(storedStats()?.planted).toBe(3);
    expect(writes.filter((key) => key === KEY)).toHaveLength(1);
  });

  it('flushes immediately on pagehide', async () => {
    const { record } = await fresh();
    record('photos', undefined, 2);
    window.dispatchEvent(new Event('pagehide'));
    expect(storedStats()?.photos).toBe(2);
  });

  it('restores stats on the next launch, filling stats missing from older saves', async () => {
    localStorage.setItem(KEY, JSON.stringify({ planted: 7 }));
    const first = await fresh();
    first.record('kept', undefined, 3);
    vi.advanceTimersByTime(1000);
    const second = await fresh();
    expect(second.stats.peek()).toEqual({ ...allStats(0), planted: 7, kept: 3 });
  });

  it('starts from zero when the saved stats are corrupt or malformed', async () => {
    localStorage.setItem(KEY, '{"planted": 7');
    expect((await fresh()).stats.peek()).toEqual(allStats(0));
    localStorage.setItem(KEY, JSON.stringify({ planted: 'lots', photos: null, kept: 2 }));
    expect((await fresh()).stats.peek()).toEqual({ ...allStats(0), kept: 2 });
  });

  it('loads and keeps working when storage rejects writes', async () => {
    blockWrites();
    const { record, stats } = await fresh();
    expect(() => record('photos', undefined, 15)).not.toThrow(); // earns a finish
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(stats.peek().photos).toBe(15);
  });
});

describe('seed page milestones', () => {
  it('lock pages 1-3 for a new player and leave other pages open', async () => {
    const { isPageUnlocked, lockFor } = await fresh();
    for (const page of [0, 99]) {
      expect(isPageUnlocked(page)).toBe(true);
      expect(lockFor(page)).toBeNull();
    }
    for (const page of [1, 2, 3]) {
      expect(isPageUnlocked(page)).toBe(false);
      expect(lockFor(page)?.have).toBe(0);
    }
  });

  it('report progress towards a page and unlock it with a toast at the goal', async () => {
    const { MILESTONES, isPageUnlocked, lockFor, record, toast } = await fresh();
    record('planted', undefined, 2);
    expect(lockFor(1)).toMatchObject({ have: 2, milestone: { goal: 3, stat: 'planted' } });
    record('planted');
    expect(isPageUnlocked(1)).toBe(true);
    expect(lockFor(1)).toBeNull();
    expect(isPageUnlocked(2)).toBe(false);
    expect(toast.peek()).toMatchObject({ label: 'New seeds unlocked!', sub: MILESTONES[0].reward });
  });

  it('unlock silently for quiet credit', async () => {
    const { isPageUnlocked, record, toast } = await fresh();
    record('watered', undefined, 2, true);
    expect(isPageUnlocked(2)).toBe(true);
    expect(toast.peek()).toBeNull();
  });

  it('cover exactly the seedbox pages after the first and name their species', async () => {
    const { MILESTONES } = await fresh();
    expect(MILESTONES.map((m) => m.page)).toEqual(Array.from({ length: PAGE_COUNT - 1 }, (_, i) => i + 1));
    for (const milestone of MILESTONES) {
      const page = PLANTS.slice(milestone.page * SLOTS_PER_PAGE, (milestone.page + 1) * SLOTS_PER_PAGE);
      for (const species of new Set(page.map((p) => p.species))) {
        // "Pansy" is listed as "pansies".
        expect(milestone.reward.toLowerCase()).toContain(species.toLowerCase().replace(/y$/u, 'i'));
      }
    }
  });
});

describe('goals and finishes', () => {
  it('define twelve goals, six per set, on real stats', async () => {
    const { GOALS, stats } = await fresh();
    expect(GOALS).toHaveLength(12);
    expect(new Set(GOALS.map((g) => g.id)).size).toBe(12);
    expect(GOALS.filter((g) => g.set === 'tools')).toHaveLength(6);
    for (const goal of GOALS) {
      expect(Object.keys(stats.peek())).toContain(goal.stat);
      expect(goal.goal).toBeGreaterThan(0);
      expect(goal.color).toMatch(/^#[0-9a-f]{6}$/i);
      // Garden finishes are not held in a hand; tool finishes are.
      expect(goal.hand === null).toBe(goal.set === 'garden');
    }
  });

  it('reveal and equip a finish once, when its goal is reached', async () => {
    const { GOALS, finishOn, goalDone, goalReveal, record, toast } = await fresh();
    record('photos', undefined, 14);
    expect(goalDone('photographer')).toBe(false);
    expect(finishOn('photographer')).toBe(false);
    record('photos');
    const goal = GOALS.find((g) => g.id === 'photographer')!;
    expect(goalDone('photographer')).toBe(true);
    expect(finishOn('photographer')).toBe(true);
    expect(goalReveal.peek()).toBe(goal);
    expect(toast.peek()).toMatchObject({ label: `${goal.reward} unlocked!`, hand: goal.hand });
    goalReveal.value = null;
    record('photos');
    expect(goalReveal.peek()).toBeNull();
  });

  it('award every goal a single large credit crosses', async () => {
    const { finishOn, goalDone, record } = await fresh();
    record('maxed', undefined, 20);
    expect(goalDone('greenthumb')).toBe(true);
    expect(goalDone('bloomer')).toBe(true);
    // Different slots (camera, petals), so both stay equipped.
    expect(finishOn('greenthumb')).toBe(true);
    expect(finishOn('bloomer')).toBe(true);
  });

  it('equip quietly credited finishes without a reveal', async () => {
    const { finishOn, goalReveal, record, toast } = await fresh();
    record('kept', undefined, 5, true);
    expect(finishOn('album')).toBe(true);
    expect(goalReveal.peek()).toBeNull();
    expect(toast.peek()).toBeNull();
  });

  it('replace the equipped finish in the same slot', async () => {
    const { finishOn, record } = await fresh();
    record('maxed', undefined, 5); // greenthumb: mint camera
    record('photos', undefined, 15); // photographer: silver camera
    expect(finishOn('photographer')).toBe(true);
    expect(finishOn('greenthumb')).toBe(false);
  });

  it('let the player switch finishes and persist the choice', async () => {
    const first = await fresh();
    first.record('maxed', undefined, 5);
    first.record('photos', undefined, 15);
    first.toggleFinish('greenthumb');
    expect(first.finishOn('greenthumb')).toBe(true);
    expect(first.finishOn('photographer')).toBe(false);
    first.toggleFinish('greenthumb', false);
    expect(first.finishOn('greenthumb')).toBe(false);
    expect(JSON.parse(localStorage.getItem(FINISH_KEY)!)).toContain('greenthumb');
    vi.advanceTimersByTime(1000);
    const second = await fresh();
    expect(second.finishOn('greenthumb')).toBe(false);
    expect(second.finishOn('photographer')).toBe(false);
  });

  it('ignore unknown finishes and survive a corrupt finishes list', async () => {
    localStorage.setItem(FINISH_KEY, '[oops');
    const { finishesOff, goalDone, toggleFinish } = await fresh();
    expect(finishesOff.peek()).toEqual([]);
    toggleFinish('nope');
    expect(finishesOff.peek()).toEqual([]);
    expect(goalDone('nope')).toBe(false);
  });

  it('notify finish listeners on progress and on equip changes', async () => {
    const { onFinishChange, record, toggleFinish } = await fresh();
    const run = vi.fn();
    const stop = onFinishChange(run);
    const initial = run.mock.calls.length;
    record('tours');
    expect(run.mock.calls.length).toBe(initial + 1);
    toggleFinish('variety', false);
    expect(run.mock.calls.length).toBe(initial + 2);
    stop();
    record('tours');
    expect(run.mock.calls.length).toBe(initial + 2);
  });
});

describe('recordBest / recordVariety', () => {
  it('track a best-ever value that never counts down', async () => {
    const { recordBest, recordGardenSize, stats } = await fresh();
    recordGardenSize(12);
    recordGardenSize(8);
    recordBest('displayed', 3);
    recordBest('displayed', 1);
    expect(stats.peek()).toMatchObject({ biggestGarden: 12, displayed: 3 });
  });

  it('count each variety once and remember them across launches', async () => {
    const first = await fresh();
    first.recordVariety('rose_a');
    first.recordVariety('rose_a');
    first.recordVariety('oak');
    expect(first.stats.peek().varietyCount).toBe(2);
    expect(JSON.parse(localStorage.getItem(VARIETY_KEY)!)).toEqual(['rose_a', 'oak']);
    vi.advanceTimersByTime(1000);
    const second = await fresh();
    second.recordVariety('oak');
    second.recordVariety('fir');
    expect(second.stats.peek().varietyCount).toBe(3);
  });

  it('award the variety goal at eight distinct plants', async () => {
    const { goalDone, recordVariety } = await fresh();
    PLANTS.slice(0, 7).forEach((p) => recordVariety(p.id));
    expect(goalDone('variety')).toBe(false);
    recordVariety(PLANTS[7].id);
    expect(goalDone('variety')).toBe(true);
  });

  it('survive a corrupt varieties list', async () => {
    localStorage.setItem(VARIETY_KEY, '["rose_a"');
    const { recordVariety, stats } = await fresh();
    recordVariety('rose_a');
    expect(stats.peek().varietyCount).toBe(1);
  });
});

describe('weekly challenges', () => {
  it('draw three distinct challenges with no progress at the start of a week', async () => {
    const { weeklyGoals } = await fresh();
    const goals = weeklyGoals();
    expect(goals).toHaveLength(3);
    expect(new Set(goals.map((g) => g.id)).size).toBe(3);
    for (const goal of goals) expect(goal).toMatchObject({ have: 0, done: false });
  });

  it('show everyone the same challenges all week, and rotate them weekly', async () => {
    const monday = new Date(2026, 9, 26, 0, 1).getTime();
    const picks = async (time: number) => {
      localStorage.clear();
      vi.setSystemTime(time);
      return (await fresh())
        .weeklyGoals()
        .map((g) => g.id)
        .join();
    };
    const early = await picks(monday);
    expect(await picks(monday + 7 * DAY - 120000)).toBe(early); // Sunday 23:59
    const weeks = new Set<string>();
    for (let week = 0; week < 8; week++) weeks.add(await picks(monday + week * 7 * DAY));
    expect(weeks.size).toBeGreaterThan(1);
  });

  it('count progress from the week start, then complete a challenge with a toast', async () => {
    localStorage.setItem(KEY, JSON.stringify(allStats(100)));
    const { record, toast, weekly, weeklyGoals } = await fresh();
    const goal = weeklyGoals()[0];
    record(goal.stat, undefined, goal.goal - 1);
    expect(weeklyGoals()[0]).toMatchObject({ have: goal.goal - 1, done: false });
    record(goal.stat);
    expect(weeklyGoals()[0].done).toBe(true);
    expect(weekly.peek().done).toContain(goal.id);
    expect(['Weekly challenge done', 'Weekly ribbon earned!']).toContain(toast.peek()?.label);
    expect(JSON.parse(localStorage.getItem(WEEKLY_KEY)!).done).toContain(goal.id);
  });

  it('award one ribbon for finishing all three', async () => {
    localStorage.setItem(KEY, JSON.stringify(allStats(100)));
    const { goalReveal, record, toast, weekly, weeklyGoals } = await fresh();
    for (const goal of weeklyGoals()) record(goal.stat, undefined, goal.goal);
    expect(weekly.peek().ribbons).toBe(1);
    expect(weekly.peek().done).toHaveLength(3);
    expect(goalReveal.peek()?.id).toBe('weekly');
    expect(toast.peek()?.label).toBe('Weekly ribbon earned!');
    for (const goal of weeklyGoals()) record(goal.stat, undefined, goal.goal);
    expect(weekly.peek().ribbons).toBe(1);
  });

  it('do not complete challenges from quiet credit', async () => {
    localStorage.setItem(KEY, JSON.stringify(allStats(100)));
    const { record, weekly, weeklyGoals } = await fresh();
    const goal = weeklyGoals()[0];
    record(goal.stat, undefined, goal.goal, true);
    expect(weekly.peek().done).toEqual([]);
  });

  it('announce ribbon milestones', async () => {
    localStorage.setItem(KEY, JSON.stringify(allStats(100)));
    const week = (await fresh()).weekly.peek().week;
    localStorage.setItem(WEEKLY_KEY, JSON.stringify({ week, base: allStats(100), done: [], ribbons: 4 }));
    const { record, ribbonMilestone, toast, weekly, weeklyGoals } = await fresh();
    for (const goal of weeklyGoals()) record(goal.stat, undefined, goal.goal);
    expect(weekly.peek().ribbons).toBe(5);
    expect(ribbonMilestone.peek()?.at).toBe(5);
    expect(toast.peek()?.label).toBe(`${ribbonMilestone.peek()!.title} unlocked!`);
  });

  it('start a new week on launch, keeping ribbons', async () => {
    localStorage.setItem(KEY, JSON.stringify(allStats(10)));
    const week = (await fresh()).weekly.peek().week;
    localStorage.setItem(WEEKLY_KEY, JSON.stringify({ week: week - 1, base: {}, done: ['w-plant'], ribbons: 3 }));
    const { weekly } = await fresh();
    expect(weekly.peek()).toEqual({ week, base: allStats(10), done: [], ribbons: 3 });
    localStorage.setItem(WEEKLY_KEY, '{"week":'); // corrupt
    expect((await fresh()).weekly.peek()).toMatchObject({ week, done: [], ribbons: 0 });
  });

  it('roll over to a new week on the next recorded action', async () => {
    localStorage.setItem(KEY, JSON.stringify(allStats(100)));
    const { record, weekly, weeklyGoals } = await fresh();
    const goal = weeklyGoals()[0];
    record(goal.stat, undefined, goal.goal);
    const week = weekly.peek().week;
    vi.setSystemTime(WEDNESDAY + 7 * DAY);
    record('displayed', undefined, 1); // not a weekly stat
    expect(weekly.peek()).toMatchObject({ week: week + 1, done: [], ribbons: 0 });
    expect(weeklyGoals().every((g) => g.have === 0 && !g.done)).toBe(true);
  });

  it('credit the first action after the weekly reset to the new week', async () => {
    vi.setSystemTime(WEDNESDAY + 7 * DAY);
    const nextWeek = (await fresh()).weeklyGoals();
    const target = nextWeek.reduce((best, g) => (g.goal > best.goal ? g : best));
    localStorage.clear();
    vi.setSystemTime(WEDNESDAY);
    const { record, weeklyGoals } = await fresh();
    vi.setSystemTime(WEDNESDAY + 7 * DAY);
    record(target.stat);
    expect(weeklyGoals().find((g) => g.id === target.id)?.have).toBe(1);
  });

  it("show the new week's challenges after the reset before any action", async () => {
    vi.setSystemTime(WEDNESDAY + 7 * DAY);
    const expected = (await fresh()).weeklyGoals().map((g) => g.id);
    localStorage.clear();
    vi.setSystemTime(WEDNESDAY);
    const { weeklyGoals } = await fresh();
    vi.setSystemTime(WEDNESDAY + 7 * DAY);
    expect(weeklyGoals().map((g) => g.id)).toEqual(expected);
  });

  it('count the days left until the Monday reset', async () => {
    const { weeklyDaysLeft } = await fresh();
    // Monday 26 October 2026 .. Sunday 1 November 2026.
    const left = [26, 27, 28, 29, 30, 31, 32].map((date) => {
      vi.setSystemTime(new Date(2026, 9, date, 15));
      return weeklyDaysLeft();
    });
    expect(left).toEqual([7, 6, 5, 4, 3, 2, 1]);
  });

  it('point to the next ribbon reward until all are collected', async () => {
    const { nextRibbonMilestone } = await fresh();
    expect([0, 4, 5, 14, 19].map((n) => nextRibbonMilestone(n)?.at)).toEqual([5, 5, 10, 15, 20]);
    expect(nextRibbonMilestone(20)).toBeNull();
    expect(nextRibbonMilestone(99)).toBeNull();
  });
});

describe('seedProgressFromGardens', () => {
  const garden = (types: string[], count: number, displays = 0) => ({
    plants: Array.from({ length: count }, (_, i) => ({ type: types[i % types.length] })),
    displays: Array.from({ length: displays }, () => ({})),
  });
  const eight = PLANTS.slice(0, 8).map((p) => p.id);
  const saved = () => [garden(eight, 25, 3), garden(['oak'], 15)];

  it('credits saved gardens without counting it as weekly progress', async () => {
    const { seedProgressFromGardens, stats, weeklyGoals } = await fresh();
    seedProgressFromGardens(saved());
    expect(stats.peek()).toMatchObject({ planted: 40, biggestGarden: 25, displayed: 3, varietyCount: 8 });
    for (const goal of weeklyGoals()) expect(goal.have).toBe(0);
  });

  it('summarises earned finishes in one calm toast, without reveals, one per slot', async () => {
    const { GOALS, finishOn, goalDone, goalReveal, seedProgressFromGardens, toast } = await fresh();
    seedProgressFromGardens(saved());
    for (const id of ['florist', 'meadow', 'curator', 'variety']) expect(goalDone(id)).toBe(true);
    expect(toast.peek()?.label).toBe('4 finishes were waiting for you');
    expect(goalReveal.peek()).toBeNull();
    for (const slot of new Set(GOALS.map((g) => g.slot))) {
      expect(GOALS.filter((g) => g.slot === slot && finishOn(g.id)).length).toBeLessThanOrEqual(1);
    }
  });

  it('uses the singular wording for one finish and no toast for none', async () => {
    const one = await fresh();
    one.seedProgressFromGardens([garden(['oak'], 25)]);
    expect(one.toast.peek()?.label).toBe('A finish was waiting for you');
    localStorage.clear();
    const none = await fresh();
    none.seedProgressFromGardens([garden(['oak'], 2)]);
    expect(none.toast.peek()).toBeNull();
  });

  it('is idempotent across launches and never lowers existing stats', async () => {
    localStorage.setItem(KEY, JSON.stringify({ biggestGarden: 30 }));
    const first = await fresh();
    first.seedProgressFromGardens([garden(['oak', 'fir'], 10)]);
    vi.advanceTimersByTime(1000);
    const second = await fresh();
    second.seedProgressFromGardens([garden(['oak', 'fir'], 10)]);
    expect(second.stats.peek()).toMatchObject({ planted: 10, varietyCount: 2, biggestGarden: 30 });
  });
});
