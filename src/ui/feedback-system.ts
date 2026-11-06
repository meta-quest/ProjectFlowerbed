/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Per-frame tick for shared feedback: tweens and particle bursts.
 */

import { Vector3, createSystem } from '@iwsdk/core';
import { BURST_STYLES, bursts } from '../core/bursts.js';
import { haptic } from '../core/input.js';
import { tickTweens } from '../core/tween.js';
import { finishOn, goalReveal, onFinishChange } from '../gardening/progress.js';

export class FeedbackSystem extends createSystem({}) {
  private revealAt = new Vector3();
  /** Remaining sparkle waves for a goal reward reveal. */
  private reveal = { hand: 'right' as 'left' | 'right' | null, waves: 0, timer: 0 };

  override init(): void {
    bursts.init(this.scene);
    this.cleanupFuncs.push(
      // Petal finishes recolour every bloom burst.
      onFinishChange(() => {
        const bloom = BURST_STYLES.bloom;
        if (finishOn('bloomer')) [bloom.color, bloom.accent] = [0xffb3d9, 0xff7fbf];
        else if (finishOn('florist')) [bloom.color, bloom.accent] = [0xffe27a, 0xfff6c8];
        else [bloom.color, bloom.accent] = [0xfff3c4, 0x86dc3d];
      }),
      goalReveal.subscribe((goal) => {
        if (!goal) return;
        this.reveal.hand = goal.hand;
        this.reveal.waves = 4;
        this.reveal.timer = 0;
      }),
    );
  }

  override update(delta: number): void {
    tickTweens(delta);
    bursts.tick(delta);
    this.tickReveal(delta);
  }

  /** The newly finished tool sparkles gold in waves, with a haptic swell. */
  private tickReveal(delta: number): void {
    const reveal = this.reveal;
    if (reveal.waves <= 0) return;
    reveal.timer -= delta;
    if (reveal.timer > 0) return;
    reveal.timer = 0.28;
    reveal.waves--;
    if (reveal.hand) {
      this.world.player.gripSpaces[reveal.hand].getWorldPosition(this.revealAt);
      haptic(this.world, reveal.hand, 0.25 + 0.15 * (3 - reveal.waves), 40);
    } else {
      this.world.player.head.getWorldPosition(this.revealAt);
      this.revealAt.y -= 0.35;
    }
    bursts.emit(this.revealAt, BURST_STYLES.gold);
  }
}
