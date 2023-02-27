/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * These are all fake URLs!
 * Project Flowerbed by default only supports saving and loading gardens locally.
 * However, there are bindings in the source code to use a REST API to save and load gardens on the cloud, which can be examined
 * in src/js/lib/StorageInterface.js, and the user-identity portion in src/js/systems/userIdentity/UserIdentitySystem.js
 *
 * This was setup to work wih AWS Lambda URLs (see the server directory), but should work with any properly configured REST server.
 */
export const APIUrls = {
	createPlayer: 'api/to/create/player',
	getPlayerData: 'api/to/get/player',
	createGarden: 'api/to/create/garden',
	listGardens: 'api/to/get/gardens',
	getGardenData: 'api/to/get/garden',
	updateGarden: 'api/to/update/garden',
	deleteGarden: 'api/to/delete/garden',
	copyGarden: 'api/to/copy/garden',
};
