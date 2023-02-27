/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';
import * as localforage from 'localforage';

import {
	NUXStateComponent,
	NUX_STEPS,
} from '../../../components/NUXStateComponent';

import { BUTTONS } from '../../../lib/ControllerInterface';
import { GameStateComponent } from '../../../components/GameStateComponent';
import { InteractionSystem } from '../../../lib/InteractionSystem';
import { IsActive } from '../../../components/GameObjectTagComponents';
import { LOCALSTORAGE_KEYS } from '../../../Constants';
import { Object3DComponent } from '../../../components/Object3DComponent';
import { PlayerStateComponent } from '../../../components/PlayerStateComponent';
import { SeedboxComponent } from '../../../components/SeedboxComponents';
import { createTooltip } from '../../../utils/uiUtils';
import { getOnlyEntity } from '../../../utils/entityUtils';
import merge from 'lodash.merge';
import tooltip from '../../../../assets/ui/tooltip-seedbox-change-page.json';
import tooltipTemplate from '../../../../assets/ui/templates/tooltip-no-heading.json';

export class SeedboxChangePageTooltipSystem extends InteractionSystem {
	init() {
		this.interactionMode = GameStateComponent.INTERACTION_MODES.PLANTING;
		this.initAsync();
	}

	async initAsync() {
		const hasSeenTooltip = await localforage.getItem(
			LOCALSTORAGE_KEYS.SEEN_PLANT_SWITCH_TOOLTIP,
		);
		if (hasSeenTooltip) {
			this.stop();
			return;
		}

		let seedboxEntity = getOnlyEntity(this.queries.seedbox);
		let seedboxObject = seedboxEntity.getComponent(Object3DComponent).value;

		this.viewerTransform = getOnlyEntity(this.queries.playerstate).getComponent(
			PlayerStateComponent,
		).viewerTransform;
		this.tooltipEntity = this.world.createEntity();
		createTooltip(
			this.tooltipEntity,
			merge({}, tooltipTemplate, tooltip),
			seedboxObject,
			new THREE.Vector3(0, 0.2, -0.15),
			this.viewerTransform,
		);
		this.timesShown = 0;
	}

	onEnterMode(_delta, _time) {
		const nuxStateComponent = getOnlyEntity(this.queries.NUXState).getComponent(
			NUXStateComponent,
		);
		if (nuxStateComponent.currentState !== NUX_STEPS.ENDED) {
			return;
		}

		if (!this.tooltipEntity.hasComponent(IsActive)) {
			this.tooltipEntity.addComponent(IsActive);
		}

		this.timesShown += 1;

		// only show the tooltip for ~5 seconds
		this.timeout = setTimeout(() => {
			if (this.tooltipEntity.hasComponent(IsActive)) {
				this.tooltipEntity.removeComponent(IsActive);
			}
		}, 5000);
	}

	onCorrectInteractionMode() {
		const secondaryController = this.controllerInterfaces.LEFT;
		if (secondaryController.buttonJustPressed(BUTTONS.BUTTON_1)) {
			// we paged the seedbox, so we can close off the tooltip
			if (this.tooltipEntity.hasComponent(IsActive)) {
				this.tooltipEntity.removeComponent(IsActive);
			}

			// once we successfully change pages, we shouldn't see this tooltip again.
			localforage.setItem(LOCALSTORAGE_KEYS.SEEN_PLANT_SWITCH_TOOLTIP, true);
			this.tooltipEntity.remove();
			this.stop();
		}
	}

	onExitMode(_delta, _time) {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = undefined;
		}

		if (this.tooltipEntity.hasComponent(IsActive)) {
			this.tooltipEntity.removeComponent(IsActive);
		}

		if (this.timesShown > 2) {
			localforage.setItem(LOCALSTORAGE_KEYS.SEEN_PLANT_SWITCH_TOOLTIP, true);
			this.tooltipEntity.remove();
			this.stop();
		}
	}
}

SeedboxChangePageTooltipSystem.addQueries({
	NUXState: {
		components: [NUXStateComponent],
	},
	playerstate: {
		components: [PlayerStateComponent],
	},
	seedbox: {
		components: [SeedboxComponent, Object3DComponent],
	},
});
