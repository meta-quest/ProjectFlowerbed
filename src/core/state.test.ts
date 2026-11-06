/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { join } from 'node:path';
import { PUBLIC, matchAll, readText } from '../test-utils/repo.js';

/** Shared signals are module state, so each test gets a fresh copy. */
async function freshState() {
  vi.resetModules();
  return import('./state.js');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.advanceTimersByTime(10000);
});

afterEach(() => vi.useRealTimers());

describe('tools', () => {
  it('orders all six tools once on the hexagonal dial and describes each', async () => {
    const { TOOL_INFO, TOOL_ORDER, Tool } = await freshState();
    expect(TOOL_ORDER).toHaveLength(6);
    expect([...TOOL_ORDER].sort()).toEqual(Object.values(Tool).sort());
    expect(Object.keys(TOOL_INFO).sort()).toEqual(Object.values(Tool).sort());
    for (const [tool, info] of Object.entries(TOOL_INFO)) {
      expect(info.label, tool).not.toBe('');
      expect(info.hint, tool).not.toBe('');
      expect(info.icon, tool).toMatch(/^[A-Z]\w+$/);
      expect(info.color, tool).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('has a dial tile for every tool (tile-<tool> in tool-dial.uikitml)', async () => {
    const { TOOL_ORDER } = await freshState();
    const ids = new Set(matchAll(readText(join(PUBLIC, 'ui/tool-dial.uikitml')), /\bid="([^"]+)"/g));
    for (const tool of TOOL_ORDER) expect(ids).toContain(`tile-${tool}`);
  });
});

describe('isToolLive', () => {
  it('requires XR, the held tool, a closed dial and no teleport', async () => {
    const { activeTool, inXR, isToolLive, teleporting, toolDialOpen, Tool } = await freshState();
    activeTool.value = Tool.Water;
    expect(isToolLive(Tool.Water)).toBe(false); // not in XR
    inXR.value = true;
    expect(isToolLive(Tool.Water)).toBe(true);
    expect(isToolLive(Tool.Seeds)).toBe(false);
    toolDialOpen.value = true;
    expect(isToolLive(Tool.Water)).toBe(false);
    toolDialOpen.value = false;
    teleporting.value = true;
    expect(isToolLive(Tool.Water)).toBe(false);
  });
});

describe('input wording', () => {
  it('switches between controller and hand wording', async () => {
    const { byInput, handMode } = await freshState();
    expect(byInput('Pull the trigger', 'Pinch')).toBe('Pull the trigger');
    handMode.value = true;
    expect(byInput('Pull the trigger', 'Pinch')).toBe('Pinch');
  });

  it('uses the hand hint when tracking hands, falling back to the controller hint', async () => {
    const { TOOL_INFO, Tool, handMode, toolHint } = await freshState();
    expect(toolHint(Tool.Seeds)).toBe(TOOL_INFO.seeds.hint);
    handMode.value = true;
    expect(toolHint(Tool.Seeds)).toBe(TOOL_INFO.seeds.handHint);
    expect(toolHint(Tool.Explore)).toBe(TOOL_INFO.explore.hint); // no hand-specific hint
  });
});

describe('showToast', () => {
  it('shows a toast with default colour and hand', async () => {
    const { showToast, toast } = await freshState();
    showToast('Garden saved', '3 plants');
    expect(toast.peek()).toMatchObject({
      label: 'Garden saved',
      sub: '3 plants',
      color: '#86dc3d',
      hand: 'right',
      count: 1,
    });
  });

  it('merges quick repeats of the same toast into a counter', async () => {
    const { showToast, toast } = await freshState();
    showToast('Planted', 'Rose');
    vi.advanceTimersByTime(1000);
    showToast('Planted', 'Tulip', '#fff', 'left');
    expect(toast.peek()).toMatchObject({ label: 'Planted', sub: 'Tulip', color: '#fff', hand: 'left', count: 2 });
  });

  it('starts a new count after 2.5 s or for a different toast', async () => {
    const { showToast, toast } = await freshState();
    showToast('Planted', 'Rose');
    vi.advanceTimersByTime(2600);
    showToast('Planted', 'Rose');
    expect(toast.peek()?.count).toBe(1);
    showToast('Removed', 'Rose');
    expect(toast.peek()?.count).toBe(1);
  });
});

describe('markGardenDirty', () => {
  it('bumps the dirty counter so the garden system saves', async () => {
    const { gardenDirty, markGardenDirty } = await freshState();
    const seen: number[] = [];
    const stop = gardenDirty.subscribe((value) => seen.push(value));
    markGardenDirty();
    markGardenDirty();
    stop();
    expect(seen).toEqual([0, 1, 2]);
  });
});
