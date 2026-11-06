/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Small glTF helpers (JSON + buffers) using the project's three.js math.
import fs from 'node:fs';
import path from 'node:path';
const THREE = await import(new URL('../../node_modules/three/build/three.module.js', import.meta.url).href);
export { THREE };
export function loadGltf(file) {
  if (file.endsWith('.glb')) {
    const buf = fs.readFileSync(file);
    const jsonLen = buf.readUInt32LE(12);
    const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
    const binStart = 20 + jsonLen + 8;
    const bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLen));
    return { json, buffers: [bin] };
  }
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const buffers = json.buffers.map((b) => fs.readFileSync(path.join(path.dirname(file), b.uri)));
  return { json, buffers };
}
export function nodeMatrix(n) {
  const m = new THREE.Matrix4();
  if (n.matrix) return m.fromArray(n.matrix);
  return m.compose(
    new THREE.Vector3(...(n.translation ?? [0, 0, 0])),
    new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])),
    new THREE.Vector3(...(n.scale ?? [1, 1, 1])),
  );
}
export function worldMatrices(json) {
  const parent = {};
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => (parent[c] = i)));
  return json.nodes.map((_, i) => {
    const m = nodeMatrix(json.nodes[i]);
    let p = parent[i];
    while (p !== undefined) {
      m.premultiply(nodeMatrix(json.nodes[p]));
      p = parent[p];
    }
    return m;
  });
}
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const READ = {
  5120: [1, (d, o) => d.getInt8(o), 127],
  5121: [1, (d, o) => d.getUint8(o), 255],
  5122: [2, (d, o) => d.getInt16(o, true), 32767],
  5123: [2, (d, o) => d.getUint16(o, true), 65535],
  5125: [4, (d, o) => d.getUint32(o, true), 4294967295],
  5126: [4, (d, o) => d.getFloat32(o, true), 1],
};
/** Read an accessor as a Float64Array (normalized ints dequantized), any stride. */
export function accessor(g, index) {
  const a = g.json.accessors[index];
  const v = g.json.bufferViews[a.bufferView];
  const [bytes, read, max] = READ[a.componentType];
  const n = SIZE[a.type];
  const buf = g.buffers[v.buffer];
  const view = new DataView(buf.buffer, buf.byteOffset);
  const base = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const stride = v.byteStride || n * bytes;
  const out = new Float64Array(a.count * n);
  for (let i = 0; i < a.count; i++) {
    for (let k = 0; k < n; k++) {
      let x = read(view, base + i * stride + k * bytes);
      if (a.normalized) x = a.componentType === 5120 || a.componentType === 5122 ? Math.max(x / max, -1) : x / max;
      out[i * n + k] = x;
    }
  }
  return out;
}
