/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * This is a debug-only system for rapidly changing and previewing UIPanels without needing a rebuild
 * It relies on changing values in the console and then running a window-exposed function
 * to modify the appearance of UIPanels.
 */

import * as THREE from 'three';

import {
	UIPanelComponent,
	UIPanelMedia,
} from '../../components/UIPanelComponent';

import { GazeFollowerComponent } from '../../components/GazeFollowerComponent';
import { IsActive } from '../../components/GameObjectTagComponents';
import { Object3DComponent } from '../../components/Object3DComponent';
import { ObjectFollowerComponent } from '../../components/ObjectFollowerComponent';
import { PlayerStateComponent } from '../../components/PlayerStateComponent';
import { System } from 'ecsy';
import { VrControllerComponent } from '../../components/VrControllerComponent';
import { getOnlyEntity } from '../../utils/entityUtils';

export class UIPanelPreviewSystem extends System {
	init() {
		this.json = '';
		this.viewerTransform = null;
		window.setPanelJSON = (jsonString) => {
			this.json = jsonString;
			return JSON.parse(jsonString);
		};

		window.previewUIPanel = () => {
			try {
				this.regeneratePanel();
			} catch (e) {
				console.log(e);
			}
		};
	}

	execute() {
		const player = getOnlyEntity(this.queries.playerState, false);
		if (player) {
			this.viewerTransform = player.getComponent(
				PlayerStateComponent,
			).viewerTransform;
		}
	}

	regeneratePanel() {
		if (this.entity) {
			this.entity.remove();
		}

		let rightController;
		let leftController;

		this.queries.controllers.results.forEach((entity) => {
			let vrControllerComponent = entity.getComponent(VrControllerComponent);
			if (vrControllerComponent.handedness == 'right') {
				rightController = vrControllerComponent.controllerInterface;
			} else {
				leftController = vrControllerComponent.controllerInterface;
			}
		});

		const jsonObject = JSON.parse(this.json);

		const params = UIPanelComponent.createFromJSON(jsonObject);

		this.entity = this.world.createEntity();
		this.entity.addComponent(Object3DComponent, {
			value: params.uiPanel,
		});

		/*
		Want to preview different offsets for controllers? Add
		a follow object to the top-level JSON in the preview panel to do so!
		The follow object has the following shape:
		{
			offset: [x, y, z],
			target: 'left' | 'right' (for which controller to attach to)
		}
		Unfortunately, no ability to attach to other props at this time.
		*/
		if (jsonObject.follow) {
			let target = this.viewerTransform;
			let offset = new THREE.Vector3();
			let follow = jsonObject.follow;

			if (follow.offset) {
				offset.fromArray(follow.offset);
			}
			switch (follow.target) {
				case 'left':
					target = leftController.grip;
					break;
				case 'right':
					target = rightController.grip;
					break;
			}
			this.entity.addComponent(ObjectFollowerComponent, {
				target,
				offset,
				isChildOfViewerTransform: true,
				velocity: new THREE.Vector3(),
				shouldMoveImmediately: true,
			});
		} else {
			this.entity.addComponent(GazeFollowerComponent, {
				yOffset: -0.1,
				radius: 1.5,
				velocity: new THREE.Vector3(0, 0, 0),
			});
		}

		this.entity.addComponent(UIPanelComponent, {
			...params,
			shouldLookAtCamera: jsonObject.follow ? true : false,
			parent: this.viewerTransform,
		});

		const mediaParams = UIPanelMedia.createFromJSON(JSON.parse(this.json));

		if (mediaParams) {
			this.entity.addComponent(UIPanelMedia, mediaParams);
		}

		setTimeout(() => {
			console.log('activating panel');
			this.entity.addComponent(IsActive);
		}, 1000);
	}
}

UIPanelPreviewSystem.queries = {
	controllers: { components: [VrControllerComponent] },
	playerState: {
		components: [PlayerStateComponent],
	},
};
