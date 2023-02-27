/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
	NUXStateComponent,
	NUX_STEPS,
} from '../../components/NUXStateComponent';
import { BUTTONS } from 'src/js/lib/ControllerInterface';
import { InteractionSystem } from 'src/js/lib/InteractionSystem';
import { NUX_CONSTANTS } from 'src/js/Constants';
import { Object3DComponent } from 'src/js/components/Object3DComponent';
import { getOnlyEntity } from '../../utils/entityUtils';
import { updateMatrixRecursively } from 'src/js/utils/object3dUtils';

export class HandNUXSystem extends InteractionSystem {
	init() {
		this._buttonA = null;
		this._controllerSimplified = false;
		this._pulseTimer = 0;
		this._activated = false;
	}

	onExecute(delta, _time) {
		let controllerModel;
		if (this.controllerInterfaces.RIGHT.controllerModel.children[0]) {
			this.controllerInterfaces.RIGHT.controllerModel.children[0].children.forEach(
				(node) => {
					if (node.name != 'Light' && node.name != 'Camera') {
						controllerModel = node;
					}
				},
			);
		}
		if (!this._controllerSimplified && controllerModel) {
			this._controllerMesh = controllerModel;
			this._simplifyController(controllerModel);
		}

		const handMesh = this.vrControllerComponents.RIGHT.handModelEntity
			.getComponent(Object3DComponent)
			.value.getObjectByName('PlayerElement_Hands');
		if (this._controllerMesh) {
			if (!this._activated) {
				const nuxStateComponent = getOnlyEntity(
					this.queries.nuxState,
				).getComponent(NUXStateComponent);
				if (
					nuxStateComponent.justUpdatedCurrentNUXState &&
					nuxStateComponent.currentState === NUX_STEPS.SEEDBOX_OPEN_MENU
				) {
					this._activated = true;
					this._controllerMesh.visible = true;
					handMesh.visible = false;
				}
			} else {
				if (this._buttonA) {
					this._updateButtonGlow();
					this._pulseTimer += delta;
				}
			}
		}

		if (
			this.controllerInterfaces.RIGHT.buttonJustPressed(BUTTONS.BUTTON_1) ||
			this.controllerInterfaces.RIGHT.buttonJustPressed(BUTTONS.BUTTON_2)
		) {
			if (this._controllerMesh) this._controllerMesh.visible = false;
			handMesh.visible = true;
			this.stop();
		}
	}

	_simplifyController(controllerModel) {
		const controllerGrip = this.controllerInterfaces.RIGHT.controllerModel
			.parent;
		controllerModel.rotateY(Math.PI);
		controllerModel.visible = false;
		controllerGrip.attach(controllerModel);
		const redundantNodes = [];
		controllerModel.traverse((node) => {
			if (!node.isMesh && node.children.length == 0) {
				redundantNodes.push(node);
			}
		});
		redundantNodes.forEach((node) => node.parent.remove(node));

		this._buttonA = controllerModel.getObjectByName(
			'a_button_pressed_value',
		)?.children[0];
		if (this._buttonA) {
			this._buttonA.material = this._buttonA.material.clone();
			this._buttonA.material.emissive.setHex(0xffffff);
		}

		updateMatrixRecursively(controllerModel);
		this._controllerSimplified = true;
	}

	_updateButtonGlow() {
		const PULSE_DURATION = NUX_CONSTANTS.HAND_NUX_PULSE_DURATION;
		let intensity;
		if (this._pulseTimer > PULSE_DURATION) {
			this._pulseTimer = 0;
			intensity = 0;
			this.controllerInterfaces.RIGHT.pulse(0.1, (PULSE_DURATION / 2) * 1000);
		} else if (this._pulseTimer > PULSE_DURATION / 2) {
			intensity = ((PULSE_DURATION - this._pulseTimer) / PULSE_DURATION) * 2;
		} else {
			intensity = (this._pulseTimer / PULSE_DURATION) * 2;
		}
		if (this._buttonA) {
			this._buttonA.material.emissiveIntensity = intensity;
		}
	}
}

HandNUXSystem.addQueries({
	nuxState: {
		components: [NUXStateComponent],
	},
});
