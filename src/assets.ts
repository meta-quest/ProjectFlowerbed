/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Project Flowerbed asset catalog, shared by the runtime and the editor.
 *
 * Every model, texture and sound from the 2022 game lives under
 * public/flowerbed (see THIRD_PARTY_ASSETS.md). Scene-placeable
 * entries are the island, its props and UI panels; the plant, fauna, tool and
 * audio entries are loaded by application systems.
 */

import { AssetType, defineAssets } from '@iwsdk/core';
import { PLANTS } from './data/plants.js';
import { SOUNDS } from './data/sounds.js';

const url = (filePath: string): string => `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

const model = (path: string, name: string, lazy = false) => ({
  url: url(`flowerbed/models/${path}`),
  type: AssetType.GLTF,
  name,
  ...(lazy ? { priority: 'lazy' as const } : {}),
});

const panel = (file: string, name: string) => ({
  url: url(`ui/${file}`),
  type: AssetType.UIKitML,
  name,
});

const plantModels = Object.fromEntries(
  PLANTS.flatMap((plant) => [
    [`plant-${plant.id}`, model(`flora/${plant.model}.gltf`, plant.label)],
    [`packet-${plant.id}`, model(`props/${plant.packet}.gltf`, `${plant.label} packet`)],
  ]),
);

const soundAssets = Object.fromEntries(
  Object.entries(SOUNDS).map(([id, sound]) => [
    `sfx-${id}`,
    { url: url(`flowerbed/audio/${sound.file}`), type: AssetType.Audio },
  ]),
);

export default defineAssets({
  // World
  island: model('environment/Environment_Terrain_Deliver.gltf', 'Island'),
  'sky-dome': model('props/Prop_Sky.gltf', 'Sky dome'),
  'tree-hero': model('props/Tree_Hero.gltf', 'Hero tree'),
  'prop-bench': model('props/Bench.gltf', 'Bench'),
  'prop-bridge': model('props/Prop_Bridge.gltf', 'Bridge'),
  'prop-fence-a': model('props/Prop_Fence_01_01.gltf', 'Fence A'),
  'prop-fence-c': model('props/Prop_Fence_01_03.gltf', 'Fence C'),
  'prop-fence-d': model('props/Prop_Fence_01_04.gltf', 'Fence D'),
  'prop-fountain': model('props/Prop_Fountain.gltf', 'Fountain'),
  'prop-gate': model('props/Prop_Gate.gltf', 'Gate'),
  'prop-gazebo': model('props/Prop_Gazebo.gltf', 'Gazebo'),
  'prop-pergola': model('props/Prop_Pergola.gltf', 'Pergola'),
  'prop-planter-round-a': model('props/Prop_Planter_Circular_01.gltf', 'Round planter A'),
  'prop-planter-round-b': model('props/Prop_Planter_Circular_02.gltf', 'Round planter B'),
  'prop-planter-long-b': model('props/Prop_Planter_Long02.gltf', 'Long planter B'),
  'prop-planter-long-d': model('props/Prop_Planter_Long04.gltf', 'Long planter D'),

  // Prop detail levels (legacy LODConfigs), loaded by PropBatchSystem.
  'lod-fence-a-0': model('props/Prop_Fence_01_01_LOD0.gltf', 'Fence A LOD0', true),
  'lod-fence-a-1': model('props/Prop_Fence_01_01_LOD1.gltf', 'Fence A LOD1', true),
  'lod-bench-0': model('props/Bench_LOD0.gltf', 'Bench LOD0', true),
  'lod-bench-1': model('props/Bench_LOD1.gltf', 'Bench LOD1', true),
  'lod-planter-round-a-0': model('props/Prop_Planter_Circular_01_LOD0.gltf', 'Round planter A LOD0', true),
  'lod-planter-round-a-1': model('props/Prop_Planter_Circular_01_LOD1.gltf', 'Round planter A LOD1', true),
  'lod-planter-round-b-0': model('props/Prop_Planter_Circular_02_LOD0.gltf', 'Round planter B LOD0', true),
  'lod-planter-round-b-1': model('props/Prop_Planter_Circular_02_LOD1.gltf', 'Round planter B LOD1', true),
  'lod-planter-long-b-0': model('props/Prop_Planter_Long02_LOD0.gltf', 'Long planter B LOD0', true),
  'lod-planter-long-b-1': model('props/Prop_Planter_Long02_LOD1.gltf', 'Long planter B LOD1', true),
  'lod-planter-long-d-0': model('props/Prop_Planter_Long04_LOD0.gltf', 'Long planter D LOD0', true),
  'lod-planter-long-d-1': model('props/Prop_Planter_Long04_LOD1.gltf', 'Long planter D LOD1', true),
  'lod-gazebo-0': model('props/Prop_Gazebo_LOD0.gltf', 'Gazebo LOD0', true),
  'lod-gazebo-1': model('props/Prop_Gazebo_LOD1.gltf', 'Gazebo LOD1', true),
  'lod-pergola-0': model('props/Prop_Pergola_LOD0.gltf', 'Pergola LOD0', true),
  'lod-pergola-1': model('props/Prop_Pergola_LOD1.gltf', 'Pergola LOD1', true),
  'lod-tree-hero-0': model('props/Tree_Hero_LOD0.gltf', 'Hero tree LOD0', true),
  'lod-tree-hero-1': model('props/Tree_Hero_LOD1.gltf', 'Hero tree LOD1', true),

  // Gardening
  ...plantModels,
  seedbox: model('props/Prop_SeedBox/Prop_SeedBox.gltf', 'Seedbox'),
  'watering-can': model('props/Prop_Watering_Can.gltf', 'Watering can'),
  'photo-camera': model('props/Prop_Camera/Prop_Camera.gltf', 'Camera'),
  'glove-hand': model('hands/PlayerElement_Hand_Left.gltf', 'Glove hand'),
  // Re-rigged to the WebXR hand skeleton for hand tracking (scripts/glove-rerig).
  'glove-tracked-left': model('hands/glove-left.gltf', 'Tracked glove (left)'),
  'glove-tracked-right': model('hands/glove-right.gltf', 'Tracked glove (right)'),

  // Fauna
  'fauna-fish': model('fauna/fish/Fish_A/Fauna_Fish_A.gltf', 'Fish', true),
  'fauna-duck': model('fauna/duck/duck_b/Fauna_Duck_B.gltf', 'Duck', true),
  'fauna-seagull': model('fauna/seagull/Flying/Fauna_Seagull_Flying.gltf', 'Seagull', true),
  'fauna-butterfly-blue': model('fauna/butterfly/Blue/Fauna_Butterfly_Blue.gltf', 'Blue butterfly', true),
  'fauna-butterfly-orange': model('fauna/butterfly/Orange/Fauna_Butterfly_Orange.gltf', 'Orange butterfly', true),

  // Audio
  ...soundAssets,

  // UI
  'tool-dial': panel('tool-dial.uikitml', 'Tool dial'),
  'seed-label': panel('seed-label.uikitml', 'Seed label'),
  'photo-drop': panel('photo-drop.uikitml', 'Photo drop tiles'),
  settings: panel('settings.uikitml', 'Settings'),
  tutorial: panel('tutorial.uikitml', 'Tutorial'),
  hint: panel('hint.uikitml', 'Hint'),
  controllers: panel('controllers.uikitml', 'Connect controllers'),
  'tool-chip': panel('tool-chip.uikitml', 'Tool chip'),
  undo: panel('undo.uikitml', 'Undo removal'),
  'palm-tools': panel('palm-tools.uikitml', 'Palm tools button (hand tracking)'),
});
