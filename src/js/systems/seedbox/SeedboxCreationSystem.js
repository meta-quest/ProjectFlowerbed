/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { PLANT_GROUPS, SEEDBOX_CONSTANTS } from '../../Constants';
import {
	SeedbagComponent,
	SeedboxComponent,
} from '../../components/SeedboxComponents';

import { MeshIdComponent } from '../../components/AssetReplacementComponents';
import { Object3DComponent } from '../../components/Object3DComponent';
import { PROP_TRANSFORM_OFFSET } from '../../PropsTransformOffset';
import { System } from 'ecsy';
import { VrControllerComponent } from '../../components/VrControllerComponent';
import { getSeedbagMeshId } from '../../utils/plantUtils';

export class SeedboxCreationSystem extends System {
	init() {
		this.plantGroups = [...Object.keys(PLANT_GROUPS)];

		const seedboxObject = new THREE.Object3D();

		this.seedboxEntity = this.world.createEntity();
		this.seedboxEntity.addComponent(Object3DComponent, {
			value: seedboxObject,
		});
		this.seedboxEntity.addComponent(MeshIdComponent, { id: 'SEEDBOX' });
		this.pages = [];
		this.seedbagEntities = [];
		this.slots = [];
		this.seedboxEntity.addComponent(SeedboxComponent, {
			pages: this.pages,
			slots: this.slots,
			plantGroups: this.plantGroups,
		});
	}

	execute(_delta, _time) {
		const seedboxObject = this.seedboxEntity.getComponent(Object3DComponent)
			.value;
		if (this.seedboxEntity.getComponent(MeshIdComponent).modelHasChanged) {
			seedboxObject.visible = false;

			const selectionZoneDimension = SEEDBOX_CONSTANTS.FOCUS_AREA_DIMENSION;
			const collider = new THREE.Mesh(
				new THREE.BoxGeometry(
					selectionZoneDimension.x * 2,
					0.01,
					selectionZoneDimension.z * 2,
				),
				new THREE.MeshBasicMaterial(),
			);
			collider.position.y = -0.03;
			collider.visible = false;
			seedboxObject.add(collider);
			seedboxObject.collider = collider;

			this._createSeedboxPages();
			this._placeSeedbagsInSlots(seedboxObject);
			this.slots.length = 0;
			for (let i = 0; i < SEEDBOX_CONSTANTS.NUM_SLOTS; i++) {
				const slotName = 'slot_' + (i + 1);
				const slotObject = seedboxObject.getObjectByName(slotName);
				this.slots.push(slotObject);
			}
		}
		if (!seedboxObject.parent) {
			this.queries.controllers.results.forEach((entity) => {
				let vrControllerComponent = entity.getComponent(VrControllerComponent);
				if (vrControllerComponent.handedness == 'left') {
					vrControllerComponent.controllerInterface.controllerModel.parent.add(
						seedboxObject,
					);
					const transformOffset = PROP_TRANSFORM_OFFSET['SEEDBOX'];
					seedboxObject.position.fromArray(transformOffset.position);
					seedboxObject.quaternion.fromArray(transformOffset.quaternion);
					seedboxObject.scale.fromArray(transformOffset.scale);
				}
			});
		}
		this.seedbagEntities.forEach((entity) => {
			if (entity.getComponent(MeshIdComponent).modelHasChanged) {
				const seedbagObject = entity.getComponent(Object3DComponent).value;
				seedbagObject.traverse((node) => {
					node.userData.rootObject = seedbagObject;
				});
			}
		});
	}

	/**
	 * Generate pages of seedbags, returning the pages
	 * @returns {THREE.Group} - the pages as a THREE.Group with the seeds as children.
	 */
	_createSeedboxPages() {
		const numPages = Math.ceil(
			this.plantGroups.length / SEEDBOX_CONSTANTS.NUM_SLOTS,
		);

		for (let i = 0; i < numPages; i++) {
			const seedsOnPage = [];
			for (let j = 0; j < SEEDBOX_CONSTANTS.NUM_SLOTS; j++) {
				const plantIndex = i * SEEDBOX_CONSTANTS.NUM_SLOTS + j;
				if (plantIndex == this.plantGroups.length) break;
				const plantType = this.plantGroups[plantIndex];
				const seedbagEntity = this.world.createEntity();

				const seedbagObject = new THREE.Object3D();
				seedsOnPage.push(seedbagObject);
				seedbagObject.userData = { plantType };

				seedbagEntity.addComponent(SeedbagComponent, {
					plantType,
					pageId: i,
				});
				seedbagEntity.addComponent(Object3DComponent, {
					value: seedbagObject,
				});
				seedbagEntity.addComponent(MeshIdComponent, {
					id: getSeedbagMeshId(plantType),
				});
				this.seedbagEntities.push(seedbagEntity);
			}
			this.pages.push(seedsOnPage);
		}
	}

	/**
	 * Place seedbags on every page into the seedbox slots
	 * Called when seedbox model is loaded
	 * @param {THREE.Object3D} seedboxObject
	 */
	_placeSeedbagsInSlots(seedboxObject) {
		this.pages.forEach((seedsOnPage) => {
			seedsOnPage.forEach((seedbagObject, i) => {
				const slotName = 'slot_' + (i + 1);
				const slotObject = seedboxObject.getObjectByName(slotName);
				slotObject.add(seedbagObject);
				seedbagObject.scale.setScalar(0.8);
			});
		});
	}
}

SeedboxCreationSystem.queries = {
	controllers: { components: [VrControllerComponent] },
};
