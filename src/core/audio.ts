/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Small Web Audio mixer for Flowerbed's one-shots, crossfading loops,
 * ambient emitters and streamed music.
 *
 * Buffers come from the asset manifest (`sfx-<ID>`), so they are decoded once
 * at load. Spatial sounds use pooled PositionalAudio nodes with the legacy
 * linear rolloff; volumes are the legacy decibel mix scaled by settings.
 */

import { Audio, AudioListener, AssetManager, Object3D, PositionalAudio, type Vector3 } from '@iwsdk/core';
import { MUSIC_DB, SOUNDS, SOUNDTRACK, type SoundId } from '../data/sounds.js';
import { initUiSounds } from './ui-sounds.js';

const dbToGain = (db: number) => 10 ** (db / 20);

/** Fisher-Yates, in place. */
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

interface Voice {
  node: PositionalAudio | Audio;
  anchor: Object3D;
  busy: boolean;
}

export interface LoopHandle {
  readonly id: SoundId;
  setPosition(position: Vector3): void;
  /** Swap the looping buffer in place (legacy watering ground/seed swap). */
  swap(id: SoundId, fadeMs?: number): void;
  stop(fadeMs?: number): void;
}

class FlowerbedAudio {
  private listener: AudioListener | null = null;
  private root = new Object3D();
  private voices: Voice[] = [];
  private effectsVolume = 1;
  private musicVolume = 1;
  private musicEnabled = false;
  private musicGain: GainNode | null = null;
  /** The playing track; a buffer source plays once, so pause and resume make a new one. */
  private musicSource: AudioBufferSourceNode | null = null;
  /**
   * The current track, decoded. Only one is kept: a 4-minute stereo track is
   * about 85 MB of PCM. (Streaming through an <audio> element and
   * createMediaElementSource would use less, but not every WebXR runtime has
   * media elements in Web Audio.)
   */
  private musicTrack: { index: number; buffer: Promise<AudioBuffer | null> } | null = null;
  /** Where in the track playback resumes, in seconds. */
  private musicOffset = 0;
  private musicStartedAt = 0;
  /** Bumped on every pause, so a decode that finishes late doesn't start stale music. */
  private musicToken = 0;
  /** Legacy playlist: shuffled once, then played in that order. */
  private order = shuffle(SOUNDTRACK.map((_, i) => i));
  private orderIndex = 0;
  private get trackIndex(): number {
    return this.order[this.orderIndex];
  }
  private onTrackChange?: (title: string) => void;

  /** Attach to the scene and reuse IWSDK's head listener when present. */
  init(scene: Object3D, head: Object3D): void {
    let listener: AudioListener | null = null;
    head.traverse((child) => {
      if (listener == null && child instanceof AudioListener) listener = child;
    });
    this.listener = listener ?? new AudioListener();
    if (listener == null) head.add(this.listener);
    this.root.name = 'flowerbed-audio';
    scene.add(this.root);
    initUiSounds(this.listener.context, this.listener.getInput());
    // Build a few voices now: Chrome loads its HRTF data on the first
    // spatial panner, a ~25 ms stall that would otherwise hit mid-game.
    const warm = [true, true, true, true, true, true, false, false, false, false].map((spatial) =>
      this.acquire(spatial),
    );
    for (const voice of warm) if (voice) voice.busy = false;
  }

  get context(): AudioContext | null {
    return this.listener?.context ?? null;
  }

  resume(): void {
    if (this.suspended) return;
    const ctx = this.context;
    if (ctx && ctx.state !== 'running') void ctx.resume();
  }

  private suspended = false;

  /** Hold all sound while the headset's system UI covers the app. */
  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    if (!suspended) return;
    // Suspending the context holds the music too, at its place in the track.
    const ctx = this.context;
    if (ctx?.state === 'running') void ctx.suspend();
  }

  /** Effects run through the listener's master gain, so live loops follow too. */
  setEffectsVolume(volume: number): void {
    this.effectsVolume = volume;
    this.listener?.setMasterVolume(volume);
  }

  private buffer(id: SoundId): AudioBuffer | null {
    return AssetManager.getAudio(`sfx-${id}`);
  }

  private gainFor(id: SoundId): number {
    return dbToGain(SOUNDS[id].db);
  }

  private acquire(spatial: boolean): Voice | null {
    if (!this.listener) return null;
    let voice = this.voices.find(
      (candidate) => !candidate.busy && candidate.node instanceof PositionalAudio === spatial,
    );
    if (!voice) {
      if (this.voices.length > 48) return null;
      const anchor = new Object3D();
      const node = spatial ? new PositionalAudio(this.listener) : new Audio(this.listener);
      anchor.add(node);
      this.root.add(anchor);
      const created: Voice = { node, anchor, busy: false };
      // Idle voices skip the matrix walk (a positional voice updates its
      // panner there every frame).
      const updateMatrixWorld = anchor.updateMatrixWorld.bind(anchor);
      anchor.updateMatrixWorld = (force?: boolean) => {
        if (created.busy) updateMatrixWorld(force);
      };
      // Release the voice when a one-shot finishes (installed once per voice).
      const ended = node.onEnded.bind(node);
      node.onEnded = () => {
        ended();
        if (!node.getLoop()) created.busy = false;
      };
      voice = created;
      this.voices.push(voice);
    }
    voice.busy = true;
    return voice;
  }

  private configure(voice: Voice, id: SoundId, loop: boolean): boolean {
    const buffer = this.buffer(id);
    if (!buffer) return false;
    const spec = SOUNDS[id];
    const node = voice.node;
    if (node.isPlaying) node.stop();
    node.setBuffer(buffer);
    node.setLoop(loop);
    if (node instanceof PositionalAudio) {
      node.setDistanceModel('linear');
      node.setRefDistance(1);
      node.setMaxDistance(spec.maxDistance ?? 100);
      node.setRolloffFactor(spec.rolloff ?? 1);
    }
    return true;
  }

  /** Fire-and-forget effect; positional when a position is given. */
  play(id: SoundId, position?: Vector3, volumeScale = 1): void {
    const spatial = position != null && (SOUNDS[id] as { rolloff?: number }).rolloff !== 0;
    const voice = this.acquire(spatial);
    if (!voice) return;
    if (!this.configure(voice, id, false)) {
      voice.busy = false;
      return;
    }
    if (position) voice.anchor.position.copy(position);
    voice.node.setVolume(this.gainFor(id) * volumeScale);
    this.resume();
    voice.node.play();
  }

  /** One-shot that can follow a moving emitter; returns its duration (s). */
  playTracked(
    id: SoundId,
    position: Vector3,
  ): { duration: number; setPosition(p: Vector3): void; ended(): boolean } | null {
    const voice = this.acquire(true);
    if (!voice) return null;
    if (!this.configure(voice, id, false)) {
      voice.busy = false;
      return null;
    }
    voice.anchor.position.copy(position);
    voice.node.setVolume(this.gainFor(id));
    const node = voice.node;
    this.resume();
    node.play();
    return {
      duration: this.buffer(id)?.duration ?? 1,
      setPosition: (p: Vector3) => voice.anchor.position.copy(p),
      ended: () => !voice.busy,
    };
  }

  /** Start a loop that fades in; returns a handle to move, swap or stop it. */
  loop(id: SoundId, position?: Vector3, fadeMs = 300, startOffset = 0): LoopHandle | null {
    const spatial = position != null && (SOUNDS[id] as { rolloff?: number }).rolloff !== 0;
    const voice = this.acquire(spatial);
    if (!voice) return null;
    if (!this.configure(voice, id, true)) {
      voice.busy = false;
      return null;
    }
    if (position) voice.anchor.position.copy(position);
    const node = voice.node;
    node.offset = startOffset;
    this.resume();
    node.setVolume(0);
    node.play();
    this.ramp(node, this.gainFor(id), fadeMs);
    let currentId = id;
    let stopped = false;
    return {
      get id() {
        return currentId;
      },
      setPosition: (p: Vector3) => voice.anchor.position.copy(p),
      swap: (next: SoundId, swapFade = 500) => {
        if (stopped || next === currentId) return;
        currentId = next;
        const buffer = this.buffer(next);
        if (!buffer) return;
        node.stop();
        node.setBuffer(buffer);
        node.setVolume(0);
        node.play();
        this.ramp(node, this.gainFor(next), swapFade);
      },
      stop: (stopFade = 300) => {
        if (stopped) return;
        stopped = true;
        this.ramp(node, 0, stopFade);
        window.setTimeout(() => {
          if (node.isPlaying) node.stop();
          voice.busy = false;
        }, stopFade + 30);
      },
    };
  }

  private ramp(node: Audio | PositionalAudio, target: number, ms: number): void {
    const ctx = this.context;
    if (!ctx) return;
    const gain = node.gain.gain;
    const now = ctx.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(target, now + Math.max(ms, 1) / 1000);
  }

  // Music --------------------------------------------------------------

  onMusicTrack(callback: (title: string) => void): void {
    this.onTrackChange = callback;
  }

  get currentTrackTitle(): string {
    return SOUNDTRACK[this.trackIndex].title;
  }

  /** Temporary music dip (garden tour); multiplies the chosen volume. */
  private musicDuck = 1;

  setMusicDuck(factor: number): void {
    this.musicDuck = factor;
    this.setMusic(this.musicEnabled, this.musicVolume);
  }

  setMusic(enabled: boolean, volume = this.musicVolume): void {
    this.musicVolume = volume;
    this.musicEnabled = enabled;
    if (this.musicGain) {
      // Glide to the new level instead of jumping.
      const ctx = this.musicGain.context;
      this.musicGain.gain.setTargetAtTime(dbToGain(MUSIC_DB) * volume * this.musicDuck, ctx.currentTime, 0.4);
    }
    if (enabled) this.startMusic();
    else this.pauseMusic();
  }

  nextTrack(): void {
    this.orderIndex = (this.orderIndex + 1) % this.order.length;
    this.pauseMusic();
    this.musicOffset = 0;
    if (this.musicEnabled) this.startMusic();
    this.onTrackChange?.(this.currentTrackTitle);
  }

  private trackUrl(index: number): string {
    return `${import.meta.env.BASE_URL}flowerbed/audio/${SOUNDTRACK[index].file}`;
  }

  private startMusic(): void {
    const ctx = this.context;
    if (!ctx) return;
    this.resume();
    if (this.musicSource) return;
    if (!this.musicGain) {
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = dbToGain(MUSIC_DB) * this.musicVolume * this.musicDuck;
      this.musicGain.connect(ctx.destination);
      this.onTrackChange?.(this.currentTrackTitle);
    }
    const index = this.trackIndex;
    if (this.musicTrack?.index !== index) this.musicTrack = { index, buffer: this.decodeTrack(ctx, index) };
    const token = this.musicToken;
    void this.musicTrack.buffer.then((buffer) => {
      if (!buffer || !this.musicGain || token !== this.musicToken || this.musicSource || !this.musicEnabled) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.musicGain);
      source.onended = () => {
        // stop() from pauseMusic also ends the source; only a track that played out advances.
        if (this.musicSource !== source) return;
        this.musicSource = null;
        this.nextTrack();
      };
      const offset = this.musicOffset % buffer.duration;
      source.start(0, offset);
      this.musicStartedAt = ctx.currentTime - offset;
      this.musicSource = source;
    });
  }

  private pauseMusic(): void {
    this.musicToken++;
    const source = this.musicSource;
    if (!source) return;
    this.musicSource = null;
    this.musicOffset = source.context.currentTime - this.musicStartedAt;
    source.stop();
  }

  private async decodeTrack(ctx: AudioContext, index: number): Promise<AudioBuffer | null> {
    try {
      const response = await fetch(this.trackUrl(index));
      return await ctx.decodeAudioData(await response.arrayBuffer());
    } catch (error) {
      console.warn('[flowerbed] music unavailable', error);
      return null;
    }
  }
}

export const audio = new FlowerbedAudio();
