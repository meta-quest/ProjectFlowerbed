/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { LOCALSTORAGE_KEYS, NUX_CONSTANTS } from 'src/js/Constants';
import {
	NUXStateComponent,
	NUX_STEPS,
} from 'src/js/components/NUXStateComponent';

import { GameStateComponent } from 'src/js/components/GameStateComponent';
import { InteractionSystem } from 'src/js/lib/InteractionSystem';
import { Object3DComponent } from 'src/js/components/Object3DComponent';
import { ScreenshotCameraComponent } from 'src/js/components/ScreenshotCameraComponent';
import { TRIGGERS } from 'src/js/lib/ControllerInterface';
import { getOnlyEntity } from 'src/js/utils/entityUtils';
import localforage from 'localforage';

export class CameraHandContextualNUXSystem extends InteractionSystem {
	init() {
		this.interactionMode = GameStateComponent.INTERACTION_MODES.CAMERA;
		this._pulseTimer = 0;
		this.timesShown = 0;
		localforage
			.getItem(LOCALSTORAGE_KEYS.SEEN_CAMERA_SHUTTER_BLINK)
			.then((value) => {
				if (value) {
					this.stop();
				}
			});
	}

	onEnterMode(_delta, _time) {
		const nuxStateComponent = getOnlyEntity(this.queries.NUXState).getComponent(
			NUXStateComponent,
		);
		if (nuxStateComponent.currentState !== NUX_STEPS.ENDED) {
			return;
		}

		this.timesShown += 1;
	}

	onCorrectInteractionMode(delta) {
		if (this.timesShown > 2) {
			this._terminate();
			return;
		}
		if (!this._shutterReleaseButton) {
			const seedboxMesh = getOnlyEntity(
				this.queries.camera,
				false,
			)?.getComponent(Object3DComponent).value;
			this._shutterReleaseButton = seedboxMesh.getObjectByName(
				'shutter_release_button',
			);

			this._shutterReleaseButton.material = this._shutterReleaseButton.material.clone();
			this._shutterReleaseButton.material.emissive.setHex(0xffffff);
		} else {
			this._updateButtonGlow();
			this._pulseTimer += delta;
		}
		const primaryController = this.controllerInterfaces.RIGHT;
		if (primaryController.triggerJustPressed(TRIGGERS.INDEX_TRIGGER)) {
			this._terminate();
		}
	}

	_terminate() {
		localforage.setItem(LOCALSTORAGE_KEYS.SEEN_CAMERA_SHUTTER_BLINK, true);
		this._shutterReleaseButton.material.emissiveIntensity = 0;
		this.stop();
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
		if (this._shutterReleaseButton) {
			this._shutterReleaseButton.material.emissiveIntensity = intensity;
		}
	}
}

CameraHandContextualNUXSystem.addQueries({
	NUXState: {
		components: [NUXStateComponent],
	},
	camera: {
		components: [ScreenshotCameraComponent, Object3DComponent],
	},
});
