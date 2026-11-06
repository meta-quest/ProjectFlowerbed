/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Small heads-up surfaces:
 * - the "pick up both controllers" card while fewer than two controllers
 *   are connected in XR (legacy controller-only panel);
 * - a tool chip that briefly confirms the active tool above the right hand.
 */

import { BackSide, createSystem, Mesh, MeshBasicMaterial, SphereGeometry, Vector3, VisibilityState } from '@iwsdk/core';
import { settings } from '../core/settings.js';
import { activeTool, blink, inXR, toast, TOOL_INFO, toolHint } from '../core/state.js';
import { GazeFollower } from './follow.js';
import { spawnPanel, type SpawnedPanel } from './panels.js';

const CHIP_SECONDS = 2.2;
const BLINK_TIME = 0.22;

export class HudSystem extends createSystem({}) {
  private controllers: SpawnedPanel | null = null;
  private follower: GazeFollower | null = null;
  private chip: SpawnedPanel | null = null;
  private chipTimer = 0;
  private chipScale = 0;
  private missingFor = 0;
  /** Legacy EnterVRTransition: fade in from black when a session starts. */
  private fade = new Mesh(
    new SphereGeometry(0.4, 16, 12),
    new MeshBasicMaterial({ color: 0x000000, side: BackSide, transparent: true, depthTest: false, depthWrite: false }),
  );
  private fadeT = -1;
  private blinkT = -1;

  override init(): void {
    this.fade.renderOrder = 10000;
    this.fade.visible = false;
    this.fade.frustumCulled = false;
    this.world.player.head.add(this.fade);
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        inXR.value = state !== VisibilityState.NonImmersive;
        if (state !== VisibilityState.NonImmersive && this.fadeT < 0) {
          this.fadeT = 0;
          // Legacy requested 72 Hz on session start.
          const session = this.world.session as
            (XRSession & { updateTargetFrameRate?: (rate: number) => Promise<void> }) | undefined;
          void session?.updateTargetFrameRate?.(72)?.catch(() => {});
        }
        if (state === VisibilityState.NonImmersive) this.fadeT = -1;
      }),
    );
    void spawnPanel(this.world, 'controllers', { scale: 0.13, interactive: false }).then((panel) => {
      this.controllers = panel;
      this.follower = new GazeFollower(panel.root, 1.5, -0.1);
      panel.show(false);
    });
    void spawnPanel(this.world, 'tool-chip', {
      scale: 0.08,
      interactive: false,
      animate: false,
      attachTo: this.world.player.gripSpaces.right,
    }).then((panel) => {
      this.chip = panel;
      panel.root.position.set(0, 0.09, -0.02);
      panel.show(false);
    });
    this.cleanupFuncs.push(
      activeTool.subscribe((tool) => {
        const info = TOOL_INFO[tool];
        this.showChip(info.label, toolHint(tool), info.color, 'right');
      }),
      blink.subscribe(() => {
        // Teleport comfort blink: start dark, fade back in quickly.
        if (!settings.peek().blinkFade) return;
        if (this.fadeT < 0 || this.fadeT >= 2) this.blinkT = 0;
      }),
      toast.subscribe((value) => {
        if (value)
          this.showChip(
            value.count > 1 ? `${value.label}  ×${value.count}` : value.label,
            value.sub,
            value.color,
            value.hand,
          );
      }),
    );
  }

  private showChip(label: string, sub: string, color: string, hand: 'left' | 'right'): void {
    if (!this.chip) return;
    // The chip appears over the hand that caused it.
    const grip = this.world.player.gripSpaces[hand];
    if (this.chip.root.parent !== grip) grip.add(this.chip.root);
    this.chip.text('chip-label', label);
    this.chip.text('chip-sub', sub);
    this.chip.style('chip-dot', { backgroundColor: color });
    this.chip.style('chip-root', { borderColor: color });
    this.chipTimer = CHIP_SECONDS;
  }

  override update(delta: number): void {
    if (this.blinkT >= 0) {
      // The move has already happened: start dark and fade back in.
      this.blinkT += delta;
      const opacity = Math.max(0, 1 - this.blinkT / BLINK_TIME) ** 1.5;
      this.fade.visible = opacity > 0.001;
      (this.fade.material as MeshBasicMaterial).opacity = opacity;
      if (this.blinkT >= BLINK_TIME) this.blinkT = -1;
    }
    if (this.fadeT >= 0 && this.fadeT < 2) {
      // Fully black for 1 s while the world settles, then fade over 1 s.
      this.fadeT += delta;
      this.fade.visible = this.fadeT < 2;
      (this.fade.material as MeshBasicMaterial).opacity = Math.min(1, 2 - this.fadeT);
    }
    const inXR = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    const pads = this.world.input.xr.gamepads;
    const missing = inXR && (!pads.left || !pads.right);
    // A short grace period hides the card during controller hand-offs.
    this.missingFor = missing ? this.missingFor + delta : 0;
    const showControllers = this.missingFor > 1.5;
    if (this.controllers && this.follower) {
      if (showControllers && !this.controllers.shown) this.follower.reset();
      this.controllers.show(showControllers);
      if (showControllers) this.follower.update(this.world, delta);
    }

    if (this.chip) {
      this.chipTimer = Math.max(0, this.chipTimer - delta);
      const target = this.chipTimer > 0 && inXR ? 1 : 0;
      this.chipScale += (target - this.chipScale) * Math.min(1, delta * 12);
      const visible = this.chipScale > 0.02;
      this.chip.show(visible);
      if (visible) {
        this.chip.root.scale.setScalar(0.08 * this.chipScale);
        // Face the eyes regardless of how the controller is held.
        this.chip.root.lookAt(this.world.player.head.getWorldPosition(tmp));
      }
    }
  }
}

const tmp = new Vector3();
