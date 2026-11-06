/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Flowerbed's layer over IWSDK's built-in locomotion. IWSDK's TeleportSystem
 * and TurnSystem do the aiming, hit testing and moving (the locomotor runs in
 * a worker); this system only adds:
 *
 * - Hand tracking: thumb microgestures. Swipe the right thumb forward along
 *   the index finger to show the teleport arc, tap to jump, swipe back to
 *   cancel; swipe left or right to snap turn (TurnSystem's own flow).
 *   TurnSystem's two arrows show while the free right hand is held in the
 *   microgesture posture (palm on edge, fingers curled), as a hint.
 * - The legacy snap-turn and teleport sounds, the comfort blink, and the
 *   tutorial's teleport count.
 * - Holding teleport while the tool dial is open (a stick flick there picks a
 *   tile, never a jump) until the stick re-centres.
 * - Fall recovery: below FALL_LIMIT the player goes back to the last ground.
 * - The right stick pushed forward also aims (IWSDK binds pulling it back),
 *   so either direction works, as in the 2022 game.
 */

import {
  AxesState,
  InputActions,
  InputComponent,
  TeleportSystem,
  TurnSystem,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { audio } from '../core/audio.js';
import { gamepad, rayBusy } from '../core/input.js';
import { handTracked, jointPosition, palmPose } from '../core/hands.js';
import { Tool, blink, isToolLive, openPanel, teleporting, toolDialOpen } from '../core/state.js';
import { teleportCount } from './island-state.js';
import { holdTeleport, holdTurning, syncLocomotionHolds, teleportHeld } from '../core/locomotion-holds.js';
import { appTeleportAt, locomotionInternals, warnLocomotionMissing } from '../core/locomotion-bridge.js';

/** Quest hand-gamepad buttons for thumb microgestures. */
const MICRO = { swipeLeft: 5, swipeRight: 6, swipeForward: 7, swipeBackward: 8, tap: 9 } as const;
/** Microgesture posture: palm-normal height (on edge) and curled fingertip reach, with hysteresis. */
const POSTURE_EDGE = { show: 0.5, hide: 0.65 };
const POSTURE_CURL = { show: 0.065, hide: 0.08 };
const CURLED_TIPS = ['middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'] as const;
/** A move longer than this in one frame is a teleport, not a glide (metres). */
const JUMP_MIN_SQ = 0.5 * 0.5;
const LONG_TELEPORT_SQ = 25;
/**
 * Below this height the player has left the island (a tracking jump or a
 * walk off a ledge pulled the capsule into the void); put them back on the
 * last ground they stood on.
 */
const FALL_LIMIT = -15;

export class FlowerbedTeleportSystem extends createSystem({}) {
  private elapsed = 0;
  private attached = false;
  /** Hands: the arc is armed by a forward swipe until a tap, a back swipe or the hand leaving. */
  private armed = false;
  private disarmNext = false;
  private wasAiming = false;
  private needsRecenter = false;
  private lastPosition = new Vector3();
  private lastGround = new Vector3();
  private head = new Vector3();
  private palmCenter = new Vector3();
  private palmNormal = new Vector3();
  private tip = new Vector3();
  private postured = false;

  override init(): void {
    this.world.input.actions.addBinding({
      source: 'xrGamepadAxesDirection',
      kind: 'button',
      action: InputActions.LocomotionTeleportAim,
      handedness: 'right',
      componentId: InputComponent.Thumbstick,
      state: AxesState.Up,
    });
  }

  override update(delta: number): void {
    this.elapsed += delta;
    syncLocomotionHolds(this.world);
    const teleport = this.world.getSystem(TeleportSystem);
    const locomotor = locomotionInternals(this.world)?.locomotor;
    if (!teleport || !locomotor) {
      // LocomotionSystem boots over a few frames; much longer means its internals moved.
      if (this.elapsed > 10) warnLocomotionMissing();
      return;
    }
    if (!this.attached) {
      this.attached = true;
      this.lastPosition.copy(this.player.position);
      this.lastGround.copy(this.player.position);
    }

    this.recoverFall(locomotor);
    this.holdForDial();
    this.syncMicrogestures(teleport);

    const aiming = !teleportHeld() && !rayBusy(this.world) && (this.armed || this.stickAiming());
    if (aiming && !this.wasAiming) {
      this.world.player.raySpaces.right.getWorldPosition(this.head);
      audio.play('TELEPORT_EXTEND_LINE', this.head);
    }
    // Hold snap turning while aiming, until the stick re-centres.
    holdTurning(this.world, 'teleport', aiming || (this.wasAiming && this.stickMagnitude() > 0.3));
    if (aiming !== this.wasAiming) teleporting.value = aiming;
    this.wasAiming = aiming;

    this.detectJump();
    this.turnSounds();
  }

  /**
   * Right-hand microgestures. IWSDK's microgesture teleport keeps its arc up
   * for as long as the mode is on and jumps on a thumb tap, so the mode is
   * switched on by a forward swipe and off again the frame after the tap
   * (TeleportSystem runs after this system and commits on the tap frame).
   */
  private syncMicrogestures(teleport: TeleportSystem): void {
    const hand = handTracked(this.world, 'right');
    const turn = this.world.getSystem(TurnSystem);
    if (turn && turn.config.microGestureControlsEnabled.peek() !== hand) {
      turn.config.microGestureControlsEnabled.value = hand;
    }
    // TurnSystem (which runs first) shows its arrows whenever microgestures
    // are on; narrow that to a free right hand held ready to swipe.
    const signals = (turn as unknown as { turnSignals?: { visible: boolean } } | undefined)?.turnSignals;
    if (signals) signals.visible = hand && !this.armed && !this.holdingProp() && this.microgesturePosture();

    const pad = gamepad(this.world, 'right');
    if (this.disarmNext) {
      this.disarmNext = false;
      this.armed = false;
    }
    const blocked = !hand || toolDialOpen.peek() || openPanel.peek() !== 'none' || teleportHeld();
    if (blocked) this.armed = false;
    else if (!this.armed && pad?.getButtonDownByIdx(MICRO.swipeForward)) this.armed = true;
    else if (this.armed && pad?.getButtonDownByIdx(MICRO.swipeBackward)) this.armed = false;
    else if (this.armed && pad?.getButtonDownByIdx(MICRO.tap)) this.disarmNext = true;
    if (teleport.config.microGestureControlsEnabled.peek() !== this.armed) {
      teleport.config.microGestureControlsEnabled.value = this.armed;
    }
  }

  private holdingProp(): boolean {
    return isToolLive(Tool.Water) || isToolLive(Tool.Seeds) || isToolLive(Tool.Camera) || toolDialOpen.peek();
  }

  /** The right hand on its edge with the fingers curled, ready for a thumb swipe. */
  private microgesturePosture(): boolean {
    if (!palmPose(this.world, 'right', this.palmCenter, this.palmNormal)) return (this.postured = false);
    let reach = 0;
    for (const joint of CURLED_TIPS) {
      jointPosition(this.world, 'right', joint, this.tip);
      reach += this.tip.distanceTo(this.palmCenter) / CURLED_TIPS.length;
    }
    const edge = Math.abs(this.palmNormal.y);
    this.postured = this.postured
      ? edge < POSTURE_EDGE.hide && reach < POSTURE_CURL.hide
      : edge < POSTURE_EDGE.show && reach < POSTURE_CURL.show;
    return this.postured;
  }

  /** IWSDK's controller binding: the right stick pushed forward or back aims. */
  private stickAiming(): boolean {
    if (handTracked(this.world, 'right')) return false;
    return this.world.input.actions.getButtonPressed(InputActions.LocomotionTeleportAim);
  }

  /** A stick flick on the open dial picks a tile; it must not also aim a teleport. */
  private holdForDial(): void {
    if (toolDialOpen.peek()) this.needsRecenter = true;
    else if (this.needsRecenter && this.stickMagnitude() < 0.3) this.needsRecenter = false;
    holdTeleport(this.world, 'tool-dial', this.needsRecenter);
  }

  /** IWSDK moved the player in one step: a teleport landed. */
  private detectJump(): void {
    const position = this.player.position;
    const distanceSq = position.distanceToSquared(this.lastPosition);
    // Tours and visits teleport through the bridge and blink themselves.
    const ours = performance.now() - appTeleportAt.value < 200;
    if (distanceSq > JUMP_MIN_SQ && !ours) {
      blink.value = blink.peek() + 1;
      this.world.player.head.getWorldPosition(this.head);
      audio.play(distanceSq > LONG_TELEPORT_SQ ? 'TELEPORT' : 'TELEPORT_SNAP_TURN', this.head);
      teleportCount.value = teleportCount.peek() + 1;
    }
    this.lastPosition.copy(position);
  }

  private recoverFall(locomotor: { isGrounded: boolean; teleport(position: Vector3): void }): void {
    const player = this.player.position;
    if (locomotor.isGrounded && player.y > FALL_LIMIT) this.lastGround.copy(player);
    else if (player.y < FALL_LIMIT) locomotor.teleport(this.lastGround);
  }

  private stickMagnitude(): number {
    const stick = gamepad(this.world, 'right')?.getAxesValues(InputComponent.Thumbstick);
    return stick ? Math.hypot(stick.x, stick.y) : 0;
  }

  /** Legacy snap-turn click, for the stick and for thumb swipes. */
  private turnSounds(): void {
    if (toolDialOpen.peek() || teleporting.peek()) return;
    const pad = gamepad(this.world, 'right');
    if (!pad) return;
    const turned = handTracked(this.world, 'right')
      ? pad.getButtonDownByIdx(MICRO.swipeLeft) || pad.getButtonDownByIdx(MICRO.swipeRight)
      : pad.getAxesEnteringLeft(InputComponent.Thumbstick) || pad.getAxesEnteringRight(InputComponent.Thumbstick);
    if (turned) {
      this.world.player.head.getWorldPosition(this.head);
      audio.play('TELEPORT_SNAP_TURN', this.head);
    }
  }
}
