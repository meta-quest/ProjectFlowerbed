/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * The 32 seed varieties, in legacy seedbox order (9 slots per page, 4 pages).
 *
 * `model` and `packet` are file stems under public/flowerbed/models/flora and
 * public/flowerbed/models/props. `accent` tints the seed UI chip.
 */

import type { GrowthProfileId } from './plant-growth.js';

export interface PlantSpec {
  id: string;
  label: string;
  species: string;
  model: string;
  packet: string;
  growth: GrowthProfileId;
  accent: string;
}

/** Display names; varieties are told apart by colour rather than A/B/C. */
const NAMES: Record<string, string> = {
  allium_a: 'Purple Allium',
  allium_b: 'Pink Allium',
  allium_c: 'White Allium',
  sunflower_a: 'Golden Sunflower',
  sunflower_b: 'Autumn Sunflower',
  nasturtium_a: 'Tangerine Nasturtium',
  nasturtium_b: 'Lemon Nasturtium',
  nasturtium_c: 'Ruby Nasturtium',
  tulip_a: 'Scarlet Tulip',
  tulip_b: 'Butter Tulip',
  tulip_c: 'Blush Tulip',
  tulip_d: 'Violet Tulip',
  carnation_a: 'Pink Carnation',
  carnation_b: 'Ivory Carnation',
  daffodil_a: 'Sunny Daffodil',
  daffodil_b: 'Cream Daffodil',
  rose_a: 'Red Rose',
  rose_b: 'Pink Rose',
  rose_c: 'Yellow Rose',
  rose_d: 'White Rose',
  pansy_a: 'Violet Pansy',
  pansy_b: 'Golden Pansy',
  pansy_c: 'Magenta Pansy',
  succulent_a: 'Jade Succulent',
  succulent_b: 'Blue Succulent',
  succulent_c: 'Lime Succulent',
  lavender_a: 'English Lavender',
  lavender_b: 'Lilac Lavender',
};

const flower = (
  id: string,
  species: string,
  variant: string,
  growth: GrowthProfileId,
  accent: string,
  file = species,
): PlantSpec => ({
  id,
  label: NAMES[id] ?? `${species} ${variant}`,
  species,
  model: `Flora_${file}_${variant}`,
  packet: `Prop_SeedPacket_${file}_${variant}`,
  growth,
  accent,
});

const tree = (id: string, label: string, file: string, accent: string): PlantSpec => ({
  id,
  label,
  species: label,
  model: `Tree_${file}`,
  packet: `Prop_Packet_${file}`,
  growth: id as GrowthProfileId,
  accent,
});

export const PLANTS: readonly PlantSpec[] = [
  // Page 1
  flower('allium_a', 'Allium', 'A', 'allium_a', '#b58ae0'),
  flower('allium_b', 'Allium', 'B', 'allium_a', '#e6a0d8'),
  flower('allium_c', 'Allium', 'C', 'allium_a', '#f2f0f5'),
  flower('sunflower_a', 'Sunflower', 'A', 'sunflower_a', '#f6c443'),
  flower('sunflower_b', 'Sunflower', 'B', 'sunflower_a', '#e98a2e'),
  tree('oak', 'Oak', 'Oak', '#7fae4d'),
  tree('sugarpine', 'Sugar Pine', 'SugarPine', '#4f8a5b'),
  tree('fir', 'Cedar Hedge', 'CedarHedge', '#5d9a63'),
  tree('cherryblossom', 'Cherry Blossom', 'CherryBlossom', '#f4a7c0'),
  // Page 2
  flower('nasturtium_a', 'Nasturtium', 'A', 'nasturtium_a', '#f08a3c'),
  flower('nasturtium_b', 'Nasturtium', 'B', 'nasturtium_a', '#f5c64a'),
  flower('nasturtium_c', 'Nasturtium', 'C', 'nasturtium_a', '#e2533b'),
  flower('tulip_a', 'Tulip', 'A', 'tulip_a', '#ef5d6c'),
  flower('tulip_b', 'Tulip', 'B', 'tulip_a', '#f7d24e'),
  flower('tulip_c', 'Tulip', 'C', 'tulip_a', '#f39bc0'),
  flower('tulip_d', 'Tulip', 'D', 'tulip_a', '#9c6ad6'),
  flower('carnation_a', 'Carnation', 'A', 'carnation_a', '#f27c9b'),
  flower('carnation_b', 'Carnation', 'B', 'carnation_a', '#f6e8ea'),
  // Page 3
  flower('daffodil_a', 'Daffodil', 'A', 'daffodil_a', '#f8d74a', 'Daffodil'),
  flower('daffodil_b', 'Daffodil', 'B', 'daffodil_a', '#fbeeb0', 'Daffodil'),
  flower('rose_a', 'Rose', 'A', 'rose_a', '#d9364b'),
  flower('rose_b', 'Rose', 'B', 'rose_a', '#f6a6b6'),
  flower('rose_c', 'Rose', 'C', 'rose_a', '#fbe7a1'),
  flower('rose_d', 'Rose', 'D', 'rose_a', '#f4f1ea'),
  flower('pansy_a', 'Pansy', 'A', 'pansy_a', '#7a5cd6'),
  flower('pansy_b', 'Pansy', 'B', 'pansy_a', '#f2c94c'),
  flower('pansy_c', 'Pansy', 'C', 'pansy_a', '#e46aa8'),
  // Page 4
  flower('succulent_a', 'Succulent', 'A', 'succulent_a', '#8cc7a1'),
  flower('succulent_b', 'Succulent', 'B', 'succulent_a', '#a7b8d8'),
  flower('succulent_c', 'Succulent', 'C', 'succulent_a', '#c9d98a'),
  flower('lavender_a', 'Lavender', 'A', 'lavender_a', '#9b86d9'),
  flower('lavender_b', 'Lavender', 'B', 'lavender_a', '#c3a6ea'),
];

export const SLOTS_PER_PAGE = 9;
export const PAGE_COUNT = Math.ceil(PLANTS.length / SLOTS_PER_PAGE);

export const PLANT_INDEX: ReadonlyMap<string, number> = new Map(PLANTS.map((plant, index) => [plant.id, index]));
