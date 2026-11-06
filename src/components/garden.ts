/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Gardening components. System-free so the editor can import the catalog.
 */

import { Types, createComponent } from '@iwsdk/core';

export const PlantStage = {
  Growing: 'growing',
  Grown: 'grown',
  Shrinking: 'shrinking',
} as const;

/** A planted plant. Its pose lives on the entity's Object3D. */
export const Plant = createComponent(
  'Plant',
  {
    /** Plant id from data/plants.ts. */
    plantId: { type: Types.String, default: 'sugarpine' },
    stage: { type: Types.Enum, enum: PlantStage, default: PlantStage.Growing },
    /** Seconds since the current stage began. */
    timer: { type: Types.Float32, default: 0 },
    /** Watering multiplier on the planted scale. */
    growth: { type: Types.Float32, default: 1 },
    /** Instanced-mesh slot; -1 until allocated. */
    slot: { type: Types.Int16, default: -1 },
    /** Randomized base scale (vector). */
    baseScale: { type: Types.Vec3, default: [1, 1, 1] },
    /** Current segment values x, y, z, w (1 = rest pose). */
    segments: { type: Types.Vec4, default: [1, 1, 1, 1] },
    /** Root (whole-plant) spring value. */
    rootScale: { type: Types.Float32, default: 1 },
    /** Hovered by the Remove tool. */
    highlighted: { type: Types.Boolean, default: false },
    /** 0 = freshly watered, 1 = wilted. Rises slowly; watering resets it. */
    thirst: { type: Types.Float32, default: 0 },
  },
  'A plant in the garden; growth and removal are animated by PlantSystem.',
);

/** A seed in flight along the planting arc. */
export const Seed = createComponent('Seed', {
  plantId: { type: Types.String, default: 'sugarpine' },
  timer: { type: Types.Float32, default: 0 },
  duration: { type: Types.Float32, default: 1 },
});

/** A kept photo standing on an easel in the garden (grab to move it). */
export const PhotoEasel = createComponent('PhotoEasel', {
  photoId: { type: Types.String, default: '' },
});
