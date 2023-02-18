/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

export const basicColliderMaterial = new THREE.MeshBasicMaterial({
	wireframe: true,
	color: 0xffffff,
});

export const teleportableColliderMaterial = new THREE.MeshBasicMaterial({
	wireframe: true,
	color: 0x00ff00,
});
