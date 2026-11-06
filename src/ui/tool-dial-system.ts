/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * The radial tool dial (replaces the legacy 3D mode tiles).
 *
 * Press A to bloom the dial in front of the right controller; press again to
 * close. A tile can be chosen three ways:
 *   - point the ray and pull the trigger (UIKit click),
 *   - touch it with the controller and pull the trigger,
 *   - flick the right thumbstick toward it, or hold A, flick, release A.
 * While the tutorial runs only Seeds can be chosen, as in the legacy NUX.
 *
 * With hand tracking there is no A button: turning the inside of the left
 * wrist toward the face shows a round Tools button on it, like a watch face.
 * Tap it with the right index finger (or pinch it with the right hand's ray)
 * to open or close the dial; then tap a tile with the fingertip, or point and
 * pinch. It sits on the wrist rather than the palm so it stays clear of
 * anything the hand holds, such as the seedbox.
 */

import { jointPosition, palmPose } from '../core/hands.js';
import { InputComponent, Object3D, Vector3, createSystem } from '@iwsdk/core';
import { audio } from '../core/audio.js';
import { gamepad, gripPosition, haptic, headPosition, selectDown } from '../core/input.js';
import {
  activeTool,
  byInput,
  dialLocked,
  openPanel,
  teleporting,
  Tool,
  TOOL_INFO,
  TOOL_ORDER,
  toolDialOpen,
  toolHint,
  tutorialActive,
} from '../core/state.js';
import { spawnPanel, type SpawnedPanel } from './panels.js';
import { holdTurning } from '../core/locomotion-holds.js';
import { easeOutBack } from '../core/tween.js';

const DIAL_SCALE = 0.55;
const PALM_BUTTON_SCALE = 0.08;
/**
 * Tools button placement: behind the wrist joint toward the elbow, past the
 * glove's cuff, and raised off the forearm (metres).
 */
const WRIST_BACK = 0.085;
const WRIST_LIFT = 0.04;
/** Fingertip distance that presses the palm button (metres). */
const PALM_PRESS_RADIUS = 0.035;
/** Palm-facing thresholds (cosine), with hysteresis so it doesn't flicker. */
const PALM_SHOW = 0.6;
const PALM_HIDE = 0.35;
/** One press of the palm button can arrive as both a poke and a click. */
const TOGGLE_COOLDOWN = 0.5;
/** Within this fingertip distance a panel click counts as the poke itself. */
const PALM_NEAR = 0.09;
const BLOOM_TIME = 0.14;
const TOUCH_RADIUS = 0.045;
const HOLD_TO_RELEASE = 0.35;
/** Largest angle between the view centre and the dial centre. */
const MAX_VIEW_ANGLE = (20 * Math.PI) / 180;
/** Tile centers in dial units (cm), matching tool-dial.uikitml. */
const RING_RADIUS = 15;

export class ToolDialSystem extends createSystem({}) {
  private panel: SpawnedPanel | null = null;
  private anchor = new Object3D();
  private phase: 'closed' | 'opening' | 'open' | 'closing' = 'closed';
  private t = 0;
  private focused: Tool | null = null;
  private rayHover: Tool | null = null;
  private pending: Tool | null = null;
  private aHeldFor = 0;
  private tmp = new Vector3();
  private head = new Vector3();
  private center = new Vector3();
  private view = new Vector3();
  private axis = new Vector3();
  private tileWorld = new Vector3();
  private grip = new Vector3();
  private palmButton: SpawnedPanel | null = null;
  private palmShown = false;
  private sinceToggle = TOGGLE_COOLDOWN;
  private palmCenter = new Vector3();
  private wrist = new Vector3();
  private palmNormal = new Vector3();
  private fingertip = new Vector3();
  private tileLocal = TOOL_ORDER.map((_, k) => {
    const angle = (-90 + 60 * k) * (Math.PI / 180);
    // Dial units are cm, centered on the 44 cm panel.
    return new Vector3((RING_RADIUS * Math.cos(angle)) / 100, (-RING_RADIUS * Math.sin(angle)) / 100, 0);
  });

  override init(): void {
    this.anchor.name = 'tool-dial-anchor';
    const anchorEntity = this.world.createTransformEntity(this.anchor, { persistent: true });
    void spawnPanel(this.world, 'tool-dial', {
      scale: DIAL_SCALE,
      parent: anchorEntity,
      animate: false,
    }).then((panel) => {
      this.panel = panel;
      panel.show(false);
      for (const tool of TOOL_ORDER) {
        const id = `tile-${tool}`;
        this.cleanupFuncs.push(
          panel.on(id, 'click', () => this.choose(tool)),
          panel.on(id, 'pointerenter', () => {
            this.rayHover = tool;
          }),
          panel.on(id, 'pointerleave', () => {
            if (this.rayHover === tool) this.rayHover = null;
          }),
        );
      }
    });
    void spawnPanel(this.world, 'palm-tools', { scale: PALM_BUTTON_SCALE }).then((panel) => {
      this.palmButton = panel;
      panel.show(false);
      // Ray-pinch clicks press it too; a click while the fingertip is at the
      // button is the same poke arriving through IWSDK's touch pointer.
      this.cleanupFuncs.push(panel.on('palm-tools', 'click', () => !this.fingerNear && this.toggleFromPalm()));
    });
    this.cleanupFuncs.push(
      activeTool.subscribe(() => this.paintTiles()),
      tutorialActive.subscribe(() => this.paintTiles()),
      toolDialOpen.subscribe((open) => this.palmButton?.text('palm-tools-label', open ? 'Close' : 'Tools')),
    );
  }

  /** Hand tracking: the Tools button sits on the inner left wrist when it faces you. */
  private updatePalmButton(delta: number): void {
    this.sinceToggle += delta;
    const button = this.palmButton;
    if (!button) return;
    const tracked = palmPose(this.world, 'left', this.palmCenter, this.palmNormal);
    let facing = -1;
    if (tracked) {
      headPosition(this.world, this.head);
      facing = this.tmp.subVectors(this.head, this.palmCenter).normalize().dot(this.palmNormal);
    }
    const show = tracked && !teleporting.peek() && (this.palmShown ? facing > PALM_HIDE : facing > PALM_SHOW);
    if (show !== this.palmShown) {
      this.palmShown = show;
      button.show(show);
    }
    if (!show) return;
    const root = button.root;
    // Just behind the wrist joint toward the forearm, raised off the skin.
    jointPosition(this.world, 'left', 'wrist', this.wrist);
    this.tmp.subVectors(this.palmCenter, this.wrist).normalize();
    root.position.copy(this.wrist).addScaledVector(this.tmp, -WRIST_BACK).addScaledVector(this.palmNormal, WRIST_LIFT);
    root.lookAt(this.head);
    // A poke with the right index fingertip presses it once; the finger must
    // move away again before the next press.
    this.fingerNear = false;
    if (jointPosition(this.world, 'right', 'index-finger-tip', this.fingertip)) {
      const distance = this.fingertip.distanceTo(root.position);
      this.fingerNear = distance < PALM_NEAR;
      if (distance < PALM_PRESS_RADIUS && !this.palmPressed) {
        this.palmPressed = true;
        this.toggleFromPalm();
      } else if (distance > PALM_PRESS_RADIUS * 1.6) {
        this.palmPressed = false;
      }
    }
  }

  private palmPressed = false;
  private fingerNear = false;

  private toggleFromPalm(): void {
    if (this.sinceToggle < TOGGLE_COOLDOWN) return;
    this.sinceToggle = 0;
    haptic(this.world, 'left', 0.3, 30);
    if (this.phase === 'closed' || this.phase === 'closing') {
      if (!dialLocked.peek()) this.open(this.palmButton?.root.position);
    } else {
      this.close(null);
    }
  }

  override update(delta: number): void {
    if (!this.panel) return;
    this.updatePalmButton(delta);
    const pad = gamepad(this.world, 'right');
    const aDown = pad?.getButtonDown(InputComponent.A_Button) ?? false;
    const aHeld = pad?.getButtonPressed(InputComponent.A_Button) ?? false;
    const aUp = pad?.getButtonUp(InputComponent.A_Button) ?? false;

    if (aDown) {
      if (this.phase === 'closed' || this.phase === 'closing') {
        if (!dialLocked.peek()) this.open();
      } else this.close(null);
    }
    if (this.phase === 'closed') return;

    if (aHeld) this.aHeldFor += delta;
    this.animate(delta);
    if (this.phase !== 'open') return;

    // Focus: touch beats ray beats thumbstick.
    let focus: Tool | null = this.touchFocus();
    if (!focus) focus = this.rayHover;
    const stick = pad?.getAxesValues(InputComponent.Thumbstick);
    let stickFocus: Tool | null = null;
    if (stick && Math.hypot(stick.x, stick.y) > 0.6) {
      // Tile 0 (Seeds) sits at 12 o'clock; tiles advance clockwise.
      const angle = Math.atan2(stick.x, -stick.y);
      const sector = Math.round(angle / (Math.PI / 3));
      stickFocus = TOOL_ORDER[(sector + 6) % 6];
      focus ??= stickFocus;
    }
    this.setFocus(focus);

    const triggerDown = selectDown(this.world, 'right');
    // A fingertip touching a tile chooses it, like pressing a button, once
    // the finger has been clear of the tiles since the dial opened.
    const touched = this.touchFocus();
    if (!touched) this.touchArmed = true;
    if (this.fingerTouching && this.touchArmed && touched) this.choose(touched);
    else if (triggerDown && focus && focus !== this.rayHover) this.choose(focus);
    else if (aUp && this.aHeldFor > HOLD_TO_RELEASE && focus) this.choose(focus);
    else if (stickFocus && pad?.getButtonDown(InputComponent.Thumbstick)) this.choose(stickFocus);
  }

  /** Open the dial near `origin` (default: the right controller). */
  private open(origin?: Vector3): void {
    if (!this.panel) return;
    const grip = origin ? this.grip.copy(origin) : gripPosition(this.world, 'right', this.grip);
    headPosition(this.world, this.head);
    // Bloom above the controller and toward the eyes, so the hand never
    // covers a tile, then face the player.
    this.tmp.subVectors(this.head, grip).normalize();
    this.anchor.position.copy(grip).addScaledVector(this.tmp, 0.08);
    this.anchor.position.y += 0.13;
    // Pull a third of the way toward the line of sight so it opens in view.
    this.world.player.head.getWorldDirection(this.center).negate();
    const reach = this.anchor.position.distanceTo(this.head);
    this.view.copy(this.center);
    this.center.multiplyScalar(reach).add(this.head);
    this.anchor.position.lerp(this.center, 0.35);
    // Cap the angle from the view centre so no tile falls outside the view.
    this.tmp.subVectors(this.anchor.position, this.head);
    const angle = this.tmp.angleTo(this.view);
    if (angle > MAX_VIEW_ANGLE) {
      this.axis.crossVectors(this.view, this.tmp).normalize();
      this.tmp.normalize().applyAxisAngle(this.axis, MAX_VIEW_ANGLE - angle);
      this.anchor.position.copy(this.head).addScaledVector(this.tmp, reach);
    }
    // Never closer than 0.42 m to the eyes, so every tile fits in view.
    this.tmp.subVectors(this.anchor.position, this.head);
    if (this.tmp.length() < 0.42) {
      this.anchor.position.copy(this.head).addScaledVector(this.tmp.normalize(), 0.42);
    }
    this.anchor.lookAt(this.head);
    this.anchor.scale.setScalar(0.001);
    this.panel.show(true);
    this.phase = 'opening';
    this.t = 0;
    this.aHeldFor = 0;
    this.pending = null;
    this.touchArmed = false;
    this.panel.text('hub-title', 'Tools');
    this.panel.text('hub-hint', byInput('Point, touch or flick the stick', 'Point and pinch, or touch a tile'));
    toolDialOpen.value = true;
    this.pauseTurning(true);
    this.paintTiles();
    audio.play('MENU_OPEN', grip);
    haptic(this.world, 'right', 0.25, 30);
  }

  private close(chosen: Tool | null): void {
    if (this.phase === 'closed' || this.phase === 'closing') return;
    this.pending = chosen;
    this.phase = 'closing';
    this.t = 0;
    audio.play('MENU_CLOSE', gripPosition(this.world, 'right', this.grip));
  }

  private animate(delta: number): void {
    this.t += delta;
    if (this.phase === 'opening') {
      const k = Math.min(this.t / BLOOM_TIME, 1);
      this.anchor.scale.setScalar(Math.max(0.001, easeOutBack(k)));
      if (k >= 1) this.phase = 'open';
    } else if (this.phase === 'closing') {
      // A chosen tile lingers briefly so the choice reads (legacy 0.2 s).
      const linger = this.pending ? 0.12 : 0;
      const k = Math.min(Math.max(this.t - linger, 0) / 0.1, 1);
      this.anchor.scale.setScalar(Math.max(0.001, 1 - k));
      if (k >= 1) this.finishClose();
    }
  }

  private finishClose(): void {
    this.phase = 'closed';
    this.panel?.show(false);
    this.setFocus(null);
    this.rayHover = null;
    toolDialOpen.value = false;
    this.pauseTurning(false);
    const chosen = this.pending;
    this.pending = null;
    if (!chosen) return;
    if (chosen === Tool.Settings) {
      openPanel.value = openPanel.peek() === 'settings' ? 'none' : 'settings';
      return;
    }
    if (chosen === Tool.Seeds && activeTool.peek() !== Tool.Seeds) {
      audio.play('SEEDBOX_OPEN', this.anchor.position);
    }
    activeTool.value = chosen;
  }

  private choose(tool: Tool): void {
    if (this.phase !== 'open') return;
    if (tutorialActive.peek() && tool !== Tool.Seeds) {
      haptic(this.world, 'right', 0.6, 60);
      return;
    }
    haptic(this.world, 'right', 0.5, 60);
    this.setFocus(tool);
    this.close(tool);
  }

  private fingerTouching = false;
  private touchArmed = false;

  private touchFocus(): Tool | null {
    // Tracked hand: the right index fingertip; controller: the grip.
    this.fingerTouching = jointPosition(this.world, 'right', 'index-finger-tip', this.grip);
    if (!this.fingerTouching) gripPosition(this.world, 'right', this.grip);
    let best: Tool | null = null;
    let bestDistance = TOUCH_RADIUS;
    TOOL_ORDER.forEach((tool, k) => {
      this.tileWorld.copy(this.tileLocal[k]).multiplyScalar(DIAL_SCALE);
      this.anchor.localToWorld(this.tileWorld);
      const d = this.tileWorld.distanceTo(this.grip);
      if (d < bestDistance) {
        bestDistance = d;
        best = tool;
      }
    });
    return best;
  }

  private setFocus(tool: Tool | null): void {
    if (tool === this.focused) return;
    this.focused = tool;
    if (tool) haptic(this.world, 'right', 0.08, 12);
    this.paintTiles();
    if (!this.panel) return;
    const info = tool ? TOOL_INFO[tool] : null;
    const locked = tool != null && tutorialActive.peek() && tool !== Tool.Seeds;
    this.panel.text('hub-title', info ? info.label : 'Tools');
    this.panel.text(
      'hub-hint',
      locked
        ? 'Finish the tutorial to unlock'
        : info
          ? toolHint(tool!)
          : byInput('Point, touch or flick the stick', 'Point and pinch, or touch a tile'),
    );
  }

  private paintTiles(): void {
    if (!this.panel) return;
    const current = activeTool.peek();
    for (const tool of TOOL_ORDER) {
      const id = `tile-${tool}`;
      const info = TOOL_INFO[tool];
      const isFocused = tool === this.focused;
      const isActive = tool === current || (tool === Tool.Settings && openPanel.peek() === 'settings');
      const locked = tutorialActive.peek() && tool !== Tool.Seeds;
      this.panel.style(id, {
        backgroundColor: isFocused ? '#2f4a3d' : locked ? '#151c19' : '#1c2a24',
        borderColor: isActive ? info.color : isFocused ? '#9bb8a8' : '#33463d',
        borderWidth: isActive ? 0.7 : 0.35,
        transformScale: isFocused ? 1.12 : 1,
        opacity: locked ? 0.35 : 1,
      });
    }
  }

  private pauseTurning(paused: boolean): void {
    holdTurning(this.world, 'tool-dial', paused);
  }
}
