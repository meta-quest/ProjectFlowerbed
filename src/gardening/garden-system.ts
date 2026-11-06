/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Garden persistence and management (legacy LocalSaveDataSystem +
 * GardenManagementSystem, extended to multiple named gardens).
 *
 * The active garden loads once the island is ready. Changes mark the garden
 * dirty; it saves at most every 5 s (legacy UPDATE_MIN_INTERVAL), and flushes
 * immediately when the page hides or the XR session ends.
 */

import { LocomotionSystem, Vector3, createSystem, signal } from '@iwsdk/core';
import { Plant } from '../components/garden.js';
import { InputComponent } from '@iwsdk/core';
import { gamepad, selectHeld } from '../core/input.js';
import { Tool, activeTool, gardenDirty, markGardenDirty, plantCount, showToast } from '../core/state.js';
import {
  createGarden,
  deleteGarden as deleteStoredGarden,
  listGardens,
  loadGarden,
  resolveStartupGarden,
  saveGarden,
  setActiveGardenId,
  type GardenMeta,
} from '../core/storage.js';
import { islandReady } from '../world/island-state.js';
import { THIRST_SECONDS, serializePlants, spawnPlant } from './plant-system.js';
import { seedProgressFromGardens } from './progress.js';
import { displays } from '../camera/photo-display-system.js';
import { PLANT_INDEX } from '../data/plants.js';

const SAVE_INTERVAL = 5;
/**
 * Saving stalls the Quest main thread (~10 ms with a full garden), so it
 * waits while a trigger or pinch is held (pouring, aiming), up to this long.
 */
const SAVE_DEFER_MAX = 30;

/** Active garden metadata, observed by the landing page and settings. */
export const activeGarden = signal<GardenMeta | null>(null);
export const gardens = signal<GardenMeta[]>([]);
/** Time of the last successful save (ms since epoch), for UI feedback. */
export const lastSaved = signal(0);

export interface GardenCommands {
  create(): void;
  open(id: string): void;
  remove(id: string): void;
  saveNow(): void;
}

/** Filled in by GardenSystem; UI calls these. */
export const gardenCommands: GardenCommands = {
  create: () => {},
  open: () => {},
  remove: () => {},
  saveNow: () => {},
};

export class GardenSystem extends createSystem({
  plants: { required: [Plant] },
}) {
  private loaded = false;
  private dirtySince = -1;
  private lastSave = 0;
  private elapsed = 0;
  private spawn = new Vector3();
  private spawnYaw = 0;

  override init(): void {
    gardens.value = listGardens();
    gardenCommands.create = () => this.switchTo(createGarden());
    gardenCommands.open = (id) => {
      const meta = listGardens().find((garden) => garden.id === id);
      if (meta) this.switchTo(meta);
    };
    gardenCommands.remove = (id) => {
      const wasActive = activeGarden.peek()?.id === id;
      // Pending edits to a garden being deleted must not write it back.
      if (wasActive) this.dirtySince = -1;
      deleteStoredGarden(id);
      gardens.value = listGardens();
      if (wasActive) this.switchTo(listGardens()[0] ?? createGarden());
    };
    gardenCommands.saveNow = () => void this.save();

    const flush = () => {
      if (this.dirtySince >= 0) this.save();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanupFuncs.push(
      () => window.removeEventListener('pagehide', flush),
      () => document.removeEventListener('visibilitychange', onVisibility),
      displays.subscribe(() => {
        if (this.loaded) markGardenDirty();
      }),
      gardenDirty.subscribe(() => {
        if (this.loaded && this.dirtySince < 0) this.dirtySince = this.elapsed;
      }),
      this.world.visibilityState.subscribe(() => flush()),
    );
  }

  override update(delta: number): void {
    this.elapsed += delta;
    if (!this.loaded) {
      if (!islandReady.peek()) return;
      this.spawn.copy(this.world.player.position);
      this.spawnYaw = this.world.player.rotation.y;
      this.loaded = true;
      this.restore(resolveStartupGarden());
      seedProgressFromGardens(
        listGardens().map((garden) => {
          const record = loadGarden(garden.id);
          return { plants: record?.plants ?? [], displays: record?.displays ?? [] };
        }),
      );
      return;
    }
    const busy = selectHeld(this.world, 'right') || selectHeld(this.world, 'left');
    const due = this.elapsed - this.lastSave;
    if (this.dirtySince >= 0 && due >= SAVE_INTERVAL && (!busy || due >= SAVE_DEFER_MAX)) {
      this.save();
    }
    // Legacy SaveControllerSystem: left thumbstick click saves right away.
    if (gamepad(this.world, 'left')?.getButtonDown(InputComponent.Thumbstick)) {
      const count = plantCount.peek();
      if (this.save()) {
        showToast(
          'Garden saved',
          `${activeGarden.peek()?.name ?? 'Garden'} - ${count} plant${count === 1 ? '' : 's'}`,
          '#86dc3d',
          'left',
        );
      } else {
        showToast('Could not save', 'Browser storage is full or blocked', '#e2725b', 'left');
      }
    }
  }

  private restore(meta: GardenMeta): void {
    activeGarden.value = meta;
    setActiveGardenId(meta.id);
    const record = loadGarden(meta.id);
    const position = new Vector3();
    // Plants got thirsty while you were away (capped at fully wilted).
    const awaySeconds = Math.max(0, (Date.now() - meta.updated) / 1000);
    for (const plant of Array.isArray(record?.plants) ? record.plants : []) {
      // Skip a malformed entry instead of losing the rest of the garden.
      try {
        if (!PLANT_INDEX.has(plant.type)) throw new Error(`unknown plant type ${plant.type}`);
        position.fromArray(plant.position);
        const thirst = Math.min(1, (plant.thirst ?? 0) + awaySeconds / THIRST_SECONDS);
        spawnPlant(this.world, plant.type, position, { ...plant, thirst });
      } catch (error) {
        console.warn('[flowerbed] skipped an unreadable saved plant', plant, error);
      }
    }
    displays.value = Array.isArray(record?.displays) ? record.displays : [];
    gardens.value = listGardens();
    this.dirtySince = -1;
  }

  /** Returns false when storage refused the write; the garden then stays dirty and retries. */
  private save(): boolean {
    const meta = activeGarden.peek();
    if (!meta) return false;
    const plants = serializePlants(this.world, this.queries.plants.entities);
    this.lastSave = this.elapsed;
    if (!saveGarden(meta.id, plants, displays.peek())) return false;
    this.dirtySince = -1;
    lastSaved.value = Date.now();
    // Only republish the list (it rebuilds the Gardens tab) when it changed.
    const current = gardens.peek().find((garden) => garden.id === meta.id);
    if (current?.plants !== plants.length) {
      gardens.value = listGardens();
      activeGarden.value = gardens.peek().find((garden) => garden.id === meta.id) ?? meta;
    }
    return true;
  }

  private switchTo(meta: GardenMeta): void {
    if (this.dirtySince >= 0) this.save();
    for (const entity of [...this.queries.plants.entities]) entity.dispose();
    plantCount.value = 0;
    // A fresh garden starts back at the island entrance (legacy resetGarden).
    const locomotion = this.world.getSystem(LocomotionSystem);
    locomotion?.setPlayerPosition(this.spawn);
    this.world.player.rotation.y = this.spawnYaw;
    activeTool.value = Tool.Explore;
    this.restore(meta);
  }
}
