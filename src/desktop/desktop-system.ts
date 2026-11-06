/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Mouse-and-keyboard play on desktop (legacy xplat.js), by driving the IWER
 * emulated headset and controllers. Every VR mechanic therefore works the
 * same way on a laptop.
 *
 *   Click          lock the mouse; then mouse looks around
 *   W A S D        glide            Space (hold)  aim a teleport, release to go
 *   Left mouse     use the tool     Arrows L/R    snap turn
 *   F              tool dial        1-5           pick a tool directly
 *   Right mouse    raise the seedbox / camera into view
 *   E / Q          next / previous seed page; with the camera, E takes a print,
 *                  then E carries it to Keep and Q to Discard
 *   Mouse wheel    camera zoom      Esc           release the mouse
 */

import { Euler, Quaternion, Vector3, VisibilityState, createSystem } from '@iwsdk/core';
import { printLocator } from '../camera/camera-system.js';
import { TOOL_ORDER, Tool, activeTool, tutorialActive } from '../core/state.js';
import { desktopMode, emulatedDevice } from './emulator.js';

const LOOK_SPEED = 0.0022;
const HAND_SPEED = 6;
const REST = {
  left: new Vector3(-0.18, -0.11, -0.35),
  right: new Vector3(0.18, -0.11, -0.35),
};

export class DesktopSystem extends createSystem({}) {
  private enabled = false;
  /** Pointer lock refused (embedded frames, some kiosks): clicks still act. */
  private lockUnavailable = false;
  private yaw = 0;
  private pitch = 0;
  private keys = new Set<string>();
  private mouse = { left: false, right: false };
  private hands = { left: REST.left.clone(), right: REST.right.clone() };
  private handTilt = { left: 0, right: 0 };
  private headQuat = new Quaternion();
  private handQuat = new Quaternion();
  private euler = new Euler(0, 0, 0, 'YXZ');
  private v = new Vector3();
  private headPos = new Vector3(0, 1.6, 0);
  private overlay: HTMLElement | null = null;
  private pulses: { id: string; hand: 'left' | 'right'; until: number }[] = [];
  private elapsed = 0;

  override init(): void {
    this.enabled = desktopMode();
    if (!this.enabled) return;
    this.overlay = document.getElementById('desktop-help');
    // IWER re-hosts the canvas, so lock the body and listen on the window.
    const lockTarget = document.body;
    const locked = () => document.pointerLockElement != null;
    const onMove = (event: MouseEvent) => {
      if (!locked()) return;
      this.yaw -= event.movementX * LOOK_SPEED;
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch - event.movementY * LOOK_SPEED));
    };
    const onDown = (event: MouseEvent) => {
      if (!this.presenting()) return;
      if (!locked() && !this.lockUnavailable) {
        Promise.resolve(lockTarget.requestPointerLock()).catch(() => {
          this.lockUnavailable = true;
        });
        return;
      }
      if (event.button === 0) this.mouse.left = true;
      if (event.button === 2) this.mouse.right = true;
    };
    const onUp = (event: MouseEvent) => {
      if (event.button === 0) this.mouse.left = false;
      if (event.button === 2) this.mouse.right = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!this.presenting()) return;
      this.keys.add(event.code);
      // Held keys auto-repeat; actions fire once per press.
      if (event.repeat) return;
      const digit = /^Digit([1-5])$/.exec(event.code);
      if (digit && !tutorialActive.peek()) {
        const tool = TOOL_ORDER[Number(digit[1]) - 1];
        if (tool !== Tool.Settings) activeTool.value = tool;
      }
      const tool = activeTool.peek();
      if (event.code === 'KeyF') this.tap('right', 'a-button');
      if (event.code === 'KeyE') {
        if (tool !== Tool.Camera) this.tap('left', 'x-button');
        else if (printLocator.holding()) this.reachForTile('keep');
        else this.reachForPrint();
      }
      if (event.code === 'KeyQ') {
        if (tool === Tool.Camera && printLocator.holding()) this.reachForTile('discard');
        else if (tool !== Tool.Camera) this.tap('left', 'y-button');
      }
    };
    const onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);
    const onWheel = (event: WheelEvent) => {
      if (activeTool.peek() !== Tool.Camera || !this.presenting()) return;
      this.tap('left', event.deltaY < 0 ? 'x-button' : 'y-button');
    };
    const onContext = (event: Event) => event.preventDefault();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('contextmenu', onContext);
    const onLock = () => {
      this.overlay?.classList.toggle('locked', locked());
    };
    const onLockError = () => {
      this.lockUnavailable = true;
    };
    document.addEventListener('pointerlockchange', onLock);
    document.addEventListener('pointerlockerror', onLockError);
    this.cleanupFuncs.push(
      () => window.removeEventListener('mousemove', onMove),
      () => window.removeEventListener('mousedown', onDown),
      () => window.removeEventListener('mouseup', onUp),
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('wheel', onWheel),
      () => window.removeEventListener('contextmenu', onContext),
      () => document.removeEventListener('pointerlockchange', onLock),
      () => document.removeEventListener('pointerlockerror', onLockError),
      this.world.visibilityState.subscribe((state) => {
        const inXR = state !== VisibilityState.NonImmersive;
        this.overlay?.classList.toggle('visible', inXR);
        if (!inXR && document.pointerLockElement) document.exitPointerLock();
      }),
    );
  }

  private presenting(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  /** Legacy xplat E in camera mode: reach the left hand to the print and grab. */
  private reachForPrint(): void {
    if (!printLocator.find(this.v)) return;
    this.reach = { target: this.headLocal(this.v), at: this.elapsed, drop: false };
  }

  /** Carry the held print to a drop tile and let go there. */
  private reachForTile(action: 'keep' | 'discard'): void {
    if (!printLocator.tile(action, this.v)) return;
    this.reach = { target: this.headLocal(this.v), at: this.elapsed, drop: true };
  }

  /** World -> XR origin -> head-local offset for the hand proxy. */
  private headLocal(world: Vector3): Vector3 {
    this.world.player.worldToLocal(world);
    return world.sub(this.headPos).applyQuaternion(tmpQ.copy(this.headQuat).invert()).clone();
  }

  private reach: { target: Vector3; at: number; drop: boolean } | null = null;
  /** The left trigger stays closed while a print is held. */
  private holdingPrint = false;
  private grabbedAt = 0;

  /** Press a button for a short moment (keyboard taps). */
  private tap(hand: 'left' | 'right', id: string, seconds = 0.12): void {
    const controller = emulatedDevice()?.controllers[hand];
    controller?.updateButtonValue(id, 1);
    this.pulses.push({ id, hand, until: this.elapsed + seconds });
  }

  override update(delta: number): void {
    if (!this.enabled || !this.presenting()) return;
    this.elapsed += delta;
    const device = emulatedDevice();
    if (!device) return;

    for (const pulse of [...this.pulses]) {
      if (this.elapsed >= pulse.until) {
        device.controllers[pulse.hand]?.updateButtonValue(pulse.id, 0);
        this.pulses.splice(this.pulses.indexOf(pulse), 1);
      }
    }

    // Head.
    this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.headQuat.setFromEuler(this.euler);
    device.quaternion.set(this.headQuat.x, this.headQuat.y, this.headQuat.z, this.headQuat.w);
    this.headPos.set(device.position.x, device.position.y, device.position.z);

    // Sticks and buttons.
    const k = this.keys;
    const x = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const y = (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0);
    const length = Math.hypot(x, y) || 1;
    device.controllers.left?.updateAxes('thumbstick', x / length, y / length);
    const turn = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
    device.controllers.right?.updateAxes('thumbstick', turn, k.has('Space') ? -1 : 0);
    device.controllers.right?.updateButtonValue('trigger', this.mouse.left ? 1 : 0);

    // Hands follow the view; right mouse raises the active prop into view.
    const tool = activeTool.peek();
    const raise = this.mouse.right;
    let leftTarget = raise && tool === Tool.Seeds ? tmpA.set(-0.08, -0.08, -0.42) : REST.left;
    if (this.reach) {
      // Travel there, then close the hand on the print (it comes back with
      // the hand) or open it over the tile.
      const t = this.elapsed - this.reach.at;
      if (t < 0.35) leftTarget = this.reach.target;
      else {
        this.holdingPrint = !this.reach.drop;
        this.grabbedAt = this.elapsed;
        this.reach = null;
      }
    }
    // Keep the trigger closed only while a print is actually held (the grab
    // registers a frame or two after the trigger closes).
    if (this.holdingPrint && tool !== Tool.Camera) this.holdingPrint = false;
    if (this.holdingPrint && this.elapsed - this.grabbedAt > 0.3 && !printLocator.holding()) this.holdingPrint = false;
    device.controllers.left?.updateButtonValue('trigger', this.holdingPrint || this.reach?.drop ? 1 : 0);
    const rightTarget = raise && tool === Tool.Camera ? tmpB.set(0.07, -0.02, -0.22) : REST.right;
    const t = Math.min(1, delta * HAND_SPEED);
    this.hands.left.lerp(leftTarget, t);
    this.hands.right.lerp(rightTarget, t);
    this.handTilt.left += ((raise && tool === Tool.Seeds ? Math.PI / 4 : 0) - this.handTilt.left) * t;
    for (const hand of ['left', 'right'] as const) {
      const controller = device.controllers[hand];
      if (!controller) continue;
      this.v.copy(this.hands[hand]).applyQuaternion(this.headQuat).add(this.headPos);
      controller.position.set(this.v.x, this.v.y, this.v.z);
      this.handQuat.copy(this.headQuat);
      if (this.handTilt[hand] > 0.001) {
        tmpQ.setFromAxisAngle(AXIS_X, this.handTilt[hand]);
        this.handQuat.multiply(tmpQ);
      }
      controller.quaternion.set(this.handQuat.x, this.handQuat.y, this.handQuat.z, this.handQuat.w);
    }
  }
}

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpQ = new Quaternion();
const AXIS_X = new Vector3(1, 0, 0);
