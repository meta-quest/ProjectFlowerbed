/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * A fake AudioContext with only buffers and buffer sources (no oscillators or
 * filters, like the WebXR runtimes the sounds must work on). It records each
 * buffer it creates and each source it starts.
 */
class FakeAudioContext {
  state: AudioContextState = 'running';
  currentTime = 10;
  sampleRate = 48000;
  readonly buffers: Float32Array[] = [];
  readonly started: { buffer: { data: Float32Array }; at: number }[] = [];

  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    this.buffers.push(data);
    return { data, getChannelData: () => data };
  }

  createBufferSource() {
    const source = {
      buffer: null as { data: Float32Array } | null,
      connect: (node: unknown) => node,
      start: (at: number) => this.started.push({ buffer: source.buffer!, at }),
    };
    return source;
  }
}

/** ui-sounds keeps the context, the enabled flag and the hover clock in module state. */
async function freshSounds(context: FakeAudioContext | null = new FakeAudioContext()) {
  vi.resetModules();
  const sounds = await import('./ui-sounds.js');
  if (context) sounds.initUiSounds(context as unknown as AudioContext, {} as AudioNode);
  return { ...sounds, context: context! };
}

/** Upward zero crossings per second over a stretch of samples: the frequency. */
function frequency(data: Float32Array, from: number, to: number, rate = 48000): number {
  let crossings = 0;
  for (let i = from + 1; i < to; i++) if (data[i - 1] < 0 && data[i] >= 0) crossings++;
  return (crossings * rate) / (to - from);
}

describe('renderTone', () => {
  it('sweeps the pitch exponentially and fades to silence', async () => {
    const { renderTone } = await freshSounds(null);
    const tone = { type: 'sine' as const, from: 1000, to: 2000, sweep: 0.5, attack: 0.01, decay: 0.6, gain: 0.1 };
    const data = renderTone(48000, tone);
    expect(data.length).toBe(Math.ceil(0.62 * 48000));
    expect(frequency(data, 0, 2400)).toBeCloseTo(1035, -2);
    expect(frequency(data, 24000, 28800)).toBeCloseTo(2000, -2);
    expect(Math.max(...data.subarray(0, 4800).map(Math.abs))).toBeLessThanOrEqual(0.1);
    expect(Math.max(...data.subarray(28800).map(Math.abs))).toBeLessThan(0.001);
  });

  it('draws triangles within the gain', async () => {
    const { renderTone } = await freshSounds(null);
    const data = renderTone(48000, {
      type: 'triangle',
      from: 440,
      to: 440,
      sweep: 1,
      attack: 0.001,
      decay: 0.2,
      gain: 0.5,
    });
    expect(frequency(data, 0, 4800)).toBeCloseTo(440, -1);
    expect(Math.max(...data.map(Math.abs))).toBeLessThanOrEqual(0.5);
  });
});

describe('UI sounds', () => {
  it('are silent (and safe) before audio is initialised', async () => {
    const { uiBloom, uiConfirm, uiDeny, uiKeep, uiPerk, uiTick, uiUnlock, uiWood } = await freshSounds(null);
    for (const play of [uiTick, uiConfirm, uiDeny, uiBloom, uiPerk, uiUnlock, uiKeep, uiWood]) {
      expect(() => play()).not.toThrow();
    }
  });

  it('play a rising two-note chime on confirm', async () => {
    const { context, uiConfirm } = await freshSounds();
    uiConfirm();
    const [low, high] = context.started;
    expect(context.started).toHaveLength(2);
    expect(high.at).toBeGreaterThan(low.at);
    expect(frequency(low.buffer.data, 0, 2400)).toBeCloseTo(880, -2);
    expect(frequency(high.buffer.data, 0, 2400)).toBeCloseTo(1320, -2);
  });

  it('play a low thud on deny, an arpeggio on unlock and rising notes on bloom', async () => {
    const { context, uiBloom, uiDeny, uiUnlock } = await freshSounds();
    uiDeny();
    expect(context.started).toHaveLength(1);
    expect(frequency(context.started[0].buffer.data, 0, 2400)).toBeCloseTo(220, -2);
    uiUnlock();
    expect(context.started).toHaveLength(1 + 4 + 5);
    context.started.length = 0;
    uiBloom();
    const freqs = context.started.map((s) => frequency(s.buffer.data, 0, 2400));
    expect(freqs).toHaveLength(3);
    expect(freqs[0]).toBeLessThan(freqs[1]);
    expect(freqs[1]).toBeLessThan(freqs[2]);
  });

  it('render each note once and reuse it', async () => {
    const { context, uiConfirm } = await freshSounds();
    uiConfirm();
    uiConfirm();
    expect(context.started).toHaveLength(4);
    expect(context.buffers).toHaveLength(2);
  });

  it('play band-passed noise under the keep and wood sounds', async () => {
    const { context, uiKeep, uiWood } = await freshSounds();
    uiKeep();
    uiWood();
    expect(context.started).toHaveLength(3 + 3);
    const noise = context.started[0].buffer.data;
    expect(noise.length).toBe(Math.floor(48000 * 0.22));
    expect(noise.some((v) => v !== 0)).toBe(true);
    expect(Math.max(...noise.map(Math.abs))).toBeLessThan(0.2);
  });

  it('rate-limit hover ticks to one per 45 ms', async () => {
    const { context, uiTick } = await freshSounds();
    uiTick();
    context.currentTime += 0.02;
    uiTick();
    context.currentTime += 0.03;
    uiTick();
    expect(context.started).toHaveLength(2);
  });

  it('stay silent while the context is suspended (before a user gesture)', async () => {
    const { context, uiConfirm, uiKeep } = await freshSounds();
    context.state = 'suspended';
    uiConfirm();
    uiKeep();
    expect(context.started).toHaveLength(0);
    expect(context.buffers).toHaveLength(0);
  });

  it('honour the Interface sounds setting', async () => {
    const { context, setUiSoundsEnabled, uiConfirm, uiKeep, uiPerk, uiWood } = await freshSounds();
    setUiSoundsEnabled(false);
    uiConfirm();
    uiPerk();
    uiKeep();
    uiWood();
    expect(context.started).toHaveLength(0);
    expect(context.buffers).toHaveLength(0);
    setUiSoundsEnabled(true);
    uiConfirm();
    expect(context.started).toHaveLength(2);
  });
});
