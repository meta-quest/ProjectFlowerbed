/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Island soundscape and music (legacy AmbientSoundCreationSystem,
 * MusicSystem, PlaylistAudioSystem) plus comfort settings plumbing.
 *
 * - SFX_WATER_FLOW / SFX_OCEAN / SFX_DUCKS empties in the island glTF become
 *   positional loops (a random variant each), and a head-locked wind bed.
 * - Music streams the shuffled soundtrack while enabled.
 * - Settings map onto IWSDK locomotion: vignette -> comfort assist, snap
 *   angle -> turning angle, move speed -> sliding speed.
 */

import { LocomotionSystem, TurningMethod, Vector3, VisibilityState, createSystem } from '@iwsdk/core';
import { audio, type LoopHandle } from '../core/audio.js';
import { settings } from '../core/settings.js';
import type { SoundId } from '../data/sounds.js';
import { desktopMode } from '../desktop/emulator.js';
import { islandReady } from './island-state.js';

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

export class AmbienceSystem extends createSystem({}) {
  private loops: LoopHandle[] = [];
  private started = false;
  private position = new Vector3();

  override init(): void {
    this.cleanupFuncs.push(
      settings.subscribe((value) => {
        audio.setEffectsVolume(value.effectsVolume);
        if (this.started) audio.setMusic(value.music, value.musicVolume);
        this.applyLocomotion();
      }),
      this.world.visibilityState.subscribe((state) => {
        // The system menu is open over the session: go quiet until it closes.
        audio.setSuspended(state === VisibilityState.VisibleBlurred);
        // Entering XR is a user gesture: the best moment to start sound.
        if (state === VisibilityState.Visible) this.start();
      }),
    );
    const onGesture = () => this.start();
    window.addEventListener('pointerdown', onGesture, { once: true });
    window.addEventListener('keydown', onGesture, { once: true });
    this.cleanupFuncs.push(
      () => window.removeEventListener('pointerdown', onGesture),
      () => window.removeEventListener('keydown', onGesture),
    );
  }

  override update(): void {
    // Retry locomotion settings until the locomotor has finished booting.
    if (!this.locomotionApplied) this.applyLocomotion();
  }

  private locomotionApplied = false;

  private applyLocomotion(): void {
    const locomotion = this.world.getSystem(LocomotionSystem);
    if (!locomotion) return;
    const value = settings.peek();
    // Desktop glide never vignettes (legacy xplat turned it off).
    locomotion.config.comfortAssist.value = value.vignette && !desktopMode() ? 0.5 : 0;
    locomotion.config.turningAngle.value = value.snapTurnDeg;
    locomotion.config.turningMethod.value =
      value.turnStyle === 'smooth' ? TurningMethod.SmoothTurn : TurningMethod.SnapTurn;
    locomotion.config.slidingSpeed.value = value.moveSpeed;
    this.locomotionApplied = true;
  }

  /** Start the soundscape once audio may play and the island is ready. */
  start(): void {
    audio.resume();
    const value = settings.peek();
    if (this.started) {
      audio.setMusic(value.music, value.musicVolume);
      return;
    }
    const island = islandReady.peek();
    if (!island) {
      const off = islandReady.subscribe((ready) => {
        if (ready) {
          off();
          this.start();
        }
      });
      return;
    }
    this.started = true;
    const variants: Record<string, readonly SoundId[]> = {
      SFX_WATER_FLOW: ['WATER_FLOW_LOOP_01', 'WATER_FLOW_LOOP_02', 'WATER_FLOW_LOOP_03', 'WATER_FLOW_LOOP_04'],
      SFX_OCEAN: ['OCEAN_WAVES_LOOP_01', 'OCEAN_WAVES_LOOP_02', 'OCEAN_WAVES_LOOP_03', 'OCEAN_WAVES_LOOP_04'],
      SFX_DUCKS: ['DUCKS_LOOP'],
    };
    for (const [key, ids] of Object.entries(variants)) {
      for (const anchor of island.anchors.get(key) ?? []) {
        anchor.getWorldPosition(this.position);
        // Random start offsets keep identical loops from phasing.
        const loop = audio.loop(pick(ids), this.position, 1500, Math.random() * 8);
        if (loop) this.loops.push(loop);
      }
    }
    const wind = audio.loop('HEADLOCKED_AMBIENT_LOOP', undefined, 1500);
    if (wind) this.loops.push(wind);
    audio.setMusic(value.music, value.musicVolume);
  }
}
