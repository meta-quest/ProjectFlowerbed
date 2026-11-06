/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { easeInCubic, easeOutBack, easeOutCubic, type Ease } from './tween.js';

/** The tween list is module state, so each test gets a fresh runner. */
async function freshTweens() {
  vi.resetModules();
  return import('./tween.js');
}

describe('easings', () => {
  it('start at 0 and end at 1', () => {
    for (const ease of [easeOutCubic, easeInCubic, easeOutBack] as Ease[]) {
      expect(ease(0)).toBeCloseTo(0, 10);
      expect(ease(1)).toBeCloseTo(1, 10);
    }
  });

  it('easeOutCubic decelerates and easeInCubic accelerates', () => {
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
    expect(easeInCubic(0.5)).toBeCloseTo(0.125);
    for (let t = 0.1; t < 1; t += 0.1) {
      expect(easeOutCubic(t)).toBeGreaterThan(t);
      expect(easeInCubic(t)).toBeLessThan(t);
    }
  });

  it('easeOutBack overshoots past 1 before settling', () => {
    const peak = Math.max(...Array.from({ length: 99 }, (_, i) => easeOutBack((i + 1) / 100)));
    expect(peak).toBeGreaterThan(1.05);
    expect(peak).toBeLessThan(1.15);
  });
});

describe('tween / tickTweens', () => {
  it('applies the start value immediately and eases out cubically by default', async () => {
    const { tickTweens, tween } = await freshTweens();
    const values: number[] = [];
    tween({}, 2, 4, 1, (v) => values.push(v));
    expect(values).toEqual([2]);
    tickTweens(0.5);
    expect(values[1]).toBeCloseTo(2 + 2 * easeOutCubic(0.5));
  });

  it('progresses with the given easing and lands exactly on the target', async () => {
    const { tickTweens, tween } = await freshTweens();
    const values: number[] = [];
    tween({}, 0, 10, 1, (v) => values.push(v), { ease: (t) => t });
    tickTweens(0.25);
    tickTweens(0.25);
    expect(values).toEqual([0, 2.5, 5]);
    tickTweens(10);
    expect(values.at(-1)).toBe(10);
  });

  it('calls done once, after the final value, and then stops ticking', async () => {
    const { tickTweens, tween } = await freshTweens();
    const order: string[] = [];
    const apply = vi.fn((v: number) => order.push(`apply ${v}`));
    const done = vi.fn(() => order.push('done'));
    tween({}, 0, 1, 0.5, apply, { ease: (t) => t, done });
    tickTweens(0.6);
    tickTweens(0.6);
    expect(done).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['apply 0', 'apply 1', 'done']);
  });

  it('replaces a running tween on the same key without finishing it', async () => {
    const { tickTweens, tween } = await freshTweens();
    const key = {};
    const firstDone = vi.fn();
    const values: number[] = [];
    tween(key, 0, 1, 1, () => {}, { done: firstDone });
    tween(key, 5, 6, 1, (v) => values.push(v), { ease: (t) => t });
    tickTweens(1);
    expect(firstDone).not.toHaveBeenCalled();
    expect(values).toEqual([5, 6]);
  });

  it('runs tweens on different keys independently', async () => {
    const { tickTweens, tween } = await freshTweens();
    let a = 0;
    let b = 0;
    tween({}, 0, 1, 1, (v) => (a = v), { ease: (t) => t });
    tween({}, 0, 1, 2, (v) => (b = v), { ease: (t) => t });
    tickTweens(1);
    expect(a).toBe(1);
    expect(b).toBe(0.5);
  });

  it('finishes zero-length tweens on the next tick instead of dividing by zero', async () => {
    const { tickTweens, tween } = await freshTweens();
    const values: number[] = [];
    const done = vi.fn();
    tween({}, 0, 3, 0, (v) => values.push(v), { done });
    tickTweens(0.016);
    expect(values).toEqual([0, 3]);
    expect(done).toHaveBeenCalled();
  });

  it('allows a done callback to start a follow-up tween on the same key', async () => {
    const { tickTweens, tween } = await freshTweens();
    const key = {};
    const values: number[] = [];
    tween(key, 0, 1, 0.1, () => {}, {
      done: () => tween(key, 1, 0, 0.1, (v) => values.push(v), { ease: (t) => t }),
    });
    tickTweens(0.2);
    tickTweens(0.2);
    expect(values).toEqual([1, 0]);
  });
});
