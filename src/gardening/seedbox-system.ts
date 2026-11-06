/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * The wrist seedbox (legacy SeedboxSystem + SeedboxFocusDetectionSystem).
 *
 * The modeled box rides the left grip while the Seeds tool is live (a
 * tracked left hand grips it in the posed glove). Nine packets per page sit
 * in its slots; the right hand picks one by reaching into the box (within
 * 7 cm of a slot) or by pointing at it, then pulling the trigger or pinching.
 * X pages forward, Y pages back (new: legacy only paged forward); a tracked
 * left hand swipes its thumb right or left instead. Selection only works
 * while the box faces the player (legacy focus test).
 */

import {
  AssetManager,
  Color,
  InputComponent,
  Mesh,
  Object3D,
  Quaternion,
  Intersection,
  Raycaster,
  Vector3,
  createSystem,
  type Material,
  type MeshStandardMaterial,
} from '@iwsdk/core';
import { audio } from '../core/audio.js';
import { RAY_STYLES, RayTube } from '../core/arc.js';
import { gamepad, haptic, rayBusy, rayPose, selectDown } from '../core/input.js';
import { Tool, byInput, handMode, isToolLive, seedPagingHint, selectedPlant, seedboxPage } from '../core/state.js';
import { handTracked, pinchPoint, toolMount } from '../core/hands.js';
import { PAGE_COUNT, PLANTS, SLOTS_PER_PAGE } from '../data/plants.js';
import { spawnPanel, type SpawnedPanel } from '../ui/panels.js';
import { makeFullRough } from '../world/materials.js';
import { finishOn, onFinishChange, isPageUnlocked, lockFor, stats } from './progress.js';
import { toolEnvMap } from '../world/island-state.js';
import { uiDeny } from '../core/ui-sounds.js';

const SEEDBOX_OFFSET = {
  position: new Vector3(0.14277, -0.04692, 0.00541),
  quaternion: new Quaternion(-0.06727, -0.08392, -0.15163, 0.98257),
};
const SELECTION_RADIUS = 0.07;
const ZONE = { x: 0.14, yFront: 0.1, yBack: -0.06, z: 0.14 };
const SEEDBOX_TO_HEAD = Math.PI / 4;
const HEAD_TO_SEEDBOX = Math.PI / 3;

/** Seedbox focus, read by the planting system to yield the trigger. */
export const seedboxFocus = { inFocus: false, inZone: false, pointed: false };
/** The modeled box, exposed for hints (button glow). */
export let seedboxObject: Object3D | null = null;

/** Quest hand-gamepad buttons for left/right thumb swipes. */
const MICRO_SWIPE_LEFT = 5;
const MICRO_SWIPE_RIGHT = 6;

export class SeedboxSystem extends createSystem({}) {
  private box: Object3D | null = null;
  private slots: Object3D[] = [];
  private packets: Object3D[] = [];
  private lift: number[] = [];
  private hovered = -1;
  private badgePulse = false;
  private packetMaterials: { material: MeshStandardMaterial; color: Color }[][] = [];
  private wasLive = false;
  private label: SpawnedPanel | null = null;
  private labelAnchor = new Object3D();
  /**
   * Packets are picked with a plain ray rather than RayInteractable: picking
   * runs only while the box is open and the hand is outside the touch zone,
   * and it must draw its own short seedbox ray to the hovered packet.
   */
  private ray = new Raycaster();
  private hits: Intersection[] = [];
  private tube = new RayTube(1, RAY_STYLES.seedbox);
  private tubePoints = [new Vector3(), new Vector3()];
  private v = new Vector3();
  private v2 = new Vector3();
  private origin = new Vector3();
  private dir = new Vector3();
  private headPos = new Vector3();

  override init(): void {
    this.scene.add(this.tube);
    void spawnPanel(this.world, 'seed-label', {
      scale: 0.5,
      interactive: false,
      attachTo: this.labelAnchor,
    }).then((panel) => {
      this.label = panel;
      panel.show(false);
      this.refreshLabel();
    });
    this.cleanupFuncs.push(
      selectedPlant.subscribe(() => {
        this.refreshLabel();
        this.paintPackets();
      }),
      stats.subscribe(() => {
        this.paintPackets();
        this.refreshLabel();
      }),
      seedboxPage.subscribe(() => {
        this.layoutPage();
        this.refreshLabel();
      }),
    );
  }

  private build(): boolean {
    const gltf = AssetManager.getGLTF('seedbox');
    if (!gltf) return false;
    const box = gltf.scene;
    box.name = 'seedbox';
    const boxMaterials: { material: MeshStandardMaterial; color: Color }[] = [];
    box.traverse((node) => {
      const mesh = node as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = false;
        const material = (mesh.material as MeshStandardMaterial).clone();
        makeFullRough(material);
        mesh.material = material;
        boxMaterials.push({ material, color: material.color.clone() });
      }
    });
    // "Caretaker" reward: a golden seedbox.
    const gild = () => {
      const gold = finishOn('caretaker');
      for (const { material, color } of boxMaterials) {
        if (gold) material.color.setRGB(1, 0.82, 0.42);
        else material.color.copy(color);
        material.metalness = gold ? 0.6 : 0;
        material.roughness = gold ? 0.35 : 1;
        material.envMap = gold ? toolEnvMap.peek() : null;
        material.needsUpdate = true;
      }
    };
    gild();
    this.cleanupFuncs.push(onFinishChange(gild));
    // Beside the left hand: the controller grip, or a tracked hand's virtual grip.
    toolMount(this.world, 'left').add(box);
    box.position.copy(SEEDBOX_OFFSET.position);
    box.quaternion.copy(SEEDBOX_OFFSET.quaternion);
    box.visible = false;
    for (let i = 1; i <= SLOTS_PER_PAGE; i++) {
      this.slots.push(box.getObjectByName(`slot_${i}`) ?? box);
    }
    PLANTS.forEach((plant, index) => {
      const packetGltf = AssetManager.getGLTF(`packet-${plant.id}`);
      const packet = packetGltf?.scene ?? new Object3D();
      packet.name = `packet:${plant.id}`;
      packet.scale.setScalar(0.8);
      packet.userData.plantIndex = index;
      packet.traverse((node) => {
        const mesh = node as Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        mesh.userData.plantIndex = index;
        const material = (mesh.material as Material).clone() as MeshStandardMaterial;
        makeFullRough(material);
        mesh.material = material;
        // Upload now: a page's packets otherwise upload their textures the
        // first time it is shown, stalling the headset mid-flip.
        for (const map of [material.map, material.normalMap, material.emissiveMap])
          if (map) this.renderer.initTexture(map);
        (this.packetMaterials[index] ??= []).push({ material, color: material.color.clone() });
      });
      this.slots[index % SLOTS_PER_PAGE].add(packet);
      this.packets.push(packet);
      this.lift.push(0);
    });
    this.box = box;
    seedboxObject = box;
    this.scene.add(this.labelAnchor);
    // Compile every packet's shader variant up front (Quest compiles in the
    // GPU process, so a first-shown page would stall frames, not JS).
    const wasVisible = box.visible;
    box.visible = true;
    for (const packet of this.packets) packet.visible = true;
    this.renderer.compile(box, this.world.camera, this.scene);
    box.visible = wasVisible;
    this.layoutPage();
    return true;
  }

  override update(delta: number): void {
    if (!this.box && !this.build()) return;
    const live = isToolLive(Tool.Seeds);
    if (live !== this.wasLive) {
      this.wasLive = live;
      this.box!.visible = live;
      this.label?.show(live);
      if (live) this.layoutPage();
      else {
        this.tube.visible = false;
        this.setHovered(-1);
      }
    }
    if (!live) {
      seedboxFocus.inFocus = seedboxFocus.inZone = seedboxFocus.pointed = false;
      return;
    }

    const pad = gamepad(this.world, 'left');
    if (handTracked(this.world, 'left')) {
      if (pad?.getButtonDownByIdx(MICRO_SWIPE_RIGHT)) this.flip(1);
      if (pad?.getButtonDownByIdx(MICRO_SWIPE_LEFT)) this.flip(-1);
    } else {
      if (pad?.getButtonDown(InputComponent.X_Button)) this.flip(1);
      if (pad?.getButtonDown(InputComponent.Y_Button)) this.flip(-1);
    }
    this.syncKeyHints();

    this.detectFocus();
    this.faceLabel();
    this.tube.visible = false;
    let hovered = -1;
    if (seedboxFocus.inFocus) {
      if (seedboxFocus.inZone) hovered = this.directHover();
      else if (seedboxFocus.pointed) hovered = this.rayHover();
    }
    this.setHovered(hovered);

    if (hovered >= 0 && selectDown(this.world, 'right')) {
      if (!isPageUnlocked(Math.floor(hovered / SLOTS_PER_PAGE))) {
        uiDeny();
        haptic(this.world, 'right', 0.2, 40);
      } else {
        audio.play('CHOOSING_SEED', this.box!.getWorldPosition(this.v));
        haptic(this.world, 'right', 0.5, 100);
        selectedPlant.value = hovered;
      }
    }

    // Pulse the X / Y badges while the paging hint is active.
    if (this.label) {
      const on = seedPagingHint.peek();
      if (on || this.badgePulse) {
        this.badgePulse = on;
        const k = on ? 0.5 + 0.5 * Math.sin(performance.now() / 160) : 0;
        const color = k > 0.5 ? '#86dc3d' : '#2a3c33';
        this.label.style('key-x', { backgroundColor: color });
        this.label.style('key-y', { backgroundColor: color });
      }
    }

    // Ease packet lifts (legacy snapped to 2 cm; easing reads better).
    const page = seedboxPage.peek();
    for (let i = page * SLOTS_PER_PAGE; i < Math.min(PLANTS.length, (page + 1) * SLOTS_PER_PAGE); i++) {
      const target = i === hovered ? 0.02 : i === selectedPlant.peek() ? 0.008 : 0;
      this.lift[i] += (target - this.lift[i]) * Math.min(1, delta * 18);
      this.packets[i].position.y = this.lift[i];
    }
  }

  private flip(direction: number): void {
    seedboxPage.value = (seedboxPage.peek() + direction + PAGE_COUNT) % PAGE_COUNT;
    audio.play(direction > 0 ? 'SEEDBOX_PAGINATE_NEXT' : 'SEEDBOX_PAGINATE_PREV', this.box!.getWorldPosition(this.v));
    haptic(this.world, 'left', 0.2, 20);
  }

  private layoutPage(): void {
    const page = seedboxPage.peek();
    this.packets.forEach((packet, index) => {
      const onPage = Math.floor(index / SLOTS_PER_PAGE) === page;
      packet.visible = onPage;
      packet.position.set(0, 0, onPage ? 0 : -0.05);
    });
    this.paintPackets();
  }

  /** Locked pages read as shadowed packets; the chosen seed glows softly. */
  private paintPackets(): void {
    const selected = selectedPlant.peek();
    this.packetMaterials.forEach((materials, index) => {
      const locked = !isPageUnlocked(Math.floor(index / SLOTS_PER_PAGE));
      for (const { material, color } of materials) {
        material.color.copy(color).multiplyScalar(locked ? 0.28 : 1);
        material.emissive.setHex(index === selected && !locked ? 0x86dc3d : 0x000000);
        material.emissiveIntensity = index === selected ? 0.28 : 0;
      }
    });
  }

  private detectFocus(): void {
    const box = this.box!;
    const head = this.world.player.head;
    head.getWorldPosition(this.headPos);
    box.getWorldPosition(this.v);
    // Seedbox position in head space vs. head forward.
    head.worldToLocal(this.v2.copy(this.v));
    const boxToHead = this.v2.angleTo(FORWARD);
    // Head position in seedbox space vs. seedbox up.
    box.worldToLocal(this.v2.copy(this.headPos));
    const headToBox = this.v2.angleTo(UP);
    seedboxFocus.inFocus = headToBox <= HEAD_TO_SEEDBOX && boxToHead <= SEEDBOX_TO_HEAD;

    // Right palm inside the box volume.
    this.world.player.gripSpaces.right.getWorldPosition(this.v);
    box.worldToLocal(this.v);
    seedboxFocus.inZone =
      Math.abs(this.v.x) <= ZONE.x && Math.abs(this.v.z) <= ZONE.z && this.v.y >= ZONE.yBack && this.v.y <= ZONE.yFront;

    seedboxFocus.pointed = false;
    if (!seedboxFocus.inZone && !rayBusy(this.world)) {
      rayPose(this.world, 'right', this.origin, this.dir);
      this.ray.set(this.origin, this.dir);
      this.ray.far = 5;
      this.hits.length = 0;
      for (const hit of this.ray.intersectObject(box, true, this.hits)) {
        if (hit.object.visible) seedboxFocus.pointed = true;
      }
    }
  }

  /** The label's paging hint: X / Y keys on controllers, thumb swipes on hands. */
  private syncKeyHints(): void {
    const hands = handMode.peek();
    if (!this.label || hands === this.keysShowHands) return;
    this.keysShowHands = hands;
    this.label.text('key-y-text', hands ? '‹' : 'Y');
    this.label.text('key-x-text', hands ? '›' : 'X');
    this.label.text('key-y-label', hands ? 'swipe' : 'back');
    this.label.text('key-x-label', hands ? 'swipe' : 'next');
  }

  private keysShowHands: boolean | null = null;

  private directHover(): number {
    // A tracked hand picks where it pinches; a controller between grip and ray.
    if (!pinchPoint(this.world, 'right', this.v)) {
      this.world.player.gripSpaces.right.getWorldPosition(this.v);
      this.world.player.raySpaces.right.getWorldPosition(this.v2);
      this.v.lerp(this.v2, 0.5);
    }
    let best = -1;
    let bestDistance = SELECTION_RADIUS;
    const page = seedboxPage.peek();
    this.slots.forEach((slot, i) => {
      const index = page * SLOTS_PER_PAGE + i;
      if (index >= PLANTS.length) return;
      const d = slot.getWorldPosition(this.v2).distanceTo(this.v);
      if (d < bestDistance) {
        bestDistance = d;
        best = index;
      }
    });
    return best;
  }

  private rayHover(): number {
    this.hits.length = 0;
    for (const hit of this.ray.intersectObjects(this.packets, true, this.hits)) {
      const index = hit.object.userData.plantIndex as number | undefined;
      if (index != null && this.packets[index].visible) {
        this.tubePoints[0].copy(this.origin);
        this.tubePoints[1].copy(hit.point);
        this.tube.update(this.tubePoints, 2);
        return index;
      }
    }
    return -1;
  }

  private setHovered(index: number): void {
    if (index === this.hovered) return;
    this.hovered = index;
    if (index >= 0) haptic(this.world, 'right', 0.05, 10);
    this.refreshLabel();
  }

  private faceLabel(): void {
    // Float upright above the box, turned toward the eyes.
    this.box!.getWorldPosition(this.v);
    this.labelAnchor.position.copy(this.v);
    this.labelAnchor.position.y += 0.19;
    const yaw = Math.atan2(this.headPos.x - this.v.x, this.headPos.z - this.v.z);
    this.labelAnchor.quaternion.setFromAxisAngle(UP, yaw);
  }

  private refreshLabel(): void {
    if (!this.label) return;
    const index = this.hovered >= 0 ? this.hovered : selectedPlant.peek();
    const plant = PLANTS[index];
    const isSelected = index === selectedPlant.peek();
    this.label.text('seed-name', plant.label);
    this.label.text('seed-state', isSelected ? 'SELECTED' : byInput('TRIGGER TO PICK', 'PINCH TO PICK'));
    this.label.style('seed-state', { color: isSelected ? '#86dc3d' : '#f6c443' });
    this.label.style('seed-swatch', { backgroundColor: plant.accent });
    const page = seedboxPage.peek();
    const lock = lockFor(page);
    if (lock && (this.hovered < 0 || Math.floor(this.hovered / SLOTS_PER_PAGE) === page)) {
      // A locked page explains how to earn it.
      this.label.text('seed-name', `${lock.milestone.task}`);
      this.label.text('seed-state', `${lock.have} / ${lock.milestone.goal}`);
      this.label.style('seed-state', { color: '#f6c443' });
      this.label.style('seed-swatch', { backgroundColor: '#5a6b62' });
    }
    this.label.text('seed-page', `${page + 1} / ${PAGE_COUNT}${lock ? ' locked' : ''}`);
    for (let i = 0; i < PAGE_COUNT; i++) {
      this.label.style(`page-dot-${i}`, {
        backgroundColor: i === page ? '#f6f3ea' : '#3c5246',
      });
    }
  }
}

const FORWARD = new Vector3(0, 0, -1);
const UP = new Vector3(0, 1, 0);
