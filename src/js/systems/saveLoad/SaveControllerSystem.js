/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { BUTTONS } from '../../lib/ControllerInterface';
import { InteractionSystem } from '../../lib/InteractionSystem';

/**
 * A debug system used to allow saving and loading gardens via controller
 * Left thumbstick loads (L for Load), while Right thumbstick saves (no memory aid for this one...)
 */
export class SaveControllerSystem extends InteractionSystem {
	onExecute(_delta, _time) {
		if (this.controllerInterfaces.LEFT.buttonJustPressed(BUTTONS.THUMBSTICK)) {
			this.gameStateComponent.updateGardenPending = true;
		}
	}
}

SaveControllerSystem.addQueries({});
