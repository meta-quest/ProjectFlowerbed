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

import { BUTTONS } from 'src/js/lib/ControllerInterface';
import { GameStateComponent } from 'src/js/components/GameStateComponent';
import { InteractionSystem } from 'src/js/lib/InteractionSystem';
import { Object3DComponent } from 'src/js/components/Object3DComponent';
import { SeedboxComponent } from 'src/js/components/SeedboxComponents';
import { getOnlyEntity } from 'src/js/utils/entityUtils';
import localforage from 'localforage';

export class SeedboxHandContextualNUXSystem extends InteractionSystem {
	init() {
		this.interactionMode = GameStateComponent.INTERACTION_MODES.PLANTING;
		this._pulseTimer = 0;
		this.timesShown = 0;
		localforage
			.getItem(LOCALSTORAGE_KEYS.SEEN_PLANT_SWITCH_TOOLTIP)
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
		const nuxStateComponent = getOnlyEntity(this.queries.NUXState).getComponent(
			NUXStateComponent,
		);
		if (nuxStateComponent.currentState !== NUX_STEPS.ENDED) {
			return;
		}
		if (!this._seedboxButton) {
			const seedboxMesh = getOnlyEntity(
				this.queries.seedbox,
				false,
			)?.getComponent(Object3DComponent).value;
			this._seedboxButton = seedboxMesh.getObjectByName('Prop_SeedBox_Button');
			this._seedboxButtonFrame = seedboxMesh.getObjectByName(
				'Prop_SeedBox_Button_Frame',
			);
			this._seedboxButton.material.emissive.setHex(0xffffff);
			this._seedboxButtonFrame.material.emissive.setHex(0xffffff);
		} else {
			this._updateButtonGlow();
			this._pulseTimer += delta;
		}
		const secondaryController = this.controllerInterfaces.LEFT;
		if (secondaryController.buttonJustPressed(BUTTONS.BUTTON_1)) {
			this._terminate();
		}
	}

	_terminate() {
		this._seedboxButton.material.emissiveIntensity = 0;
		this._seedboxButtonFrame.material.emissiveIntensity = 0;
		this.stop();
	}

	_updateButtonGlow() {
		const PULSE_DURATION = NUX_CONSTANTS.HAND_NUX_PULSE_DURATION;
		let intensity;
		if (this._pulseTimer > PULSE_DURATION) {
			this._pulseTimer = 0;
			intensity = 0;
			this.controllerInterfaces.LEFT.pulse(0.1, (PULSE_DURATION / 2) * 1000);
		} else if (this._pulseTimer > PULSE_DURATION / 2) {
			intensity = ((PULSE_DURATION - this._pulseTimer) / PULSE_DURATION) * 2;
		} else {
			intensity = (this._pulseTimer / PULSE_DURATION) * 2;
		}
		if (this._seedboxButton) {
			this._seedboxButton.material.emissiveIntensity = intensity;
		}
		if (this._seedboxButtonFrame) {
			this._seedboxButtonFrame.material.emissiveIntensity = intensity;
		}
	}
}

SeedboxHandContextualNUXSystem.addQueries({
	NUXState: {
		components: [NUXStateComponent],
	},
	seedbox: {
		components: [SeedboxComponent, Object3DComponent],
	},
});
