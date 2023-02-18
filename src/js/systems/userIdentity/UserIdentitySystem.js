/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as bootstrap from 'bootstrap';

import { APIUrls } from 'src/js/ServerConfigs';
import { GameStateComponent } from 'src/js/components/GameStateComponent';
import { StorageInterface } from 'src/js/lib/StorageInterface';
import { System } from 'ecsy';
import { UserIdentityComponent } from 'src/js/components/UserIdentityComponent';
import { getOnlyEntity } from 'src/js/utils/entityUtils';

export class UserIdentitySystem extends System {
	init() {
		const userIdentityEntity = this.world.createEntity();
		userIdentityEntity.addComponent(UserIdentityComponent);
		this.userIdentityComponent = userIdentityEntity.getMutableComponent(
			UserIdentityComponent,
		);
		this.wasSignedIn = false;
		this.viewTokenButton = document.getElementById('view-token-button');
		this.signInButton = document.getElementById('sign-in-button');
		this.playerTokenField = document.getElementById('player-token-display');
		this.createdField = document.getElementById('created');
		this.lastModifiedField = document.getElementById('last-modified');

		this.gameStateComponent = null;

		setupLoginModal(this.userIdentityComponent);
		setupTokenModal(this.userIdentityComponent);
	}

	/**
	 * Retreive player token in browser local storage and verify it
	 */
	_attemptAutoLogin() {
		StorageInterface.getPlayerToken()
			.then((token) => {
				if (!token) {
					this.viewTokenButton.style.display = 'none';
					this.signInButton.style.display = 'inline-block';
					return;
				}
				verifyToken(
					token,
					this.userIdentityComponent,
					() => {
						this.viewTokenButton.style.display = 'inline-block';
						this.signInButton.style.display = 'none';
						this.gameStateComponent.gardenListNeedsRefresh = true;
					},
					() => {
						this.viewTokenButton.style.display = 'none';
						this.signInButton.style.display = 'inline-block';
					},
				);
			})
			.catch((err) => {
				console.log('Retrieve player token failed', err);
			});
	}

	execute(_delta, _time) {
		if (!this.gameStateComponent) {
			const gameStateComponent = getOnlyEntity(
				this.queries.gameManager,
				false,
			)?.getMutableComponent(GameStateComponent);

			if (gameStateComponent) {
				this._attemptAutoLogin();
				this.gameStateComponent = gameStateComponent;
			}
		}

		const isSignedIn = this.userIdentityComponent.playerToken != '';

		if (isSignedIn && !this.wasSignedIn) {
			this.viewTokenButton.style.display = 'inline-block';
			this.signInButton.style.display = 'none';
			this.playerTokenField.value = this.userIdentityComponent.playerToken;
			this.createdField.innerHTML = `Created: ${this.userIdentityComponent.created}`;
			this.lastModifiedField.innerHTML = `Last Modified: ${this.userIdentityComponent.lastModified}`;
			this.gameStateComponent.gardenListNeedsRefresh = true;
		} else if (!isSignedIn && this.wasSignedIn) {
			this.viewTokenButton.style.display = 'none';
			this.signInButton.style.display = 'inline-block';
			this.gameStateComponent.gardenListNeedsRefresh = true;
		}

		this.wasSignedIn = isSignedIn;
	}
}

UserIdentitySystem.queries = {
	gameManager: {
		components: [GameStateComponent],
	},
};

/**
 * Generate a new player token with lambda API
 * @param {UserIdentityComponent} userIdentityComponent
 * @param {*} successAction - callback on success
 * @param {*} failAction - callback on fail
 */
const generateNewToken = (
	userIdentityComponent,
	successAction = () => {},
	failAction = () => {},
) => {
	fetch(APIUrls.createPlayer, {
		method: 'POST',
		body: '',
	})
		.then((response) => {
			if (!response.ok) {
				failAction();
				throw Error(response.statusText);
			} else {
				return response.json();
			}
		})
		.then((response) => {
			userIdentityComponent.playerToken = response['playerToken'];
			userIdentityComponent.created = 'Just Now';
			userIdentityComponent.lastModified = 'Just Now';
			StorageInterface.updatePlayerToken(userIdentityComponent.playerToken);

			successAction();
		})
		.catch((error) => console.log(error));
};

/**
 * Verify and fetch data from token with lambda API
 * @param {String} token - player token
 * @param {UserIdentityComponent} userIdentityComponent
 * @param {*} successAction - callback on success
 * @param {*} failAction - callback on fail
 */
const verifyToken = (
	token,
	userIdentityComponent,
	successAction = () => {},
	failAction = () => {},
) => {
	const params = { token: token };
	fetch(APIUrls.getPlayerData, {
		method: 'POST',
		body: JSON.stringify(params),
	})
		.then((response) => {
			if (!response.ok) {
				failAction();
				throw Error(response.statusText);
			} else {
				return response.json();
			}
		})
		.then((response) => {
			userIdentityComponent.playerToken = params.token;
			userIdentityComponent.created = response['created'];
			userIdentityComponent.lastModified = response['lastModified'];
			StorageInterface.updatePlayerToken(userIdentityComponent.playerToken);
			successAction();
		})
		.catch((error) => console.log(error));
};

/**
 * Setup logic for UI elements in the login modal
 * @param {UserIdentityComponent} userIdentityComponent
 */
const setupLoginModal = (userIdentityComponent) => {
	const generateNewTokenButton = document.getElementById('generate-new-token');
	const verifyTokenButton = document.getElementById('verify-token');
	const tokenField = document.getElementById('player-token-input');
	const loginModal = new bootstrap.Modal(
		document.getElementById('login-modal'),
		{},
	);
	generateNewTokenButton.onclick = () => {
		generateNewToken(userIdentityComponent, () => {
			loginModal.toggle();
		});
	};
	verifyTokenButton.onclick = () => {
		verifyToken(tokenField.value, userIdentityComponent, () => {
			loginModal.toggle();
		});
	};
	verifyTokenButton.disabled = true;
	tokenField.addEventListener('change', () => {
		verifyTokenButton.disabled = tokenField.value.length != 6;
	});
};

/**
 * Setup logic for UI elements in the token modal
 * @param {UserIdentityComponent} userIdentityComponent
 */
const setupTokenModal = (userIdentityComponent) => {
	const logoutButton = document.getElementById('log-out');
	const tokenModal = new bootstrap.Modal(
		document.getElementById('token-modal'),
		{},
	);
	logoutButton.onclick = () => {
		userIdentityComponent.playerToken = '';
		StorageInterface.updatePlayerToken(null);
		tokenModal.toggle();
	};
};
