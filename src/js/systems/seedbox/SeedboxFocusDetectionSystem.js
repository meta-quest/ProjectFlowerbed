/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { GameStateComponent } from 'src/js/components/GameStateComponent';
import { InteractionSystem } from 'src/js/lib/InteractionSystem';
import { Object3DComponent } from 'src/js/components/Object3DComponent';
import { SEEDBOX_CONSTANTS } from 'src/js/Constants';
import { SeedboxComponent } from 'src/js/components/SeedboxComponents';
import { getOnlyEntity } from 'src/js/utils/entityUtils';

export class SeedboxFocusDetectionSystem extends InteractionSystem {
	constructor(world, attributes) {
		super(world, attributes);
		this.interactionMode = GameStateComponent.INTERACTION_MODES.PLANTING;
	}

	init() {
		this.seedboxEntity = getOnlyEntity(this.queries.seedbox);
	}

	onCorrectInteractionMode(_delta, _time) {
		const seedboxComponent = this.seedboxEntity.getMutableComponent(
			SeedboxComponent,
		);
		const seedboxObject = this.seedboxEntity.getComponent(Object3DComponent)
			.value;

		const playerHead = this.playerStateComponent.playerHead;
		const seedboxPosition = seedboxObject.getWorldPosition(new THREE.Vector3());
		const headPosition = playerHead.getWorldPosition(new THREE.Vector3());

		const seedboxAngleToHead = playerHead
			.worldToLocal(seedboxPosition)
			.angleTo(new THREE.Vector3(0, 0, -1));

		const headAngleToSeedbox = seedboxObject
			.worldToLocal(headPosition)
			.angleTo(new THREE.Vector3(0, 1, 0));

		seedboxComponent.inFocus =
			headAngleToSeedbox <= SEEDBOX_CONSTANTS.HEADSET_TO_SEEDBOX_VIEW_ANGLE &&
			seedboxAngleToHead <= SEEDBOX_CONSTANTS.SEEDBOX_TO_HEADSET_VIEW_ANGLE;

		const controller = this.controllerInterfaces.RIGHT;

		const localCoordinates = seedboxObject.worldToLocal(
			controller.getPalmPosition(),
		);

		seedboxComponent.inSelectionZone =
			Math.abs(localCoordinates.x) <=
				SEEDBOX_CONSTANTS.FOCUS_AREA_DIMENSION.x &&
			Math.abs(localCoordinates.z) <=
				SEEDBOX_CONSTANTS.FOCUS_AREA_DIMENSION.z &&
			localCoordinates.y >= SEEDBOX_CONSTANTS.FOCUS_AREA_DIMENSION.yBack &&
			localCoordinates.y <= SEEDBOX_CONSTANTS.FOCUS_AREA_DIMENSION.yFront;

		seedboxComponent.isPointedAt =
			this.targetRayComponent.raycaster.intersectObject(seedboxObject.collider)
				.length != 0;
	}
}

SeedboxFocusDetectionSystem.addQueries({
	seedbox: { components: [SeedboxComponent, Object3DComponent] },
});
