/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Island readiness and shared world handles, published by IslandSystem.
 */

import { signal, type CubeTexture, type Object3D } from '@iwsdk/core';

export interface IslandHandles {
  island: Object3D;
  /** Named empties from the island glTF, grouped by prefix (e.g. SFX_OCEAN). */
  anchors: Map<string, Object3D[]>;
}

export const islandReady = signal<IslandHandles | null>(null);

/** Cloud cube map used for water and metal tools (legacy envMap). */
export const toolEnvMap = signal<CubeTexture | null>(null);

/** Bump to ask for one static shadow-map refresh. */
export const shadowRequests = signal(0);

export function requestShadowUpdate(): void {
  shadowRequests.value = shadowRequests.peek() + 1;
}

/** Successful teleports this session (the tutorial watches it). */
export const teleportCount = signal(0);
