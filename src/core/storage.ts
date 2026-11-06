/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Local persistence for gardens, settings and one-time hints.
 *
 * Gardens are small (a few hundred plants at most), so plain localStorage is
 * enough: an index of garden metadata plus one record per garden. Writes are
 * synchronous, which lets the page flush on `pagehide`.
 */

const PREFIX = 'flowerbed:v1:';
const INDEX_KEY = `${PREFIX}gardens`;
const ACTIVE_KEY = `${PREFIX}active-garden`;
const SETTINGS_KEY = `${PREFIX}settings`;
const FLAG_KEY = `${PREFIX}flags`;

export interface SavedPlant {
  /** Plant id from PLANTS. */
  type: string;
  position: [number, number, number];
  yaw: number;
  /** Planted (randomized) base scale. */
  scale: [number, number, number];
  /** Watering multiplier; 1 when freshly grown. */
  growth: number;
  /** Final segment values x, y, z, w. */
  segments: [number, number, number, number];
  /** 0 fresh .. 1 wilted (optional for older saves). */
  thirst?: number;
}

export interface GardenMeta {
  id: string;
  name: string;
  created: number;
  updated: number;
  plants: number;
}

export interface GardenRecord {
  id: string;
  plants: SavedPlant[];
  /** Kept photos standing on easels in this garden. */
  displays?: { photoId: string; position: [number, number, number]; yaw: number }[];
}

export interface Settings {
  vignette: boolean;
  music: boolean;
  musicVolume: number;
  effectsVolume: number;
  snapTurnDeg: number;
  turnStyle: 'snap' | 'smooth';
  blinkFade: boolean;
  uiSounds: boolean;
  moveSpeed: number;
  timeOfDay: 'morning' | 'sunset' | 'night' | 'auto';
}

export const DEFAULT_SETTINGS: Settings = {
  vignette: true,
  music: true,
  musicVolume: 1,
  effectsVolume: 1,
  snapTurnDeg: 45,
  turnStyle: 'snap',
  blinkFade: true,
  uiSounds: true,
  moveSpeed: 3,
  timeOfDay: 'sunset',
};

export type HintFlag =
  | 'seenTutorial'
  | 'seenSeedPaging'
  | 'seenShutterHint'
  | 'seenPhotoHint'
  | 'seenWaterTip'
  | 'seenRemoveTip'
  | 'seenCameraTip';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Persist one value; false when storage is full or blocked (private mode, sandboxed embeds). */
function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn('[flowerbed] could not persist', key, error);
    return false;
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Blocked storage has nothing to remove.
  }
}

/** Read a `flowerbed:v1:<name>` record, falling back when it is missing, corrupt or blocked. */
export function readStored<T>(name: string, fallback: T): T {
  return read(`${PREFIX}${name}`, fallback);
}

/** Write a `flowerbed:v1:<name>` record; false when it could not be saved. */
export function writeStored(name: string, value: unknown): boolean {
  return write(`${PREFIX}${name}`, value);
}

const gardenKey = (id: string) => `${PREFIX}garden:${id}`;

function newId(): string {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function listGardens(): GardenMeta[] {
  const gardens = read<unknown>(INDEX_KEY, []);
  return (Array.isArray(gardens) ? (gardens as GardenMeta[]) : []).sort((a, b) => b.updated - a.updated);
}

/** The lowest "Garden N" not already taken, so names stay unique after deletions. */
function defaultName(gardens: GardenMeta[]): string {
  const taken = new Set(gardens.map((garden) => garden.name));
  let n = 1;
  while (taken.has(`Garden ${n}`)) n++;
  return `Garden ${n}`;
}

export function createGarden(name?: string): GardenMeta {
  const now = Date.now();
  const gardens = listGardens();
  const meta: GardenMeta = {
    id: newId(),
    name: name ?? defaultName(gardens),
    created: now,
    updated: now,
    plants: 0,
  };
  write(INDEX_KEY, [meta, ...gardens]);
  write(gardenKey(meta.id), { id: meta.id, plants: [] } satisfies GardenRecord);
  return meta;
}

export function loadGarden(id: string): GardenRecord | null {
  return read<GardenRecord | null>(gardenKey(id), null);
}

/** Returns false when the garden could not be written (storage full or blocked). */
export function saveGarden(id: string, plants: SavedPlant[], displays: GardenRecord['displays'] = []): boolean {
  if (!write(gardenKey(id), { id, plants, displays } satisfies GardenRecord)) return false;
  const gardens = listGardens().map((meta) =>
    meta.id === id ? { ...meta, updated: Date.now(), plants: plants.length } : meta,
  );
  return write(INDEX_KEY, gardens);
}

export function renameGarden(id: string, name: string): void {
  write(
    INDEX_KEY,
    listGardens().map((meta) => (meta.id === id ? { ...meta, name } : meta)),
  );
}

export function deleteGarden(id: string): void {
  const wasActive = getActiveGardenId() === id;
  remove(gardenKey(id));
  write(
    INDEX_KEY,
    listGardens().filter((meta) => meta.id !== id),
  );
  if (wasActive) remove(ACTIVE_KEY);
}

export function getActiveGardenId(): string | null {
  const id = read<string | null>(ACTIVE_KEY, null);
  return id != null && listGardens().some((meta) => meta.id === id) ? id : null;
}

export function setActiveGardenId(id: string): void {
  write(ACTIVE_KEY, id);
}

/** The garden to open on launch: the remembered one, else the newest, else a new one. */
export function resolveStartupGarden(): GardenMeta {
  const gardens = listGardens();
  const active = getActiveGardenId();
  const meta = gardens.find((garden) => garden.id === active) ?? gardens[0] ?? createGarden();
  setActiveGardenId(meta.id);
  return meta;
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(SETTINGS_KEY, {}) };
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}

export function hasFlag(flag: HintFlag): boolean {
  return read<Record<string, boolean>>(FLAG_KEY, {})[flag] === true;
}

export function setFlag(flag: HintFlag, value = true): void {
  write(FLAG_KEY, { ...read<Record<string, boolean>>(FLAG_KEY, {}), [flag]: value });
}
