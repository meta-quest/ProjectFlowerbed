/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * UIKitML integrity. spawnPanel() looks panels up by manifest id and its
 * el/text/style/on helpers call requireElementById(), which throws for an
 * unknown element id, so a renamed id in a .uikitml file breaks the panel at
 * runtime. These tests parse every panel with the same UIKitML parser and
 * kit the build uses and cross-check the ids the systems reference.
 */

import { basename, join } from 'node:path';
import { parse, resolveKitComponentSets, type UIKitMLNode } from '@drawcall/uikitml';
import { AssetType } from '@iwsdk/core';
import manifest from '../assets.js';
import { PUBLIC, appSources, fileExists, listFiles, matchAll, publicFileForUrl, readText } from '../test-utils/repo.js';

interface ManifestEntry {
  url: string;
  type: string;
}

const panelFiles = listFiles(join(PUBLIC, 'ui'), '.uikitml');
const panelAssets = Object.entries(manifest as unknown as Record<string, ManifestEntry>).filter(
  ([, entry]) => entry.type === AssetType.UIKitML,
);
const fileForPanel = new Map(panelAssets.map(([id, entry]) => [id, publicFileForUrl(entry.url)]));

function parsePanel(path: string) {
  return parse(readText(path), { componentSets: resolveKitComponentSets('horizon') });
}

function collect(node: UIKitMLNode, ids: Set<string>, sources: string[]): void {
  if (node.kind !== 'element') return;
  const props = node.props as Record<string, unknown>;
  if (typeof props.id === 'string') ids.add(props.id);
  if (typeof props.src === 'string') sources.push(props.src);
  for (const child of node.children) collect(child, ids, sources);
}

const parsed = new Map(
  panelFiles.map((path) => {
    const result = parsePanel(path);
    const ids = new Set<string>();
    const srcs: string[] = [];
    if (result.success) collect(result.ast.root, ids, srcs);
    return [path, { result, ids, srcs }] as const;
  }),
);

const idsOfPanel = (assetId: string) => parsed.get(fileForPanel.get(assetId)!)?.ids ?? new Set<string>();
const sources = appSources();
const spawnedIn = (text: string) => matchAll(text, /spawnPanel\(\s*[\w.]+,\s*'([^']+)'/g);

it('parses every panel with the horizon kit (no unknown components or syntax errors)', () => {
  expect(panelFiles.length).toBeGreaterThan(0);
  const errors = [...parsed.entries()].flatMap(([path, { result }]) =>
    result.success ? [] : result.errors.map((error) => `${basename(path)}: ${error.message}`),
  );
  expect(errors).toEqual([]);
});

describe('panel registration', () => {
  it('registers every .uikitml file in the asset manifest and vice versa', () => {
    expect([...fileForPanel.values()].sort()).toEqual(panelFiles);
  });

  it('spawns only registered panels, and every registered panel is used', () => {
    const spawned = new Set(sources.flatMap((file) => spawnedIn(file.text)));
    expect([...spawned].sort()).toEqual(panelAssets.map(([id]) => id).sort());
  });

  it('uses unique element ids within each panel', () => {
    for (const path of panelFiles) {
      const ids = matchAll(readText(path), /\bid="([^"]+)"/g);
      expect(new Set(ids).size, basename(path)).toBe(ids.length);
    }
  });

  it('only references images and videos that ship in public/', () => {
    const missing = [...parsed.entries()].flatMap(([path, { srcs }]) =>
      srcs.filter((src) => !fileExists(publicFileForUrl(src))).map((src) => `${basename(path)}: ${src}`),
    );
    expect(missing).toEqual([]);
  });
});

describe('element ids used by systems', () => {
  const CALL = /\.(?:el|text|style|on)(?:<[^>]*>)?\(\s*'([^']+)'/g;
  const TEMPLATE = /\.(?:el|text|style|on)(?:<[^>]*>)?\(\s*`([^`]+)`/g;
  const users = sources.filter((file) => spawnedIn(file.text).length > 0);

  it('reference only element ids defined by the panels each system spawns', () => {
    expect(users.length).toBeGreaterThanOrEqual(8);
    const missing: string[] = [];
    for (const file of users) {
      const available = new Set(spawnedIn(file.text).flatMap((id) => [...idsOfPanel(id)]));
      for (const id of matchAll(file.text, CALL)) if (!available.has(id)) missing.push(`${file.rel}: ${id}`);
      // Template ids (`goal-${i}-title`) must match at least one real id.
      for (const template of matchAll(file.text, TEMPLATE)) {
        const pattern = new RegExp(`^${template.replace(/\$\{[^}]+\}/g, '.+')}$`);
        if (![...available].some((id) => pattern.test(id))) missing.push(`${file.rel}: ${template}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('settings panel defines every per-option id the settings system builds', () => {
    // Option lists mirror the constants in src/ui/settings-system.ts.
    const ids = idsOfPanel('settings');
    const expected = [
      ...['garden', 'photos', 'goals', 'comfort', 'sound', 'help'].flatMap((tab) => [
        `tab-${tab}`,
        `tab-${tab}-label`,
        `page-${tab}`,
      ]),
      ...['morning', 'sunset', 'night', 'auto'].flatMap((time) => [`time-${time}`, `time-${time}-label`]),
      ...[30, 45, 60, 90].flatMap((angle) => [`turn-${angle}`, `turn-${angle}-label`]),
      ...[2, 3, 4.5].flatMap((speed) => [`speed-${speed}`, `speed-${speed}-label`]),
      ...['snap', 'smooth'].flatMap((style) => [`turnstyle-${style}`, `turnstyle-${style}-label`]),
      ...[0, 25, 50, 75, 100].flatMap((v) => [
        `music-vol-${v}`,
        `music-vol-${v}-label`,
        `effects-vol-${v}`,
        `effects-vol-${v}-label`,
      ]),
      ...['tools', 'garden', 'weekly'].flatMap((set) => [`goals-set-${set}`, `goals-set-${set}-label`]),
      ...[0, 1].flatMap((row) => ['', '-name', '-meta', '-open', '-delete'].map((s) => `garden-row-${row}${s}`)),
      ...[0, 1, 2, 3, 4, 5].map((i) => `album-${i}`),
      ...Array.from({ length: 12 }, (_, n) => `weekly-ribbon-${n}`),
      // Page milestones (goal-0..2) and six finish cards (goal-3..8).
      ...[0, 1, 2].flatMap((i) => ['-dot', '-count', '-title', '-fill', '-reward'].map((s) => `goal-${i}${s}`)),
      ...[3, 4, 5, 6, 7, 8].flatMap((i) =>
        ['', '-badge', '-icon-tools', '-icon-garden', '-lock', '-count', '-title', '-fill', '-reward', '-equip'].map(
          (s) => `goal-${i}${s}`,
        ),
      ),
      // Weekly challenge icons exist on the first three finish cards.
      ...[3, 4, 5].flatMap((i) => ['sprout', 'water', 'camera'].map((kind) => `goal-${i}-icon-w-${kind}`)),
    ];
    expect(expected.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('seed label has one page dot per seedbox page', async () => {
    const { PAGE_COUNT } = await import('../data/plants.js');
    const ids = idsOfPanel('seed-label');
    for (let i = 0; i < PAGE_COUNT; i++) expect(ids).toContain(`page-dot-${i}`);
  });
});
