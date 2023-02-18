/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

export class GameStateComponent extends Component {
	/**
	 * Resets interaction mode to the default; this is used
	 * when resetting the garden.
	 */
	resetInteractionMode() {
		this.previousInteractionMode = GameStateComponent.INTERACTION_MODES.DEFAULT;
		this.interactionMode = GameStateComponent.INTERACTION_MODES.DEFAULT;
	}

	setInteractionMode(mode) {
		this.previousInteractionMode = this.interactionMode;
		this.interactionMode = mode;
	}

	changeToLastInteractionMode() {
		this.setInteractionMode(this.previousInteractionMode);
	}

	/**
	 * Set interaction mode to previous mode if mode is the same as previous mode
	 * Set interaction mode to new mode if previous mode is different from previous mode
	 * @param {Number} mode - GameStateComponent.INTERACTION_MODES enum
	 */
	toggleInteractionMode(mode) {
		if (this.interactionMode === mode) {
			this.changeToLastInteractionMode();
		} else {
			this.setInteractionMode(mode);
		}
	}
}

GameStateComponent.INTERACTION_MODES = {
	DEFAULT: 0,
	PLANTING: 1,
	PICKING: 2,
	WATERING: 3,
	CAMERA: 4,
	SETTINGS: 5,
	CONTROLS: 6, // just displays the controls panel
};

GameStateComponent.schema = {
	allAssetsLoaded: { type: Types.Boolean, default: false },

	// garden manager properties
	gardenListNeedsRefresh: { type: Types.Boolean, default: true },
	currentBaseMapId: { type: Types.String, default: 'BASE_SCENE' },
	currentGardenId: { type: Types.String, default: '' },
	createGardenPending: { type: Types.Boolean, default: false },
	loadGardenPending: { type: Types.Boolean, default: false },
	updateGardenPending: { type: Types.Boolean, default: false },

	interactionMode: {
		type: Types.Number,
		default: GameStateComponent.INTERACTION_MODES.DEFAULT,
	},
	previousInteractionMode: {
		type: Types.Number,
		default: GameStateComponent.INTERACTION_MODES.DEFAULT,
	},
	interactionModeOverridden: { type: Types.Boolean, default: false },
};
