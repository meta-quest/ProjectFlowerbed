/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Asset integrity: every file the manifest, the scene, the sources and the
 * landing page point at must ship in public/, and every id they use must
 * resolve. Broken references fail silently at runtime (a missing model or
 * sound simply never appears), so these checks guard the asset-heavy parts.
 */

import { dirname, join, relative, sep } from 'node:path';
import { AssetType } from '@iwsdk/core';
import manifest from './assets.js';
import { PLANTS, SLOTS_PER_PAGE } from './data/plants.js';
import { SOUNDS } from './data/sounds.js';
import {
  PUBLIC,
  ROOT,
  appSources,
  fileExists,
  gltfNames,
  listFiles,
  matchAll,
  publicFileForUrl,
  readJson,
  readText,
  type GltfJson,
} from './test-utils/repo.js';

interface ManifestEntry {
  url: string;
  type: string;
  name?: string;
  priority?: string;
}

interface SceneNode {
  id: string;
  name?: string;
  content?: { type: string; asset?: string };
  children?: SceneNode[];
}

interface SceneJson {
  nodes: SceneNode[];
  player?: { transform?: { position?: number[] } };
}

const entries = Object.entries(manifest as unknown as Record<string, ManifestEntry>);
const ids = new Set(entries.map(([id]) => id));
const byType = (type: string) => entries.filter(([, entry]) => entry.type === type);
const fileOf = (id: string) => publicFileForUrl((manifest as unknown as Record<string, ManifestEntry>)[id].url);
const missingFiles = (list: [string, ManifestEntry][]) =>
  list.filter(([, entry]) => !fileExists(publicFileForUrl(entry.url))).map(([id, entry]) => `${id}: ${entry.url}`);

const sceneFiles = listFiles(join(PUBLIC, 'scenes'), '.iwsdk.scene.json');
const scenes = sceneFiles.map((path) => ({ path, scene: readJson<SceneJson>(path) }));

function walk(nodes: SceneNode[], out: SceneNode[] = []): SceneNode[] {
  for (const node of nodes) {
    out.push(node);
    walk(node.children ?? [], out);
  }
  return out;
}

const sources = appSources();
const allSource = sources.map((file) => file.text).join('\n');

describe('asset manifest', () => {
  it('builds every URL from BASE_URL with a known asset type and extension', () => {
    const extensions: Record<string, RegExp> = {
      [AssetType.GLTF]: /\.(gltf|glb)$/,
      [AssetType.Audio]: /\.mp3$/,
      [AssetType.UIKitML]: /\.uikitml$/,
    };
    expect(entries.length).toBeGreaterThan(100);
    for (const [id, entry] of entries) {
      expect(entry.url.startsWith(import.meta.env.BASE_URL), id).toBe(true);
      expect(entry.url, id).not.toMatch(/\/\//);
      expect(Object.keys(extensions), id).toContain(entry.type);
      expect(entry.url, id).toMatch(extensions[entry.type]);
    }
  });

  it('never registers the same file under two ids', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const [id, entry] of entries) {
      if (seen.has(entry.url)) duplicates.push(`${id} = ${seen.get(entry.url)}`);
      seen.set(entry.url, id);
    }
    expect(duplicates).toEqual([]);
  });

  it('points every model at a file in public/', () => {
    expect(missingFiles(byType(AssetType.GLTF))).toEqual([]);
  });

  it('points every sound at a file in public/', () => {
    expect(missingFiles(byType(AssetType.Audio))).toEqual([]);
  });

  it('points every panel at a file in public/ui', () => {
    expect(missingFiles(byType(AssetType.UIKitML))).toEqual([]);
  });

  it("ships every buffer and texture each model's .gltf references", () => {
    const missing: string[] = [];
    for (const [id] of byType(AssetType.GLTF)) {
      const path = fileOf(id);
      if (!path.endsWith('.gltf') || !fileExists(path)) continue;
      const gltf = readJson<GltfJson>(path);
      for (const { uri } of [...(gltf.buffers ?? []), ...(gltf.images ?? [])]) {
        if (!uri || uri.startsWith('data:')) continue;
        if (!fileExists(join(dirname(path), decodeURIComponent(uri)))) missing.push(`${id}: ${uri}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('has a model and a seed packet for every plant', () => {
    for (const plant of PLANTS) {
      expect(ids, plant.id).toContain(`plant-${plant.id}`);
      expect(ids, plant.id).toContain(`packet-${plant.id}`);
      expect(fileOf(`plant-${plant.id}`).endsWith(`${plant.model}.gltf`)).toBe(true);
    }
  });

  it('has an audio asset for every sound effect (loaded as sfx-<id>)', () => {
    for (const id of Object.keys(SOUNDS)) expect(ids).toContain(`sfx-${id}`);
  });
});

describe('scene references', () => {
  it('place only manifest models, with unique node ids', () => {
    expect(scenes.length).toBeGreaterThan(0);
    for (const { path, scene } of scenes) {
      const nodes = walk(scene.nodes);
      const missing = nodes
        .filter((node) => node.content?.type === 'asset')
        .filter((node) => !ids.has(node.content!.asset!) || !fileOf(node.content!.asset!).endsWith('.gltf'))
        .map((node) => `${node.id} -> ${node.content!.asset}`);
      expect(missing, relative(ROOT, path)).toEqual([]);
      expect(new Set(nodes.map((node) => node.id)).size, relative(ROOT, path)).toBe(nodes.length);
    }
  });

  it('authors a player spawn so the player does not start inside the island', () => {
    const main = readJson<SceneJson>(join(PUBLIC, 'scenes/main.iwsdk.scene.json'));
    expect(main.player?.transform?.position).toHaveLength(3);
  });

  it('contains every scene object the systems look up by id', () => {
    const nodeIds = new Set(scenes.flatMap(({ scene }) => walk(scene.nodes).map((node) => node.id)));
    const used = new Set(matchAll(allSource, /getSceneObject\('([^']+)'\)/g));
    expect(used.size).toBeGreaterThan(0);
    for (const id of used) expect(nodeIds, id).toContain(id);
  });

  it('matches every prop LOD/instancing rule to props in the scene', () => {
    const source = sources.find((file) => file.rel === 'src/world/prop-batch-system.ts')!.text;
    const prefixes = matchAll(source, /prefix: \/(.+?)\/,/g).map((pattern) => new RegExp(pattern));
    expect(prefixes.length).toBeGreaterThan(0);
    const main = readJson<SceneJson>(join(PUBLIC, 'scenes/main.iwsdk.scene.json'));
    const props = main.nodes.find((node) => node.id === 'island-props')!.children ?? [];
    const unmatched = prefixes.filter((prefix) => !props.some((prop) => prefix.test(prop.name ?? '')));
    expect(unmatched.map(String)).toEqual([]);
  });
});

describe('asset ids used by systems', () => {
  it('resolves every literal id passed to AssetManager', () => {
    const used = matchAll(allSource, /AssetManager\.(?:get|load)\w*\('([^']+)'\)/g);
    expect(used.length).toBeGreaterThan(0);
    for (const id of used) expect(ids, id).toContain(id);
  });

  it('resolves every LOD and fauna id listed in system tables', () => {
    const used = new Set(matchAll(allSource, /'((?:lod|fauna)-[a-z0-9-]+)'/g));
    expect(used.size).toBeGreaterThan(10);
    for (const id of used) expect(ids, id).toContain(id);
  });

  it('resolves the per-hand tracked gloves', () => {
    expect(allSource).toContain('`glove-tracked-${hand}`');
    for (const hand of ['left', 'right']) expect(ids).toContain(`glove-tracked-${hand}`);
  });
});

describe('named nodes the systems rely on', () => {
  const names = (id: string) => gltfNames(fileOf(id));

  it('camera anchors, shutter and print path; watering-can spout', () => {
    const camera = names('photo-camera');
    for (const node of ['camera_anchor', 'screen_anchor', 'shutter_release_button', 'photo_start', 'photo_end']) {
      expect(camera, node).toContain(node);
    }
    expect(names('watering-can')).toContain('water_origin');
  });

  it('seedbox: one slot per seed on a page, plus the paging button', () => {
    const seedbox = names('seedbox');
    for (let i = 1; i <= SLOTS_PER_PAGE; i++) expect(seedbox).toContain(`slot_${i}`);
    expect(seedbox).toContain('Prop_SeedBox_Button');
    expect(seedbox).toContain('Prop_SeedBox_Button_Frame');
  });
});

describe('files referenced outside the manifest', () => {
  const publicFiles = listFiles(PUBLIC, '').map((path) => relative(PUBLIC, path).split(sep).join('/'));
  const shipped = (path: string) => publicFiles.some((file) => file === path || file.endsWith(`/${path}`));

  it('ships every media file named in the sources', () => {
    const literals = new Set(matchAll(allSource, /['`]([\w./-]+\.(?:mp4|png|jpg|jpeg|ktx2|mp3|gltf|glb))['`]/g));
    expect(literals.size).toBeGreaterThan(5);
    const missing = [...literals].filter((path) => !shipped(path.replace(/^\.?\//, '')));
    expect(missing).toEqual([]);
  });

  it('ships the tutorial videos', () => {
    const source = sources.find((file) => file.rel === 'src/ui/tutorial-system.ts')!.text;
    const constants = new Map(
      [...source.matchAll(/const (\w+) = '([^']+)'/g)].map((match) => [match[1], match[2]] as const),
    );
    const files = matchAll(source, /video\(([^)]+)\)/g)
      .filter((arg) => arg !== 'file: string')
      .map((arg) => (arg.startsWith("'") ? arg.slice(1, -1) : constants.get(arg)));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(fileExists(join(PUBLIC, 'flowerbed/videos', file ?? '?')), file).toBe(true);
  });

  it('ships every local image, page and video the landing page links to', () => {
    const html = readText(join(ROOT, 'index.html'));
    const refs = matchAll(html, /(?:src|href|data-full|poster)="(\.\/flowerbed\/[^"]+)"/g);
    expect(refs.length).toBeGreaterThan(0);
    const missing = refs.filter((ref) => !fileExists(publicFileForUrl(ref)));
    expect(missing).toEqual([]);
  });

  it('ships every BASE_URL-relative file built in the sources', () => {
    const paths = matchAll(allSource, /\$\{import\.meta\.env\.BASE_URL\}(flowerbed\/[\w./-]+)`/g);
    const missing = paths.filter((path) => !fileExists(join(PUBLIC, path)));
    expect(missing).toEqual([]);
  });
});
