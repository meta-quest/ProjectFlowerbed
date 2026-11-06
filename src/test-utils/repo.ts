/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Filesystem helpers for asset-integrity tests: resolve repository paths,
 * read JSON and source files, and map runtime URLs back to files in public/.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const PUBLIC = join(ROOT, 'public');
export const SRC = join(ROOT, 'src');

export function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

export function readJson<T>(path: string): T {
  return JSON.parse(readText(path)) as T;
}

export function fileExists(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

/** Every file below `dir` (recursive) whose name ends with `suffix`. */
export function listFiles(dir: string, suffix: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(path, suffix));
    else if (entry.name.endsWith(suffix)) out.push(path);
  }
  return out.sort();
}

/**
 * The file in public/ served at a runtime URL built from BASE_URL (or a
 * `./`-relative page URL). Query strings and hashes are ignored.
 */
export function publicFileForUrl(url: string, base = '/'): string {
  let path = url.split(/[?#]/u)[0];
  if (path.startsWith(base)) path = path.slice(base.length);
  path = path.replace(/^\.?\/+/u, '');
  return join(PUBLIC, decodeURIComponent(path));
}

export interface SourceFile {
  /** Path relative to the repository root, with forward slashes. */
  rel: string;
  text: string;
}

/** Application sources: src/**\/*.ts without tests, test helpers or typings. */
export function appSources(): SourceFile[] {
  return listFiles(SRC, '.ts')
    .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.d.ts'))
    .filter((path) => !path.includes(`${sep}test-utils${sep}`))
    .map((path) => ({ rel: relative(ROOT, path).split(sep).join('/'), text: readText(path) }));
}

/** All capture-group-1 matches of `pattern` (which must be global) in `text`. */
export function matchAll(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

export interface GltfJson {
  nodes?: { name?: string }[];
  meshes?: { name?: string }[];
  buffers?: { uri?: string }[];
  images?: { uri?: string }[];
}

/** Node and mesh names in a glTF file. */
export function gltfNames(path: string): Set<string> {
  const gltf = readJson<GltfJson>(path);
  const names = new Set<string>();
  for (const node of gltf.nodes ?? []) if (node.name) names.add(node.name);
  for (const mesh of gltf.meshes ?? []) if (mesh.name) names.add(mesh.name);
  return names;
}
