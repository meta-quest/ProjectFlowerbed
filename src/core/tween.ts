/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Tiny allocation-light tween runner for UI and prop transitions. Ticked
 * once per frame by FeedbackSystem.
 */

export type Ease = (t: number) => number;

export const easeOutCubic: Ease = (t) => 1 - (1 - t) ** 3;
export const easeInCubic: Ease = (t) => t * t * t;
export const easeOutBack: Ease = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

interface Tween {
  key: object;
  from: number;
  to: number;
  duration: number;
  t: number;
  ease: Ease;
  apply: (value: number) => void;
  done?: () => void;
}

const tweens: Tween[] = [];

/** Animate a scalar; a new tween on the same key replaces the old one. */
export function tween(
  key: object,
  from: number,
  to: number,
  duration: number,
  apply: (value: number) => void,
  options: { ease?: Ease; done?: () => void } = {},
): void {
  const existing = tweens.findIndex((entry) => entry.key === key);
  if (existing >= 0) tweens.splice(existing, 1);
  apply(from);
  tweens.push({
    key,
    from,
    to,
    duration: Math.max(duration, 1e-3),
    t: 0,
    ease: options.ease ?? easeOutCubic,
    apply,
    done: options.done,
  });
}

export function tickTweens(delta: number): void {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const entry = tweens[i];
    entry.t = Math.min(1, entry.t + delta / entry.duration);
    entry.apply(entry.from + (entry.to - entry.from) * entry.ease(entry.t));
    if (entry.t >= 1) {
      tweens.splice(i, 1);
      entry.done?.();
    }
  }
}
