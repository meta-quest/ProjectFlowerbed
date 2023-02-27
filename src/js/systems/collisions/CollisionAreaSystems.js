/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { CollisionAreaComponent } from '../../components/ColliderComponents';
import { PlayerStateComponent } from '../../components/PlayerStateComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';

const _vec1 = new THREE.Vector2();
const _vec2 = new THREE.Vector2();

/**
 * Updates all CollisionAreaComponents with whether the player has moved into them.
 */
export class CollisionAreaSystem extends System {
	init() {
		this.world.registerSystem(CollisionAreaVisualizationSystem);
	}

	execute() {
		let viewerTransform;
		this.queries.player.results.forEach((entity) => {
			viewerTransform = entity.getComponent(PlayerStateComponent)
				.viewerTransform;
		});

		if (!viewerTransform) {
			return;
		}

		this.queries.areas.results.forEach((entity) => {
			const area = entity.getMutableComponent(CollisionAreaComponent);
			_vec1.set(viewerTransform.position.x, viewerTransform.position.z);
			_vec2.set(area.position.x, area.position.z);

			if (_vec1.distanceTo(_vec2) < area.radius) {
				area.isIntersecting = true;
			} else {
				area.isIntersecting = false;
			}
		});
	}
}

CollisionAreaSystem.queries = {
	player: { components: [PlayerStateComponent] },
	areas: { components: [CollisionAreaComponent] },
};

export class CollisionAreaVisualizationSystem extends System {
	execute() {
		let scene;
		for (let entity of this.queries.threeGlobals.results) {
			scene = entity.getComponent(THREEGlobalComponent).scene;
			break;
		}

		this.queries.areas.results.forEach((entity) => {
			const area = entity.getMutableComponent(CollisionAreaComponent);
			if (!area.shouldShowIndicator) {
				if (area.indicator) {
					area.indicator.removeFromParent();
					area.indicator = undefined;
				}
				return;
			}
			if (!area.indicator) {
				area.createIndicator();
				scene.add(area.indicator);
			}
		});
	}
}

CollisionAreaVisualizationSystem.queries = {
	areas: { components: [CollisionAreaComponent], listen: { removed: true } },
	threeGlobals: {
		components: [THREEGlobalComponent],
	},
};
