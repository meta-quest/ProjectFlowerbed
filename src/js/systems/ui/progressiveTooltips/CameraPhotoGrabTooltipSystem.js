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
import {
	PhotoComponent,
	ScreenshotCameraComponent,
} from '../../../components/ScreenshotCameraComponent';

import { GameStateComponent } from '../../../components/GameStateComponent';
import { InteractionSystem } from '../../../lib/InteractionSystem';
import { IsActive } from '../../../components/GameObjectTagComponents';
import { LOCALSTORAGE_KEYS } from '../../../Constants';
import { Object3DComponent } from '../../../components/Object3DComponent';
import { PlayerStateComponent } from '../../../components/PlayerStateComponent';
import { createTooltip } from '../../../utils/uiUtils';
import { getOnlyEntity } from '../../../utils/entityUtils';
import merge from 'lodash.merge';
import tooltip from '../../../../assets/ui/tooltip-camera-take-photo.json';
import tooltipTemplate from '../../../../assets/ui/templates/tooltip-with-heading.json';

export class CameraPhotoGrabTooltipSystem extends InteractionSystem {
	init() {
		this.interactionMode = GameStateComponent.INTERACTION_MODES.CAMERA;
		this.initAsync();
	}

	async initAsync() {
		const hasSeenTooltip = await localforage.getItem(
			LOCALSTORAGE_KEYS.SEEN_GRAB_PHOTO_TOOLTIP,
		);

		if (hasSeenTooltip) {
			this.stop();
			return;
		}

		let screenshotCameraEntity = getOnlyEntity(this.queries.camera);
		let cameraObject = screenshotCameraEntity.getComponent(Object3DComponent)
			.value;

		this.viewerTransform = getOnlyEntity(this.queries.playerstate).getComponent(
			PlayerStateComponent,
		).viewerTransform;
		this.tooltipEntity = this.world.createEntity();
		createTooltip(
			this.tooltipEntity,
			merge({}, tooltipTemplate, tooltip),
			cameraObject,
			new THREE.Vector3(0, 0.25, -0.15),
			this.viewerTransform,
		);

		const photoClearedEvent = () => {
			if (this.tooltipEntity.hasComponent(IsActive)) {
				this.tooltipEntity.removeComponent(IsActive);
			}

			window.removeEventListener('photocleared', photoClearedEvent);
			localforage.setItem(LOCALSTORAGE_KEYS.SEEN_GRAB_PHOTO_TOOLTIP, true);
			this.tooltipEntity.remove();
			this.stop();
		};

		window.addEventListener('photocleared', photoClearedEvent);
	}

	onExitMode(_delta, _time) {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = undefined;
		}

		if (this.tooltipEntity.hasComponent(IsActive)) {
			this.tooltipEntity.removeComponent(IsActive);
		}
	}

	onCorrectInteractionMode(_delta) {
		if (this.queries.photos.added.length > 0) {
			// this...shouldn't happen, but we check anyway to ensure we're not in NUX first
			const nuxStateComponent = getOnlyEntity(
				this.queries.NUXState,
			).getComponent(NUXStateComponent);
			if (nuxStateComponent.currentState !== NUX_STEPS.ENDED) {
				return;
			}
			if (!this.tooltipEntity.hasComponent(IsActive)) {
				this.tooltipEntity.addComponent(IsActive);
			}
		}

		// called if the photo times out; we shouldn't show this tooltip if there are no photos available.
		if (
			this.tooltipEntity.hasComponent(IsActive) &&
			this.queries.photos.results.length === 0
		) {
			this.tooltipEntity.removeComponent(IsActive);
		}
	}
}

CameraPhotoGrabTooltipSystem.addQueries({
	NUXState: {
		components: [NUXStateComponent],
	},
	playerstate: {
		components: [PlayerStateComponent],
	},
	photos: {
		components: [PhotoComponent],
		listen: { added: true },
	},
	camera: {
		components: [ScreenshotCameraComponent, Object3DComponent],
	},
});
