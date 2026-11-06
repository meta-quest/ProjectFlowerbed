/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Remove tool (legacy PlantPickingSystem): a straight 5 m ray from the right
 * hand highlights the plant it touches. Hold the trigger for 0.4 s while a
 * ring fills around the plant's base to remove it, so a stray click never
 * deletes anything. Plants that are still growing cannot be removed.
 */

import {
  DoubleSide,
  InputComponent,
  Mesh,
  RingGeometry,
  ShaderMaterial,
  Vector3,
  createSystem,
  type Entity,
} from '@iwsdk/core';
import { uiDeny } from '../core/ui-sounds.js';
import { plantMeshes } from './plant-meshes.js';
import { Plant, PlantStage } from '../components/garden.js';
import { RAY_STYLES, RayTube, castStraight, createArcResult } from '../core/arc.js';
import { audio } from '../core/audio.js';
import { Layer } from '../core/colliders.js';
import { haptic, rayBusy, rayPose, selectDown, selectHeld } from '../core/input.js';
import { byInput, isToolLive, markGardenDirty, Tool } from '../core/state.js';
import { activeGarden } from './garden-system.js';
import { PlantSystem, removePlant, serializePlants, spawnPlant } from './plant-system.js';
import { spawnPanel, type SpawnedPanel } from '../ui/panels.js';
import type { SavedPlant } from '../core/storage.js';
import { PLANTS, PLANT_INDEX } from '../data/plants.js';
import { BURST_STYLES, bursts } from '../core/bursts.js';
import { uiPerk } from '../core/ui-sounds.js';

const RANGE = 5;
const HOLD = 0.4;
const UNDO_SECONDS = 8;
const UNDO_DEPTH = 5;

export class RemoveSystem extends createSystem({}) {
  private arc = createArcResult();
  private tube = new RayTube(1, RAY_STYLES.remove);
  private origin = new Vector3();
  private dir = new Vector3();
  private hovered: Entity | null = null;
  private hold = 0;
  private progress = { value: 0 };
  private ring = new Mesh(
    new RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2),
    new ShaderMaterial({
      uniforms: { uProgress: this.progress },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vPos;
        void main() {
          vPos = position.xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uProgress;
        varying vec2 vPos;
        void main() {
          float a = fract(atan(vPos.x, -vPos.y) / 6.2831853 + 1.0);
          float on = step(a, uProgress);
          gl_FragColor = vec4(mix(vec3(0.35, 0.2, 0.18), vec3(1.0, 0.45, 0.3), on), 0.35 + 0.55 * on);
          #include <colorspace_fragment>
        }`,
    }),
  );

  /** Show the Undo pill above the right hand; recent removals stack up. */
  private offerUndo(snapshot: SavedPlant): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
    this.undoTimer = UNDO_SECONDS;
    this.labelUndo();
    this.undo?.show(true);
  }

  private labelUndo(): void {
    const count = this.undoStack.length;
    const last = this.undoStack[count - 1];
    const plant = last ? PLANTS[PLANT_INDEX.get(last.type) ?? 0] : null;
    this.undo?.text('undo-title', count > 1 ? `${count} plants removed` : `${plant?.label ?? 'Plant'} removed`);
    const key = byInput('press B', 'tap Undo');
    this.undo?.text(
      'undo-sub',
      count > 1
        ? `Undo brings back the last one - ${key}`
        : `Changed your mind? ${key[0].toUpperCase()}${key.slice(1)}`,
    );
  }

  /** Bring back the most recently removed plant. */
  private restore(): void {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return;
    if (this.undoStack.length === 0) {
      this.undoTimer = 0;
      this.undo?.show(false);
    } else {
      this.undoTimer = UNDO_SECONDS;
      this.labelUndo();
    }
    const position = new Vector3().fromArray(snapshot.position);
    spawnPlant(this.world, snapshot.type, position, snapshot);
    markGardenDirty();
    bursts.emit(position, BURST_STYLES.bloom);
    audio.play('PLANTING_SEED', position, 0.7);
    haptic(this.world, 'right', 0.35, 40);
    uiPerk();
  }

  private undo: SpawnedPanel | null = null;
  private undoStack: SavedPlant[] = [];
  private undoTimer = 0;
  private undoFill = -1;
  private needsRelease = false;

  override init(): void {
    void spawnPanel(this.world, 'undo', { scale: 0.09 }).then((panel) => {
      this.undo = panel;
      panel.show(false);
      this.cleanupFuncs.push(panel.on('undo-button', 'click', () => this.restore()));
    });
    // Removed plants belong to the garden they came from; never undo them into another.
    this.cleanupFuncs.push(
      activeGarden.subscribe(() => {
        this.undoStack.length = 0;
        this.undoTimer = 0;
        this.undo?.show(false);
      }),
    );
    this.ring.visible = false;
    this.ring.renderOrder = 990;
    this.scene.add(this.tube, this.ring);
  }

  override update(delta: number): void {
    this.tickUndo(delta);
    if (!isToolLive(Tool.Remove) || rayBusy(this.world)) {
      this.tube.visible = false;
      this.ring.visible = false;
      this.hold = 0;
      this.setHovered(null);
      return;
    }
    rayPose(this.world, 'right', this.origin, this.dir);
    castStraight(this.origin, this.dir, RANGE, Layer.Plant, this.arc);
    this.tube.update(this.arc.points, this.arc.count, 1);
    const owner = this.arc.hit ? (this.arc.hitInfo.owner as Entity | null) : null;
    const target =
      owner?.hasComponent?.(Plant) && owner.getValue(Plant, 'stage') !== PlantStage.Shrinking ? owner : null;
    this.setHovered(target);
    this.tube.setColor(target ? 0xff6a4d : 0xd9533b);

    const pressing = selectHeld(this.world, 'right');
    // One removal per press: let go before the next plant can be removed.
    if (!pressing) this.needsRelease = false;
    if (!target || !pressing || this.needsRelease) {
      this.hold = 0;
      this.ring.visible = false;
      return;
    }
    if (target.getValue(Plant, 'stage') !== PlantStage.Grown) {
      // Still growing: a short "not yet" cue once per press.
      if (selectDown(this.world, 'right')) {
        uiDeny();
        haptic(this.world, 'right', 0.15, 30);
      }
      return;
    }
    this.hold += delta;
    this.progress.value = Math.min(1, this.hold / HOLD);
    const object = target.object3D!;
    const radius = Math.max(
      0.18,
      plantMeshes.footprint(target.getValue(Plant, 'plantId') ?? '') *
        (target.getVectorView(Plant, 'baseScale')[0] || 1) *
        (target.getValue(Plant, 'growth') ?? 1),
    );
    this.ring.position.copy(object.position);
    this.ring.position.y += 0.03;
    this.ring.scale.setScalar(radius);
    this.ring.visible = true;
    haptic(this.world, 'right', 0.05 + 0.3 * this.progress.value, 20);
    if (this.hold >= HOLD) {
      const position = object.position.clone();
      this.setHovered(null);
      this.hold = 0;
      this.needsRelease = true;
      this.ring.visible = false;
      const snapshot = serializePlants(this.world, [target])[0];
      if (removePlant(target)) {
        audio.play('REMOVING_SEED', position);
        haptic(this.world, 'right', 0.6, 60);
        if (snapshot) this.offerUndo(snapshot);
      }
    }
  }

  private tickUndo(delta: number): void {
    if (!this.undo || this.undoTimer <= 0) return;
    // B on the right controller is the quick way to undo.
    if (this.world.input.xr.gamepads.right?.getButtonDown(InputComponent.B_Button)) {
      this.restore();
      return;
    }
    this.undoTimer -= delta;
    // Restyling relayouts the panel, so step the countdown bar in 4 px increments.
    const fill = Math.max(0, Math.round((this.undoTimer / UNDO_SECONDS) * 65)) * 4;
    if (fill !== this.undoFill) {
      this.undoFill = fill;
      this.undo.style('undo-fill', { width: fill });
    }
    // Float above the right hand, facing the eyes.
    const root = this.undo.root;
    this.world.player.gripSpaces.right.getWorldPosition(root.position);
    root.position.y += 0.16;
    root.lookAt(this.world.player.head.getWorldPosition(this.headPos));
    if (this.undoTimer <= 0) {
      this.undoStack.length = 0;
      this.undo.show(false);
    }
  }

  private headPos = new Vector3();

  private setHovered(entity: Entity | null): void {
    if (entity === this.hovered) return;
    const plants = this.world.getSystem(PlantSystem);
    if (this.hovered?.hasComponent(Plant)) {
      this.hovered.setValue(Plant, 'highlighted', false);
      plants?.writeInstance(this.hovered, false);
    }
    this.hovered = entity;
    if (entity) {
      entity.setValue(Plant, 'highlighted', true);
      plants?.writeInstance(entity, false);
      haptic(this.world, 'right', 0.05, 10);
    }
  }
}
