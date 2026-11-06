/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/** A fake AudioContext that records the oscillator notes it is asked to play. */
class FakeAudioContext {
  state: AudioContextState = 'running';
  currentTime = 10;
  sampleRate = 48000;
  readonly notes: { type: string; frequency: number; start: number }[] = [];
  readonly buffers: number[] = [];

  createOscillator() {
    const note = { type: 'sine', frequency: 0, start: 0 };
    const param = {
      setValueAtTime: (value: number) => (note.frequency ||= value),
      exponentialRampToValueAtTime: () => {},
    };
    return {
      set type(value: string) {
        note.type = value;
      },
      frequency: param,
      connect: (node: unknown) => node,
      start: (at: number) => {
        note.start = at;
        this.notes.push(note);
      },
      stop: () => {},
    };
  }

  createGain() {
    return {
      gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect: (node: unknown) => node,
    };
  }

  createBuffer(_channels: number, length: number) {
    this.buffers.push(length);
    return { getChannelData: () => new Float32Array(length) };
  }

  createBufferSource() {
    return { buffer: null, connect: (node: unknown) => node, start: () => {} };
  }

  createBiquadFilter() {
    return {
      type: 'lowpass',
      frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      Q: { value: 0 },
      connect: (node: unknown) => node,
    };
  }
}

/** ui-sounds keeps the context, the enabled flag and the hover clock in module state. */
async function freshSounds(context: FakeAudioContext | null = new FakeAudioContext()) {
  vi.resetModules();
  const sounds = await import('./ui-sounds.js');
  if (context) sounds.initUiSounds(context as unknown as AudioContext, {} as AudioNode);
  return { ...sounds, context: context! };
}

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
    expect(context.notes.map((n) => n.frequency)).toEqual([880, 1320]);
    expect(context.notes[1].start).toBeGreaterThan(context.notes[0].start);
  });

  it('play a low thud on deny, an arpeggio on unlock and rising notes on bloom', async () => {
    const { context, uiBloom, uiDeny, uiUnlock } = await freshSounds();
    uiDeny();
    expect(context.notes.map((n) => n.frequency)).toEqual([220]);
    uiUnlock();
    expect(context.notes).toHaveLength(1 + 4 + 5);
    context.notes.length = 0;
    uiBloom();
    const freqs = context.notes.map((n) => n.frequency);
    expect(freqs).toHaveLength(3);
    expect(freqs[0]).toBeLessThan(freqs[1]);
    expect(freqs[1]).toBeLessThan(freqs[2]);
  });

  it('rate-limit hover ticks to one per 45 ms', async () => {
    const { context, uiTick } = await freshSounds();
    uiTick();
    context.currentTime += 0.02;
    uiTick();
    context.currentTime += 0.03;
    uiTick();
    expect(context.notes).toHaveLength(2);
  });

  it('stay silent while the context is suspended (before a user gesture)', async () => {
    const { context, uiConfirm, uiKeep } = await freshSounds();
    context.state = 'suspended';
    uiConfirm();
    uiKeep();
    expect(context.notes).toHaveLength(0);
    expect(context.buffers).toHaveLength(0);
  });

  it('honour the Interface sounds setting', async () => {
    const { context, setUiSoundsEnabled, uiConfirm, uiKeep, uiPerk, uiWood } = await freshSounds();
    setUiSoundsEnabled(false);
    uiConfirm();
    uiPerk();
    uiKeep();
    uiWood();
    expect(context.notes).toHaveLength(0);
    expect(context.buffers).toHaveLength(0);
    setUiSoundsEnabled(true);
    uiConfirm();
    expect(context.notes).toHaveLength(2);
  });
});
