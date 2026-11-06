/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Derive the prop placements of the Flowerbed island scene from the legacy
 * environment glTF.
 *
 * The legacy island links props by node name ("Bench.gltf.004" places
 * Bench.gltf). This script reads those placements once and rewrites the
 * `island-props` group in public/scenes/main.iwsdk.scene.json, plus the
 * authored player spawn from the `Player_Start` empty. Everything else in the
 * scene file is left as authored.
 *
 *   node scripts/generate-flowerbed-scene.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';

const ENV = 'public/flowerbed/models/environment/Environment_Terrain_Deliver.gltf';
const SCENE = 'public/scenes/main.iwsdk.scene.json';

/** Legacy link name -> manifest asset id. */
const PROP_ASSETS = {
  Bench: 'prop-bench',
  Prop_Bridge: 'prop-bridge',
  Prop_Fence_01_01: 'prop-fence-a',
  Prop_Fence_01_03: 'prop-fence-c',
  Prop_Fence_01_04: 'prop-fence-d',
  Prop_Fountain: 'prop-fountain',
  Prop_Gate: 'prop-gate',
  Prop_Gazebo: 'prop-gazebo',
  Prop_Pergola: 'prop-pergola',
  Prop_Planter_Circular_01: 'prop-planter-round-a',
  Prop_Planter_Circular_02: 'prop-planter-round-b',
  Prop_Planter_Long02: 'prop-planter-long-b',
  Prop_Planter_Long04: 'prop-planter-long-d',
  Prop_Sky: 'sky-dome',
  Tree_Hero: 'tree-hero',
};

/** Props whose silhouettes are worth a shadow; matches the legacy list. */
const SHADOW_CASTERS = /Tree|Bench|Gazebo|Bridge|Pergola/i;

const round = (value, digits = 5) => {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
};

/** Quaternion [x, y, z, w] -> intrinsic XYZ Euler degrees (Three.js order). */
function quatToEulerDeg([x, y, z, w]) {
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - z * w);
  const m13 = 2 * (x * z + y * w);
  const m22 = 1 - 2 * (x * x + z * z);
  const m23 = 2 * (y * z - x * w);
  const m32 = 2 * (y * z + x * w);
  const m33 = 1 - 2 * (x * x + y * y);
  const ry = Math.asin(Math.max(-1, Math.min(1, m13)));
  let rx;
  let rz;
  if (Math.abs(m13) < 0.9999999) {
    rx = Math.atan2(-m23, m33);
    rz = Math.atan2(-m12, m11);
  } else {
    rx = Math.atan2(m32, m22);
    rz = 0;
  }
  const deg = 180 / Math.PI;
  return [round(rx * deg, 3), round(ry * deg, 3), round(rz * deg, 3)];
}

function transformOf(node) {
  if (node.matrix) throw new Error(`Matrix transforms unsupported: ${node.name}`);
  const transform = {};
  if (node.translation) transform.position = node.translation.map((v) => round(v));
  if (node.rotation) transform.rotationDeg = quatToEulerDeg(node.rotation);
  if (node.scale) {
    const [sx, sy, sz] = node.scale.map((v) => round(v));
    transform.scale = sx === sy && sy === sz ? sx : [sx, sy, sz];
  }
  return transform;
}

const env = JSON.parse(await readFile(ENV, 'utf8'));
const scene = JSON.parse(await readFile(SCENE, 'utf8'));

const props = [];
const counts = {};
for (const node of env.nodes) {
  if (!node.name.includes('gltf') || node.extras?.collider) continue;
  const link = node.name.split('.gltf')[0];
  const asset = PROP_ASSETS[link];
  if (!asset) throw new Error(`No manifest asset for linked prop ${node.name}`);
  counts[asset] = (counts[asset] ?? 0) + 1;
  const index = String(counts[asset]).padStart(2, '0');
  const caster = SHADOW_CASTERS.test(link) && asset !== 'sky-dome';
  props.push({
    id: `${asset}-${index}`,
    name: `${link.replace(/^Prop_/, '').replace(/_/g, ' ')} ${index}`,
    content: {
      type: 'asset',
      asset,
      ...(caster ? { castShadow: true } : {}),
      ...(asset === 'sky-dome' ? {} : { receiveShadow: true }),
    },
    transform: transformOf(node),
  });
}

const start = env.nodes.find((node) => node.name === 'Player_Start');
if (!start) throw new Error('Player_Start missing');

const group = {
  id: 'island-props',
  name: 'Island Props',
  content: { type: 'group' },
  children: props,
};
const existing = scene.nodes.findIndex((node) => node.id === 'island-props');
if (existing >= 0) scene.nodes[existing] = group;
else scene.nodes.push(group);

// Spawn at the Player_Start empty. The legacy save system always applied a
// fixed 45 degree yaw and ignored the empty's own rotation.
scene.player = {
  ...(scene.player ?? {}),
  transform: {
    position: start.translation.map((v) => round(v, 4)),
    rotationDeg: [0, 45, 0],
  },
};

await writeFile(SCENE, `${JSON.stringify(scene, null, 2)}\n`);
console.log(
  `Wrote ${props.length} prop placements:`,
  Object.entries(counts)
    .map(([id, n]) => `${id}×${n}`)
    .join(', '),
  `| spawn ${scene.player.transform.position.join(', ')}`,
);
