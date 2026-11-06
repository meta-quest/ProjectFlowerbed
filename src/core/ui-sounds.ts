/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Synthesized UI feedback sounds: a soft wooden tick for hover, a bright
 * two-note chime for confirm, a muted thud for "not available". Built from
 * oscillators so they cost no downloads and stay tonally consistent.
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

function blip(freq: number, start: number, duration: number, gain: number, type: OscillatorType): void {
  if (!ctx || !out || !enabled) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.92, start + duration);
  amp.gain.setValueAtTime(0, start);
  amp.gain.linearRampToValueAtTime(gain, start + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(out);
  osc.start(start);
  osc.stop(start + duration + 0.02);
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
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(420, now);
  osc.frequency.exponentialRampToValueAtTime(980, now + 0.18);
  amp.gain.setValueAtTime(0, now);
  amp.gain.linearRampToValueAtTime(0.05, now + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  osc.connect(amp).connect(out);
  osc.start(now);
  osc.stop(now + 0.32);
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
  const length = Math.floor(ctx.sampleRate * 0.22);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / length);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.setValueAtTime(1800, now);
  band.frequency.exponentialRampToValueAtTime(4200, now + 0.22);
  band.Q.value = 0.8;
  const amp = ctx.createGain();
  amp.gain.value = 0.05;
  noise.connect(band).connect(amp).connect(out);
  noise.start(now);
  blip(783.99, now + 0.2, 0.5, 0.05, 'sine');
  blip(1174.66, now + 0.27, 0.6, 0.04, 'sine');
}

/** A soft wooden knock (easel picked up or set down); pitch > 1 is lighter. */
export function uiWood(pitch = 1): void {
  if (!ctx || !out || !enabled || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  const length = Math.floor(ctx.sampleRate * 0.06);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 900 * pitch;
  band.Q.value = 3;
  const amp = ctx.createGain();
  amp.gain.value = 0.12;
  noise.connect(band).connect(amp).connect(out);
  noise.start(now);
  blip(180 * pitch, now, 0.12, 0.08, 'sine');
  blip(410 * pitch, now, 0.07, 0.03, 'triangle');
}
