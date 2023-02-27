/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { MeshIdComponent } from 'src/js/components/AssetReplacementComponents';
import { Object3DComponent } from 'src/js/components/Object3DComponent';
import { PhotoMenuComponent } from 'src/js/components/ScreenshotCameraComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from 'src/js/components/THREEGlobalComponent';
import { getOnlyEntity } from 'src/js/utils/entityUtils';

export class PhotoMenuCreationSystem extends System {
	init() {
		this.actionMenuEntity = this.world.createEntity();
		const placeholderObject = new THREE.Object3D();
		const scene = getOnlyEntity(this.queries.gameManager).getComponent(
			THREEGlobalComponent,
		).scene;
		scene.add(placeholderObject);
		this.actionMenuEntity.addComponent(Object3DComponent, {
			value: placeholderObject,
		});
		this.actionMenuEntity.addComponent(MeshIdComponent, {
			id: 'CAMERA_ACTION_TILES',
		});
	}

	execute() {
		if (this.actionMenuEntity.getComponent(MeshIdComponent).modelHasChanged) {
			const actionButtons = this.actionMenuEntity.getComponent(
				Object3DComponent,
			).value;

			const deleteButton = actionButtons.getObjectByName('discard_tile');
			const saveButton = actionButtons.getObjectByName('download_tile');
			[deleteButton, saveButton].forEach((tileObject) => {
				tileObject.position.x = -0.15;

				const tileFaceMesh = tileObject.getObjectByName(
					tileObject.name + '_face',
				);

				[...tileObject.children].forEach((node) => {
					if (node != tileFaceMesh && node.isMesh) {
						node.material = new THREE.MeshBasicMaterial({
							color: 0xd3d3d3,
						});
						node.castShadow = false;
					}
				});

				tileFaceMesh.material = new THREE.MeshBasicMaterial({
					map: tileFaceMesh.material.map,
				});
				tileFaceMesh.castShadow = false;
				tileObject.faceMesh = tileFaceMesh;
			});

			this.actionMenuEntity.addComponent(PhotoMenuComponent, {
				deleteButton,
				saveButton,
			});
		}
	}
}

PhotoMenuCreationSystem.queries = {
	gameManager: { components: [THREEGlobalComponent] },
};
