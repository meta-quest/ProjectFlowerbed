/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Synthesized UI feedback sounds: a soft wooden tick for hover, a bright
 * two-note chime for confirm, a muted thud for "not available". Each tone is
 * rendered into a small AudioBuffer (cached per note) and played through an
 * AudioBufferSourceNode, so they cost no downloads, stay tonally consistent,
 * and need only the core of Web Audio (no OscillatorNode or BiquadFilterNode,
 * which not every WebXR runtime provides).
 */

let ctx: AudioContext | null = null;
let out: AudioNode | null = null;
let lastTick = 0;
let enabled = true;

/** Settings > Sound > Interface sounds. */
export function setUiSoundsEnabled(on: boolean): void {
  enabled = on;
}

export function initUiSounds(context: AudioContext, destination: AudioNode): void {
  ctx = context;
  out = destination;
}

/** A tone's pitch sweep and envelope, as the oscillator version scheduled them. */
export interface ToneSpec {
  type: 'sine' | 'triangle';
  /** Start and end frequency (Hz) of an exponential sweep over `sweep` seconds. */
  from: number;
  to: number;
  sweep: number;
  /** Linear rise to `gain` over `attack` seconds, then exponential fall to silence at `decay`. */
  attack: number;
  decay: number;
  gain: number;
}

/** Render one tone into samples (exported for tests). */
export function renderTone(sampleRate: number, tone: ToneSpec): Float32Array {
  const data = new Float32Array(Math.ceil((tone.decay + 0.02) * sampleRate));
  const ratio = tone.to / tone.from;
  let phase = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    const freq = tone.from * ratio ** Math.min(t / tone.sweep, 1);
    phase = (phase + freq / sampleRate) % 1;
    const wave = tone.type === 'sine' ? Math.sin(2 * Math.PI * phase) : 1 - 4 * Math.abs(phase - 0.5);
    const env =
      t < tone.attack
        ? (tone.gain * t) / tone.attack
        : t < tone.decay
          ? tone.gain * (0.0001 / tone.gain) ** ((t - tone.attack) / (tone.decay - tone.attack))
          : 0;
    data[i] = wave * env;
  }
  return data;
}

const tones = new Map<string, AudioBuffer>();

function playTone(tone: ToneSpec, start: number): void {
  if (!ctx || !out || !enabled) return;
  const key = `${tone.type}:${tone.from}:${tone.to}:${tone.sweep}:${tone.attack}:${tone.decay}:${tone.gain}`;
  let buffer = tones.get(key);
  if (!buffer) {
    const data = renderTone(ctx.sampleRate, tone);
    buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buffer.getChannelData(0).set(data);
    tones.set(key, buffer);
  }
  playBuffer(buffer, start);
}

function playBuffer(buffer: AudioBuffer, start: number): void {
  if (!ctx || !out) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(out);
  source.start(start);
}

/** A short note that drops 8% in pitch as it fades. */
function blip(freq: number, start: number, duration: number, gain: number, type: ToneSpec['type']): void {
  playTone({ type, from: freq, to: freq * 0.92, sweep: duration, attack: 0.006, decay: duration, gain }, start);
}

/**
 * Band-passed noise (the paper slide and the wood knock), filtered here with
 * the same biquad Web Audio's BiquadFilterNode uses. `shape` is the noise's
 * amplitude envelope (0..1 over the length); the band centre sweeps
 * exponentially from `from` to `to` Hz.
 */
function noiseBurst(
  seconds: number,
  shape: (x: number) => number,
  from: number,
  to: number,
  q: number,
  gain: number,
): AudioBuffer {
  const rate = ctx!.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx!.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < length; i++) {
    const w = (2 * Math.PI * from * (to / from) ** (i / length)) / rate;
    const alpha = Math.sin(w) / (2 * q);
    const x = (Math.random() * 2 - 1) * shape(i / length);
    const y = (alpha * (x - x2) + 2 * Math.cos(w) * y1 - (1 - alpha) * y2) / (1 + alpha);
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    data[i] = y * gain;
  }
  return buffer;
}

/** Hover: very short, quiet, rate-limited. */
export function uiTick(): void {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  if (now - lastTick < 0.045) return;
  lastTick = now;
  blip(1850, now, 0.035, 0.035, 'sine');
}

/** Confirm: rising two-note chime. */
export function uiConfirm(): void {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  blip(880, now, 0.12, 0.06, 'triangle');
  blip(1320, now + 0.06, 0.16, 0.05, 'triangle');
}

/** Rejected / locked. */
export function uiDeny(): void {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  blip(220, now, 0.12, 0.07, 'sine');
}

const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];

/** A plant finished growing: three soft marimba notes. */
export function uiBloom(gain = 0.045): void {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  const start = Math.floor(Math.random() * 3);
  for (let i = 0; i < 3; i++) blip(PENTATONIC[start + i], now + i * 0.07, 0.35, gain * (1 - i * 0.2), 'sine');
}

/** A thirsty plant perks up: a quick upward sweep. */
export function uiPerk(): void {
  if (!ctx || !out || !enabled || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  playTone({ type: 'triangle', from: 420, to: 980, sweep: 0.18, attack: 0.02, decay: 0.3, gain: 0.05 }, now);
}

/** New seeds unlocked: rising arpeggio with a sparkle on top. */
export function uiUnlock(): void {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(f, now + i * 0.09, 0.4, 0.06, 'triangle'));
  for (let i = 0; i < 5; i++) blip(2093 + i * 180, now + 0.4 + i * 0.04, 0.12, 0.018, 'sine');
}

/** A print kept in the album: a soft paper slide, then a warm chime. */
export function uiKeep(): void {
  if (!ctx || !out || !enabled || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  playBuffer(
    noiseBurst(0.22, (x) => Math.sin(Math.PI * x), 1800, 4200, 0.8, 0.05),
    now,
  );
  blip(783.99, now + 0.2, 0.5, 0.05, 'sine');
  blip(1174.66, now + 0.27, 0.6, 0.04, 'sine');
}

/** A soft wooden knock (easel picked up or set down); pitch > 1 is lighter. */
export function uiWood(pitch = 1): void {
  if (!ctx || !out || !enabled || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  playBuffer(
    noiseBurst(0.06, (x) => (1 - x) ** 3, 900 * pitch, 900 * pitch, 3, 0.12),
    now,
  );
  blip(180 * pitch, now, 0.12, 0.08, 'sine');
  blip(410 * pitch, now, 0.07, 0.03, 'triangle');
}
