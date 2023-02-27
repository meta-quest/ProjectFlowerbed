/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

export class SessionComponent extends Component {
	enterExperience() {
		this.justEnteredExperience = true;
		this.isExperienceOpened = true;
	}

	exitExperience() {
		this.isExperienceOpened = false;
	}
}

SessionComponent.schema = {
	// xr state
	isExperienceOpened: { type: Types.Boolean, default: false },
	useVR: { type: Types.Boolean, default: false },

	justEnteredExperience: { type: Types.Boolean, default: false },
	shouldExitExperience: { type: Types.Boolean, default: false },
};
