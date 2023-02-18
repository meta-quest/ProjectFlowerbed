/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { BUTTONS, TRIGGERS } from '../../lib/ControllerInterface';
import {
	SeedbagComponent,
	SeedboxComponent,
} from '../../components/SeedboxComponents';

import { GameStateComponent } from '../../components/GameStateComponent';
import { InteractionSystem } from '../../lib/InteractionSystem';
import { Object3DComponent } from '../../components/Object3DComponent';
import { OneshotAudioComponent } from '../../components/AudioComponents';
import { RayComponent } from 'src/js/components/RayComponents';
import { SEEDBOX_CONSTANTS } from '../../Constants';
import { getOnlyEntity } from '../../utils/entityUtils';
import { updateMatrixRecursively } from '../../utils/object3dUtils';

const INTERACTION_MODES = GameStateComponent.INTERACTION_MODES;

export class SeedboxSystem extends InteractionSystem {
	constructor(world, attributes) {
		super(world, attributes);
		this.interactionMode = INTERACTION_MODES.PLANTING;
	}

	init() {
		this.seedboxEntity = getOnlyEntity(this.queries.seedbox);
		this.plantTypeToSelect = null;
		this.actionToTake = null;
	}

	onEnterMode() {
		const seedboxObject = this.seedboxEntity.getComponent(Object3DComponent)
			.value;
		seedboxObject.visible = true;

		this.uiRayComponent.setRayType(RayComponent.RAY_TYPES.SELECTION_RAY);

		// reset page
		this._flipPage(0);
		updateMatrixRecursively(seedboxObject);
	}

	onExitMode() {
		const seedboxObject = this.seedboxEntity.getComponent(Object3DComponent)
			.value;
		seedboxObject.visible = false;
		this.uiRayComponent.visible = false;
	}

	onCorrectInteractionMode(_delta, _time) {
		const seedboxComponent = this.seedboxEntity.getMutableComponent(
			SeedboxComponent,
		);

		this.uiRayComponent.visible = false;

		if (!seedboxComponent.inFocus) {
			return;
		}

		const seedboxObject = this.seedboxEntity.getComponent(Object3DComponent)
			.value;

		const controller = this.controllerInterfaces.RIGHT;
		const secondaryController = this.controllerInterfaces.LEFT;
		if (secondaryController.buttonJustPressed(BUTTONS.BUTTON_1)) {
			this._flipPage(1);
			OneshotAudioComponent.createSFX(this.world, {
				id: 'SEEDBOX_PAGINATE_NEXT',
			});
		}

		if (seedboxComponent.inSelectionZone) {
			this.uiRayComponent.visible = false;

			this._checkDirectSelection(seedboxComponent.slots, controller);

			updateMatrixRecursively(seedboxObject);
		} else if (seedboxComponent.isPointedAt) {
			this.uiRayComponent.visible = true;

			this._checkIndirectSelection(
				seedboxComponent.slots,
				seedboxObject,
				controller,
			);

			updateMatrixRecursively(seedboxObject);
		}

		if (
			(seedboxComponent.inSelectionZone || seedboxComponent.isPointedAt) &&
			this.plantTypeToSelect &&
			controller.triggerJustPressed(TRIGGERS.INDEX_TRIGGER)
		) {
			OneshotAudioComponent.createSFX(this.world, {
				id: 'CHOOSING_SEED',
				position: controller.getPosition(),
			});
			controller.pulse(0.5, 100);
			this.seedboxEntity
				.getMutableComponent(SeedboxComponent)
				.selectPlantGroup(this.plantTypeToSelect);
		}
	}

	/**
	 * Calculate result page id after flipping through delta number of pages
	 * @param {Number} delta - number of pages to flip through, can be positive/negative
	 */
	_flipPage(deltaPages) {
		const seedboxComponent = this.seedboxEntity.getMutableComponent(
			SeedboxComponent,
		);
		seedboxComponent.currentPageId =
			(seedboxComponent.currentPageId + deltaPages) %
			seedboxComponent.pages.length;
		this.queries.seedbag.results.forEach((entity) => {
			const seedbagComponent = entity.getComponent(SeedbagComponent);
			const seedbagObject = entity.getComponent(Object3DComponent).value;
			seedbagObject.visible =
				seedbagComponent.pageId == seedboxComponent.currentPageId;
			// raycast still intersect with invisble objects, so offset invisible
			// seedbags to avoid incorrect intersect
			seedbagObject.position.z =
				seedbagComponent.pageId == seedboxComponent.currentPageId ? 0 : -0.05;
			updateMatrixRecursively(seedbagObject);
		});
	}

	/**
	 * Check and record seedbags status with direct selection
	 * @param {THREE.Group[]} seedSlots - array of seedbag slot objects
	 * @param {import('../../lib/ControllerInterface').ControllerInterface} controller
	 */
	_checkDirectSelection(seedSlots, controller) {
		let closestSlot = null;
		let closestDistance = Infinity;
		seedSlots.forEach((slotObject) => {
			const grabSpacePosition = controller
				.getPalmPosition()
				.lerp(controller.getPosition(), 0.5);

			const distance = grabSpacePosition.distanceTo(
				slotObject.getWorldPosition(new THREE.Vector3()),
			);

			if (
				distance < SEEDBOX_CONSTANTS.SEED_SELECTION_RADIUS &&
				distance < closestDistance
			) {
				closestDistance = distance;
				closestSlot = slotObject;
			}
		});
		let closestActiveSeedbag = null;
		if (closestSlot) {
			closestSlot.children.forEach((seedbagObject) => {
				if (seedbagObject.visible) {
					closestActiveSeedbag = seedbagObject;
				}
			});
		}

		this._updateSeedbagPosition(seedSlots, closestActiveSeedbag, controller);
	}

	/**
	 * Check and record seedbags status with indirect (ray) selection
	 * @param {THREE.Group[]} seedSlots - array of seedbag slot objects
	 * @param {THREE.Group} seedboxObject
	 * @param {import('../../lib/ControllerInterface').ControllerInterface} controller
	 */
	_checkIndirectSelection(seedSlots, seedboxObject, controller) {
		const raycaster = this.uiRayComponent.raycaster;
		const intersect = raycaster.intersectObjects([seedboxObject])[0];
		const closestActiveSeedbag = intersect?.object.userData.rootObject;

		this._updateSeedbagPosition(seedSlots, closestActiveSeedbag, controller);
	}

	_updateSeedbagPosition(slots, closestActiveSeedbag, controller) {
		slots.forEach((slotObject) => {
			slotObject.children.forEach((seedbagObject) => {
				if (seedbagObject.visible) seedbagObject.position.y = 0;
			});
		});

		if (closestActiveSeedbag) {
			const plantTypeToSelect = closestActiveSeedbag.userData.plantType;
			if (plantTypeToSelect != this.plantTypeToSelect) {
				controller.pulse(0.05, 10);
			}
			this.plantTypeToSelect = plantTypeToSelect;
			closestActiveSeedbag.position.y = 0.02;
		} else {
			this.plantTypeToSelect = null;
		}
	}
}

SeedboxSystem.addQueries({
	seedbox: { components: [SeedboxComponent] },
	seedbag: { components: [SeedbagComponent, Object3DComponent] },
});
