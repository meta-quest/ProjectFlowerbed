/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as localForage from 'localforage';

import { APIUrls } from '../ServerConfigs';
import { v4 as uuidv4 } from 'uuid';

const GARDEN_META_ID_SUFFIX = '_meta';
const GARDEN_DATA_ID_SUFFIX = '_data';

/**
 * @typedef {Object} GardenMeta
 * @property {string} gardenName
 * @property {string} gardenId
 * @property {number} timeCreated
 * @property {number} timeLastUpdated
 */

/**
 * @typedef {Object} GardenData
 * @property {string} gardenId
 * @property {string} gardenData
 */

export const StorageInterface = (function () {
	let verifiedPlayerToken = null; // eslint-disable-line no-unused-vars

	function getDatestring() {
		var dateUtil = new Date();
		let date = dateUtil.getDate();
		let month = dateUtil.getMonth();
		let year = dateUtil.getFullYear();
		return month + '/' + date + '/' + year;
	}

	return {
		/**
		 * Create empty save with garden meta data
		 * @returns {Promise<string>} garden id
		 */
		createGarden: async function () {
			if (verifiedPlayerToken) {
				return StorageInterface.createGardenCloud();
			} else {
				return StorageInterface.createGardenLocal();
			}
		},

		/**
		 * Update existing garden save data
		 * @param {string} gardenId
		 * @param {*} gardenData
		 * @returns {Promise<string>} garden id
		 */
		updateGarden: async function (gardenId, gardenData) {
			if (gardenId.startsWith('cloud-')) {
				return await StorageInterface.updateGardenCloud(gardenId, gardenData);
			} else {
				return await StorageInterface.updateGardenLocal(gardenId, gardenData);
			}
		},

		/**
		 * Load the garden save data of a garden id
		 * @param {string} gardenId
		 * @returns {Promise<GardenData>} garden data
		 */
		loadGardenData: async function (gardenId) {
			if (gardenId.startsWith('cloud-')) {
				return await StorageInterface.loadGardenDataCloud(gardenId);
			} else {
				return await StorageInterface.loadGardenDataLocal(gardenId);
			}
		},

		/**
		 * Fetch a list of all garden meta data
		 * @returns {Promise<GardenMeta[]>}
		 */
		fetchAllGardenMeta: async function () {
			const localGardenMetas = await StorageInterface.fetchAllGardenMetaLocal();
			let cloudGardenMetas = [];

			if (verifiedPlayerToken) {
				cloudGardenMetas = await StorageInterface.fetchAllGardenMetaCloud();
			}

			return cloudGardenMetas.concat(localGardenMetas);
		},

		/**
		 * Remove meta data and save data for a garden
		 * @param {string} gardenId
		 */
		removeGarden: async function (gardenId) {
			if (gardenId.startsWith('cloud-')) {
				return await StorageInterface.removeGardenCloud(gardenId);
			} else {
				return await StorageInterface.removeGardenLocal(gardenId);
			}
		},

		/**
		 * Create a copy of the garden of gardenId
		 * @param {string} gardenId
		 * @returns {Promise<string>} new garden id
		 */
		duplicateGarden: async function (gardenMeta) {
			if (gardenMeta.gardenId.startsWith('cloud-')) {
				return await StorageInterface.duplicateGardenCloud(gardenMeta);
			} else {
				return await StorageInterface.duplicateGardenLocal(gardenMeta);
			}
		},

		/**
		 * Update the playerToken stored
		 * @param {string} playerToken
		 */
		updatePlayerToken: async function (playerToken) {
			verifiedPlayerToken = playerToken;
			await localForage.setItem('playerToken', playerToken);
		},

		/**
		 * Get the stored playerToken
		 * @returns {Promise<string>} playerToken
		 */
		getPlayerToken: async function () {
			return await localForage.getItem('playerToken');
		},

		createGardenCloud: async function () {
			const response = await fetch(APIUrls.createGarden, {
				method: 'POST',
				body: JSON.stringify({ token: verifiedPlayerToken }),
			});
			if (!response.ok) {
				console.log('Error: cannot create garden in cloud');
				return null;
			} else {
				const responseBody = await response.json();
				return 'cloud-' + responseBody['gardenId'];
			}
		},

		createGardenLocal: async function () {
			let timeCreated = Date.now();
			let gardenId = uuidv4();
			let gardenName = 'Garden ' + getDatestring();
			await localForage.setItem(gardenId + GARDEN_META_ID_SUFFIX, {
				gardenName: gardenName,
				gardenId: gardenId,
				gardenMapId: 'BASE_SCENE',
				timeCreated: timeCreated,
				timeLastUpdated: timeCreated,
			});
			await localForage.setItem(gardenId + GARDEN_DATA_ID_SUFFIX, {
				gardenId: gardenId,
				gardenData: [],
			});
			return gardenId;
		},

		fetchAllGardenMetaCloud: async function () {
			const gardenMetas = [];
			const response = await fetch(APIUrls.listGardens, {
				method: 'POST',
				body: JSON.stringify({ token: verifiedPlayerToken }),
			});
			if (!response.ok) {
				console.log('Error: cannot create garden in cloud');
			} else {
				const responseBody = await response.json();
				responseBody['gardens'].forEach((garden) => {
					gardenMetas.push({
						gardenName: 'Cloud Garden ' + garden['id'],
						gardenId: 'cloud-' + garden['id'],
						gardenMapId: 'BASE_SCENE',
						timeCreated: garden['created'],
						timeLastUpdated: garden['lastModified'],
					});
				});
			}
			return gardenMetas;
		},

		fetchAllGardenMetaLocal: async function () {
			const gardenMetas = [];
			const keys = await localForage.keys();
			for (let key of keys) {
				if (key.endsWith(GARDEN_META_ID_SUFFIX)) {
					let gardenMeta = await localForage.getItem(key);
					gardenMetas.push(gardenMeta);
				}
			}
			return gardenMetas;
		},

		loadGardenDataCloud: async function (gardenId) {
			const response = await fetch(APIUrls.getGardenData, {
				method: 'POST',
				body: JSON.stringify({
					token: verifiedPlayerToken,
					gardenId: gardenId.substring(6),
				}),
			});
			if (!response.ok) {
				console.log('Error: cannot create garden in cloud');
			} else {
				const responseBody = await response.json();
				return JSON.parse(responseBody.gardenData);
			}
		},

		loadGardenDataLocal: async function (gardenId) {
			return localForage
				.getItem(gardenId + GARDEN_DATA_ID_SUFFIX)
				.then(function (value) {
					return value.gardenData;
				});
		},

		updateGardenCloud: async function (gardenId, gardenData) {
			const response = await fetch(APIUrls.updateGarden, {
				method: 'POST',
				body: JSON.stringify({
					token: verifiedPlayerToken,
					gardenId: gardenId.substring(6),
					gardenData: JSON.stringify(gardenData),
				}),
			});
			if (!response.ok) {
				console.log('Error: cannot update garden in cloud');
			} else {
				const responseBody = await response.json();
				const gardenMeta = {
					gardenName: 'Cloud Garden ' + gardenId.substring(6),
					gardenId: gardenId,
					gardenMapId: 'BASE_SCENE',
					// issue here
					timeCreated: responseBody['lastModified'],
					timeLastUpdated: responseBody['lastModified'],
				};
				console.log(gardenMeta);
				return gardenMeta;
			}
		},

		updateGardenLocal: async function (gardenId, gardenData) {
			let timeUpdated = Date.now();
			let gardenMeta = await localForage.getItem(
				gardenId + GARDEN_META_ID_SUFFIX,
			);
			gardenMeta.timeLastUpdated = timeUpdated;
			await localForage.setItem(gardenId + GARDEN_META_ID_SUFFIX, gardenMeta);
			await localForage.setItem(gardenId + GARDEN_DATA_ID_SUFFIX, {
				gardenId: gardenId,
				gardenData: gardenData,
			});
			return gardenMeta;
		},

		removeGardenCloud: async function (gardenId) {
			const response = await fetch(APIUrls.deleteGarden, {
				method: 'POST',
				body: JSON.stringify({
					token: verifiedPlayerToken,
					gardenId: gardenId.substring(6),
				}),
			});
			if (!response.ok) {
				console.log('Error: cannot delete garden in cloud');
			} else {
				const responseBody = await response.json();
				console.log(responseBody);
			}
		},

		removeGardenLocal: async function (gardenId) {
			await localForage.removeItem(gardenId + GARDEN_META_ID_SUFFIX);
			await localForage.removeItem(gardenId + GARDEN_DATA_ID_SUFFIX);
			// no need to return anything as removeItem will fail silently when there
			// is no such key in the database
		},

		duplicateGardenCloud: async function (gardenMeta) {
			const response = await fetch(APIUrls.copyGarden, {
				method: 'POST',
				body: JSON.stringify({
					token: verifiedPlayerToken,
					gardenId: gardenMeta.gardenId.substring(6),
				}),
			});
			if (!response.ok) {
				console.log('Error: cannot duplicate garden in cloud');
			} else {
				const responseBody = await response.json();
				return responseBody.gardenId;
			}
		},

		duplicateGardenLocal: async function (gardenMeta) {
			if (gardenMeta.gardenId.startsWith('cloud-')) {
				return;
			} else {
				const gardenData = await StorageInterface.loadGardenData(
					gardenMeta.gardenId,
				);
				const newGardenId = await StorageInterface.createGarden();
				await StorageInterface.updateGarden(newGardenId, gardenData);
				return newGardenId;
			}
		},

		loadSettings: async function () {
			const settings = await localForage.getItem('settings');
			return settings || {};
		},

		/**
		 * @param settings - this should be the serialized form of the SettingsComponent
		 */
		saveSettings: async function (settings) {
			return await localForage.setItem('settings', settings);
		},
	};
})();
