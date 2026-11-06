/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * The photo album: saved prints are kept in IndexedDB (full-size JPEG plus
 * a small thumbnail), per garden, and browsed from Settings and the landing
 * page. Downloads are an option from the album rather than the only way to
 * keep a photo.
 */

import { signal } from '@iwsdk/core';

export interface AlbumPhoto {
  id: string;
  gardenId: string;
  created: number;
  /** Small JPEG data URL for panels and the landing page. */
  thumb: string;
  full: Blob;
}

const DB = 'flowerbed-album';
const STORE = 'photos';

/** Newest-first summaries (no blobs) for UI. */
export const albumPhotos = signal<Omit<AlbumPhoto, 'full'>[]>([]);

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('gardenId', 'gardenId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const request = run(database.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function refreshAlbum(): Promise<void> {
  try {
    const all = await tx<AlbumPhoto[]>('readonly', (store) => store.getAll());
    albumPhotos.value = all
      .sort((a, b) => b.created - a.created)
      .map(({ id, gardenId, created, thumb }) => ({ id, gardenId, created, thumb }));
  } catch (error) {
    console.warn('[flowerbed] album unavailable', error);
  }
}

/** Rejects when the photo could not be stored (encoding failed, storage full or blocked). */
export async function addToAlbum(gardenId: string, full: Blob, thumb: string): Promise<void> {
  if (full.size === 0) throw new Error('photo encoding failed');
  const photo: AlbumPhoto = {
    id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    gardenId,
    created: Date.now(),
    thumb,
    full,
  };
  await tx('readwrite', (store) => store.put(photo));
  await refreshAlbum();
}

export async function removeFromAlbum(id: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(id));
  await refreshAlbum();
}

export async function getAlbumBlob(id: string): Promise<Blob | null> {
  try {
    const photo = await tx<AlbumPhoto | undefined>('readonly', (store) => store.get(id));
    return photo?.full ?? null;
  } catch {
    return null;
  }
}

export async function downloadFromAlbum(id: string): Promise<void> {
  const photo = await tx<AlbumPhoto | undefined>('readonly', (store) => store.get(id));
  if (!photo) return;
  const url = URL.createObjectURL(photo.full);
  const link = document.createElement('a');
  link.download = `flowerbed-${new Date(photo.created).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`;
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Thumbnail of a canvas as a small JPEG data URL. */
export function makeThumb(source: HTMLCanvasElement, width = 480): string {
  const thumb = document.createElement('canvas');
  thumb.width = width;
  thumb.height = Math.round((width * source.height) / source.width);
  thumb.getContext('2d')!.drawImage(source, 0, 0, thumb.width, thumb.height);
  return thumb.toDataURL('image/jpeg', 0.8);
}

void refreshAlbum();
