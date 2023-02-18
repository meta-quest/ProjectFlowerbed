/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { BUTTONS } from '../../lib/ControllerInterface';
import { GameStateComponent } from '../../components/GameStateComponent';
import { InteractionSystem } from '../../lib/InteractionSystem';
import { MeshIdComponent } from '../../components/AssetReplacementComponents';
import { MeshPreviewObject } from '../../components/MeshPreviewObjectComponent';
import { Object3DComponent } from '../../components/Object3DComponent';

/**
 * This system should only be enabled if we are using the localhost dev preview system,
 * as it is useless otherwise.
 *
 * In locomotion mode, if you press the button on the left controller, it'll display a 'preview' mesh
 * in place of the left controller (by default a cube). This is more interesting with the localhost
 * dev server, since you can then replace the cube with a version of an asset that can then be previewed
 * on the controller.
 */
export class MeshPreviewSystem extends InteractionSystem {
	constructor(world, attributes) {
		super(world, attributes);
		this.interactionMode = GameStateComponent.INTERACTION_MODES.DEFAULT;
	}

	init() {
		this.addedPreview = false;
		// create the preview object
		this.previewEntity = this.world.createEntity();
		let placeholder = new THREE.Object3D();
		placeholder.visible = false;
		this.previewEntity.addComponent(Object3DComponent, {
			value: placeholder,
		});
		this.previewEntity.addComponent(MeshIdComponent, {
			id: 'DEV_PREVIEW',
		});
		this.previewEntity.addComponent(MeshPreviewObject);
	}

	onEnterMode() {
		if (!this.addedPreview) {
			const previewObject = this.previewEntity.getComponent(Object3DComponent)
				.value;
			const controller = this.controllerInterfaces.LEFT;
			controller._controller.add(previewObject);
			this.addedPreview = true;
		}
	}

	onExitMode() {
		const previewObject = this.previewEntity.getComponent(Object3DComponent)
			.value;
		previewObject.visible = false;
	}

	onCorrectInteractionMode(_delta, _time) {
		// if we're pressing the left controller's face buttons, display the previewObject and put it in
		// front of the controller
		const previewObject = this.previewEntity.getComponent(Object3DComponent)
			.value;
		const controller = this.controllerInterfaces.LEFT;
		if (
			controller.buttonPressed(BUTTONS.BUTTON_1) ||
			controller.buttonPressed(BUTTONS.BUTTON_2)
		) {
			controller.controllerModel.visible = false;
			previewObject.visible = true;
			return;
		}

		// otherwise, we hide it.
		controller.controllerModel.visible = true;
		previewObject.visible = false;
	}
}
