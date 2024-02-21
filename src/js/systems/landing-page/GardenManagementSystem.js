/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { GameStateComponent } from '../../components/GameStateComponent';
import { LoadingScreenComponent } from '../../components/LoadingScreenComponent';
import { SessionComponent } from '../../components/SessionComponent';
import { StorageInterface } from '../../lib/StorageInterface';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { convertToVRButton } from '../../lib/VRButton';
import { getOnlyEntity } from '../../utils/entityUtils';

export class GardenManagementSystem extends System {
	init() {
		this.checkedForWebXRSupport = false;
		this.createActionBound = false;
	}

	execute(_delta, _time) {
		this.queries.gameManager.results.forEach((entity) => {
			let gameStateComponent = entity.getMutableComponent(GameStateComponent);
			let sessionComponent = entity.getMutableComponent(SessionComponent);
			if (gameStateComponent.gardenListNeedsRefresh) {
				refreshGardenList(gameStateComponent);
				gameStateComponent.gardenListNeedsRefresh = false;
			}

			const loadingScreenEntity = getOnlyEntity(
				this.queries.loadingScreen,
				false,
			);
			if (!loadingScreenEntity) {
				return;
			}

			const loadingScreen = loadingScreenEntity.getMutableComponent(
				LoadingScreenComponent,
			);

			let renderer = entity.getComponent(THREEGlobalComponent).renderer;

			if (!this.checkedForWebXRSupport) {
				this.checkedForWebXRSupport = true;
				if ('xr' in navigator) {
					navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
						if (!supported) {
							sessionComponent.useVR = false;
							this._xrNotAvailable(loadingScreen);
						} else {
							sessionComponent.useVR = true;
						}
					});

					const primaryActionButton = document.getElementById(
						'primary-action-btn',
					);
					const secondaryActionButton = document.getElementById(
						'secondary-action-btn',
					);

					renderer.xr.addEventListener('sessionstart', () => {
						this._primaryButtonDisplay = primaryActionButton.style.display;
						this._secondaryButtonDisplay = secondaryActionButton.style.display;
						primaryActionButton.style.display = 'none';
						secondaryActionButton.style.display = 'none';
					});

					renderer.xr.addEventListener('sessionend', () => {
						primaryActionButton.style.display = this._primaryButtonDisplay;
						secondaryActionButton.style.display = this._secondaryButtonDisplay;
					});
				} else {
					sessionComponent.useVR = false;
					this._xrNotAvailable(loadingScreen);
				}
			}

			if (loadingScreen.isDoneLoading && !this.createActionBound) {
				bindCreateActionToVRButton(
					renderer,
					gameStateComponent,
					sessionComponent,
				);
				this.createActionBound = true;
			}
		});
	}

	_xrNotAvailable(loadingScreen) {
		// abort right away and stop showing the loading button.
		loadingScreen.isDoneLoading = true;
	}
}

GardenManagementSystem.queries = {
	gameManager: {
		components: [GameStateComponent, THREEGlobalComponent, SessionComponent],
	},
	loadingScreen: {
		components: [LoadingScreenComponent],
	},
};

/**
 * Bind create garden action to the create garden in VR button
 * @param {GameStateComponent} gameStateComponent
 */
const bindCreateActionToVRButton = (
	renderer,
	gameStateComponent,
	sessionComponent,
) => {
	let vrGardenButton = document.getElementById('primary-action-btn');
	vrGardenButton.removeAttribute('disabled');

	let onSessionEnded = () => {
		gameStateComponent.gardenListNeedsRefresh = true;
		sessionComponent.exitExperience();
	};

	if (gameStateComponent.currentGardenId) {
		vrGardenButton.textContent = 'Return to your garden';
	} else {
		vrGardenButton.textContent = 'Create new garden';
	}

	convertToVRButton(renderer, vrGardenButton, {
		onClick: () => {
			if (!gameStateComponent.currentGardenId) {
				gameStateComponent.createGardenPending = true;
			}
			sessionComponent.enterExperience();
			vrGardenButton.textContent = 'Return to your garden';
			document
				.getElementById('secondary-action-btn')
				.removeAttribute('disabled');
		},
		onSessionEnded: onSessionEnded,
	});

	// handle the secondary button
	if (gameStateComponent.currentGardenId) {
		document.getElementById('secondary-action-btn').removeAttribute('disabled');
	}

	const createNewMapButton = document.getElementById('create-new-map-btn');
	convertToVRButton(renderer, createNewMapButton, {
		onClick: () => {
			if (gameStateComponent.currentGardenId) {
				// destroy the current garden
				StorageInterface.removeGarden(gameStateComponent.currentGardenId).then(
					() => {
						gameStateComponent.gardenListNeedsRefresh = true;
					},
				);
			}
			sessionComponent.enterExperience();
			gameStateComponent.currentBaseMapId = 'BASE_SCENE';
			gameStateComponent.createGardenPending = true;
		},
		onSessionEnded: onSessionEnded,
	});
};

/**
 * Reload all garden meta from storage, and generate garden cards
 * @param {GameStateComponent} gameStateComponent
 */
const refreshGardenList = async (gameStateComponent) => {
	let gardenMetas = await StorageInterface.fetchAllGardenMeta();
	// sort garden metas by timeLastUpdated
	gardenMetas.sort(
		(a, b) => new Date(b.timeLastUpdated) - new Date(a.timeLastUpdated),
	);

	if (gardenMetas.length > 0) {
		gameStateComponent.currentGardenId = gardenMetas[0].gardenId;
		gameStateComponent.loadGardenPending = true;
	}
};
