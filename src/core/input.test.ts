/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { InputComponent, Vector3 } from '@iwsdk/core';
import { FakePad, createFakeWorld, type FakeWorld } from '../test-utils/fake-world.js';

const TRIGGER = InputComponent.Trigger as string;

/** haptic() keeps per-hand timestamps in module state. */
async function freshInput() {
  vi.resetModules();
  return import('./input.js');
}

let fake: FakeWorld;

beforeEach(() => {
  fake = createFakeWorld();
  vi.useFakeTimers();
  vi.advanceTimersByTime(1000);
});

afterEach(() => vi.useRealTimers());

function controller(hand: 'left' | 'right'): FakePad {
  const pad = new FakePad();
  fake.gamepads[hand] = pad;
  fake.hands[hand].primary = 'controller';
  return pad;
}

describe('buttons', () => {
  it('read as released and zero without a controller, and from the gamepad with one', async () => {
    const { held, pressedDown, released, value, hasController } = await freshInput();
    expect(pressedDown(fake.world, 'right', InputComponent.A_Button)).toBe(false);
    expect(released(fake.world, 'right', InputComponent.A_Button)).toBe(false);
    expect(held(fake.world, 'right', InputComponent.Squeeze)).toBe(false);
    expect(value(fake.world, 'right', InputComponent.Squeeze)).toBe(0);
    expect(hasController(fake.world, 'right')).toBe(false);
    const pad = controller('left');
    pad.down.add(InputComponent.X_Button);
    pad.pressed.add(InputComponent.Squeeze);
    pad.values.set(InputComponent.Squeeze, 0.7);
    expect(hasController(fake.world, 'left')).toBe(true);
    expect(pressedDown(fake.world, 'left', InputComponent.X_Button)).toBe(true);
    expect(held(fake.world, 'left', InputComponent.Squeeze)).toBe(true);
    expect(value(fake.world, 'left', InputComponent.Squeeze)).toBe(0.7);
  });
});

describe('select (trigger or pinch)', () => {
  it('uses the trigger on a controller', async () => {
    const { selectDown, selectHeld, selectUp, selectValue } = await freshInput();
    const pad = controller('right');
    pad.down.add(TRIGGER);
    pad.pressed.add(TRIGGER);
    pad.values.set(TRIGGER, 0.4);
    expect(selectDown(fake.world, 'right')).toBe(true);
    expect(selectHeld(fake.world, 'right')).toBe(true);
    expect(selectUp(fake.world, 'right')).toBe(false);
    expect(selectValue(fake.world, 'right')).toBe(0.4);
  });

  it('uses the pinch select state on a tracked hand, ignoring a stale gamepad', async () => {
    const { selectDown, selectHeld, selectUp } = await freshInput();
    const pad = controller('right');
    pad.down.add(TRIGGER);
    fake.hands.right.primary = 'hand';
    fake.hands.right.select = { start: false, active: true, end: true };
    expect(selectDown(fake.world, 'right')).toBe(false);
    expect(selectHeld(fake.world, 'right')).toBe(true);
    expect(selectUp(fake.world, 'right')).toBe(true);
  });

  it('reports pinch closure as the analog value until the pinch selects', async () => {
    const { selectValue } = await freshInput();
    fake.hands.left.primary = 'hand';
    fake.hands.left.pinch = 0.6;
    expect(selectValue(fake.world, 'left')).toBe(0.6);
    fake.hands.left.select.active = true;
    expect(selectValue(fake.world, 'left')).toBe(1);
  });

  it('is zero with nothing connected', async () => {
    const { selectDown, selectValue } = await freshInput();
    expect(selectDown(fake.world, 'left')).toBe(false);
    expect(selectValue(fake.world, 'left')).toBe(0);
  });
});

describe('clickingHand', () => {
  it('prefers the hand whose ray is over UI, then the harder-pressed trigger, then right', async () => {
    const { clickingHand } = await freshInput();
    fake.hands.left.rayBusy = true;
    expect(clickingHand(fake.world)).toBe('left');
    fake.hands.right.rayBusy = true;
    fake.hands.left.rayBusy = false;
    expect(clickingHand(fake.world)).toBe('right');
    fake.hands.right.rayBusy = false;
    controller('left').values.set(TRIGGER, 0.9);
    controller('right').values.set(TRIGGER, 0.2);
    expect(clickingHand(fake.world)).toBe('left');
    fake.gamepads.left!.values.set(TRIGGER, 0.2);
    expect(clickingHand(fake.world)).toBe('right');
  });
});

describe('haptic', () => {
  it('pulses the controller actuator', async () => {
    const { haptic } = await freshInput();
    const pad = controller('right');
    haptic(fake.world, 'right', 0.3, 25);
    expect(pad.pulses).toEqual([[0.3, 25]]);
  });

  it('coalesces weak pulses within 8 ms but never strong ones', async () => {
    const { haptic } = await freshInput();
    const pad = controller('right');
    haptic(fake.world, 'right', 0.2, 10);
    haptic(fake.world, 'right', 0.2, 10);
    haptic(fake.world, 'right', 0.8, 10);
    vi.advanceTimersByTime(9);
    haptic(fake.world, 'right', 0.2, 10);
    expect(pad.pulses.map(([intensity]) => intensity)).toEqual([0.2, 0.8, 0.2]);
  });

  it('rate-limits each hand separately', async () => {
    const { haptic } = await freshInput();
    const left = controller('left');
    const right = controller('right');
    haptic(fake.world, 'left', 0.1, 5);
    haptic(fake.world, 'right', 0.1, 5);
    expect(left.pulses).toHaveLength(1);
    expect(right.pulses).toHaveLength(1);
  });

  it('is a no-op for hands, missing actuators and rejected pulses', async () => {
    const { haptic } = await freshInput();
    expect(() => haptic(fake.world, 'left', 0.5, 10)).not.toThrow();
    const pad = controller('right');
    pad.hasActuator = false;
    expect(() => haptic(fake.world, 'right', 0.5, 10)).not.toThrow();
    pad.hasActuator = true;
    pad.pulseResult = () => Promise.reject(new Error('not allowed'));
    vi.advanceTimersByTime(20);
    expect(() => haptic(fake.world, 'right', 0.5, 10)).not.toThrow();
    await Promise.resolve(); // the rejection is swallowed, not unhandled
  });
});

describe('poses', () => {
  it('aims the ray down the ray space -Z axis in world space', async () => {
    const { rayPose } = await freshInput();
    const space = fake.player.raySpaces.right;
    space.position.set(0.2, 1.4, -0.1);
    space.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2); // turn left
    space.updateMatrixWorld(true);
    const origin = new Vector3();
    const direction = new Vector3();
    rayPose(fake.world, 'right', origin, direction);
    expect(origin.toArray()).toEqual([0.2, 1.4, -0.1].map((n) => expect.closeTo(n, 6)));
    expect(direction.x).toBeCloseTo(-1);
    expect(direction.z).toBeCloseTo(0);
    expect(direction.length()).toBeCloseTo(1);
  });
});
