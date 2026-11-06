/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { canvasCalls } from '../test-utils/canvas.js';
import { FakeIndexedDB } from '../test-utils/fake-indexeddb.js';
import { seededRandom } from '../test-utils/random.js';

const DB = 'flowerbed-album';
const STORE = 'photos';

let idb: FakeIndexedDB;

/** Let queued IndexedDB callbacks and promise chains settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** photo-album.ts opens the database and refreshes at import time. */
async function freshAlbum() {
  vi.resetModules();
  const album = await import('./photo-album.js');
  await settle();
  return album;
}

const jpeg = (text = 'jpeg-bytes') => new Blob([text], { type: 'image/jpeg' });
const row = (id: string, created: number, gardenId = 'g1') => ({
  id,
  gardenId,
  created,
  thumb: `thumb:${id}`,
  full: jpeg(id),
});

beforeEach(() => {
  idb = new FakeIndexedDB();
  vi.stubGlobal('indexedDB', idb.factory);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('album storage', () => {
  it('starts empty, and loads saved photos newest first without the full-size blobs', async () => {
    expect((await freshAlbum()).albumPhotos.peek()).toEqual([]);
    idb = new FakeIndexedDB();
    vi.stubGlobal('indexedDB', idb.factory);
    idb.seed(DB, STORE, 'id', [row('a', 100), row('c', 300), row('b', 200)]);
    const { albumPhotos } = await freshAlbum();
    expect(albumPhotos.peek().map((p) => p.id)).toEqual(['c', 'b', 'a']);
    expect(albumPhotos.peek()[0]).toEqual({ id: 'c', gardenId: 'g1', created: 300, thumb: 'thumb:c' });
  });

  it('adds a photo with a fresh id and refreshes the list', async () => {
    const { addToAlbum, albumPhotos } = await freshAlbum();
    vi.setSystemTime(new Date(2026, 9, 28, 12));
    await addToAlbum('garden-7', jpeg(), 'data:image/jpeg;base64,thumb');
    const [photo] = albumPhotos.peek();
    expect(photo).toMatchObject({ gardenId: 'garden-7', created: Date.now(), thumb: 'data:image/jpeg;base64,thumb' });
    expect(photo.id).toMatch(/^p[0-9a-z]+$/);
    expect(idb.rows(DB, STORE)).toHaveLength(1);
  });

  it('keeps photos taken in the same millisecond apart', async () => {
    const { addToAlbum, albumPhotos } = await freshAlbum();
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(1));
    vi.setSystemTime(new Date(2026, 9, 28, 12));
    await addToAlbum('g', jpeg('1'), 't1');
    await addToAlbum('g', jpeg('2'), 't2');
    expect(new Set(albumPhotos.peek().map((p) => p.id)).size).toBe(2);
  });

  it('refuses an empty (failed) encode instead of storing a blank photo', async () => {
    const { addToAlbum, albumPhotos } = await freshAlbum();
    await expect(addToAlbum('g', new Blob([]), 'thumb')).rejects.toThrow();
    expect(albumPhotos.peek()).toEqual([]);
    expect(idb.rows(DB, STORE)).toEqual([]);
  });

  it('removes a photo and refreshes the list', async () => {
    idb.seed(DB, STORE, 'id', [row('a', 100), row('b', 200)]);
    const { albumPhotos, removeFromAlbum } = await freshAlbum();
    await removeFromAlbum('b');
    expect(albumPhotos.peek().map((p) => p.id)).toEqual(['a']);
  });

  it('returns the full-size blob for a photo, or null', async () => {
    idb.seed(DB, STORE, 'id', [row('a', 100)]);
    const { getAlbumBlob } = await freshAlbum();
    const blob = await getAlbumBlob('a');
    expect(await blob?.text()).toBe('a');
    expect(await getAlbumBlob('missing')).toBeNull();
  });

  it('reports a failed write to the caller', async () => {
    const { addToAlbum } = await freshAlbum();
    idb.failRequests = true;
    await expect(addToAlbum('g', jpeg(), 't')).rejects.toThrow();
  });
});

describe('without IndexedDB (blocked or unsupported)', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('loads with an empty album, no blobs and a warning instead of throwing', async () => {
    const { albumPhotos, getAlbumBlob } = await freshAlbum();
    expect(albumPhotos.peek()).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
    expect(await getAlbumBlob('a')).toBeNull();
  });

  it('rejects saving so the camera can tell the player', async () => {
    const { addToAlbum } = await freshAlbum();
    await expect(addToAlbum('g', jpeg(), 't')).rejects.toBeDefined();
  });

  it('also handles a database that fails to open', async () => {
    vi.stubGlobal('indexedDB', idb.factory);
    idb.failOpen = true;
    const { albumPhotos, getAlbumBlob } = await freshAlbum();
    expect(albumPhotos.peek()).toEqual([]);
    expect(await getAlbumBlob('a')).toBeNull();
  });
});

describe('downloadFromAlbum', () => {
  it('downloads the full-size JPEG with a timestamped name and frees the URL later', async () => {
    const created = Date.UTC(2026, 9, 28, 14, 5, 9);
    idb.seed(DB, STORE, 'id', [row('a', created)]);
    const { downloadFromAlbum } = await freshAlbum();
    const createObjectURL = vi.fn(() => 'blob:photo');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.useFakeTimers();
    await downloadFromAlbum('a');
    expect(click).toHaveBeenCalledTimes(1);
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('flowerbed-2026-10-28-14-05-09.jpg');
    expect(link.href).toBe('blob:photo');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo');
  });

  it('does nothing for an unknown photo', async () => {
    const { downloadFromAlbum } = await freshAlbum();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    await downloadFromAlbum('missing');
    expect(click).not.toHaveBeenCalled();
  });
});

describe('makeThumb', () => {
  function source(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  it('scales a landscape print to 480 px wide, keeping its aspect ratio', async () => {
    const { makeThumb } = await freshAlbum();
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,x');
    const print = source(1200, 800);
    expect(makeThumb(print)).toBe('data:image/jpeg;base64,x');
    const draw = canvasCalls.filter((call) => call.method === 'drawImage').at(-1)!;
    expect(draw.args).toEqual([print, 0, 0, 480, 320]);
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.8);
  });

  it('handles portrait prints and custom widths', async () => {
    const { makeThumb } = await freshAlbum();
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:,');
    makeThumb(source(800, 1200), 200);
    const draw = canvasCalls.filter((call) => call.method === 'drawImage').at(-1)!;
    expect(draw.args.slice(1)).toEqual([0, 0, 200, 300]);
    expect((draw.canvas as HTMLCanvasElement).width).toBe(200);
    expect((draw.canvas as HTMLCanvasElement).height).toBe(300);
  });
});
