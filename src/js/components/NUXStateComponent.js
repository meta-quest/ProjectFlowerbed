/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

export const NUX_STEPS = {
	BEFORE_START: 0,
	WELCOME: 1,
	LOCOMOTION: 2,
	SEEDBOX: 3,
	CLOSING: 4,

	// inbetween states.
	// waiting is used when we want to have pauses in between showing NUX panels
	WAITING: 5,

	LOCOMOTION_MOVE_TO: 6,

	SEEDBOX_OPEN_MENU: 7,
	SEEDBOX_OPEN_SEEDBOX: 8,
	SEEDBOX_PLANT_SEED: 9,

	ENDED: 99,
};

export class NUXStateComponent extends Component {
	setState(nuxStep = 5) {
		this.currentState = nuxStep;
		this.justUpdatedCurrentNUXState = true;
	}
}

NUXStateComponent.schema = {
	// set when the (singleton) component is created.
	// if this is set to false, the entire NUX system never starts
	// and setting it to false at any time cleans up the NUX.
	shouldShowNUX: { type: Types.Boolean, default: false },
	currentState: { type: Types.Number, default: 5 }, // by default, the NUX is 'finished', and we set it to 0 when we want to show it.
	justUpdatedCurrentNUXState: { type: Types.Boolean, default: false },
};

export class NUXMovementTriggerArea extends Component {}
NUXMovementTriggerArea.schema = {
	targetPosition: { type: Types.Ref },
};

// identify the different NUX components
// attach this component to the same entity as the rest of the NUX panel
// and the system will show and hide them based upon the currentState
export class NUXPanelComponent extends Component {}
NUXPanelComponent.schema = {
	// the id corresponds to NUX_STEPS above. If the NUX State's
	// currentState is equal to the id, then this panel should be visible
	// in the NUX.
	id: { type: Types.Number, default: 1 },
	delay: { type: Types.Number, default: 0 },

	/**
	 * @type {() => void} A function that is called when the panel is displayed
	 */
	onShow: { type: Types.Ref, default: undefined },
};
