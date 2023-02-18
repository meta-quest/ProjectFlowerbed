/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as localforage from 'localforage';
import {
	NUXStateComponent,
	NUX_STEPS,
} from '../../components/NUXStateComponent';

import { LOCALSTORAGE_KEYS } from '../../Constants';
import { NUXSystem } from './NUXSystem';
import { System } from 'ecsy';
import { getOnlyEntity } from '../../utils/entityUtils';

export class ResetNUXSystem extends System {
	init() {
		window.addEventListener('resetnux', () => {
			this._reset();
		});
	}

	async _reset() {
		await localforage.removeItem(LOCALSTORAGE_KEYS.SEEN_NUX);
		const nuxStateEntity = getOnlyEntity(this.queries.nuxState, false);
		// meant that reset was called before the NUX state was initialized
		if (!nuxStateEntity) {
			return;
		}
		const nuxState = nuxStateEntity.getMutableComponent(NUXStateComponent);

		nuxState.shouldShowNUX = true;
		nuxState.setState(NUX_STEPS.BEFORE_START);

		const nuxSystem = this.world.getSystem(NUXSystem);
		if (nuxSystem) {
			nuxSystem.play();
			nuxSystem.init(); // reinitialize to reset some parameters.
		}
	}
}

ResetNUXSystem.queries = {
	nuxState: {
		components: [NUXStateComponent],
	},
};
