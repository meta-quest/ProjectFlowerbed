/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';
import { AssetDatabaseComponent } from '../../components/AssetDatabaseComponent';
import { AssetReplacementSystem } from './AssetReplacementSystem';
import { AssetURLs } from '@config/AssetURLs';
import { AudioDatabase } from '../../lib/databases/AudioDatabase';
import { DEBUG_CONSTANTS } from '../../Constants';
import { LoadingScreenComponent } from '../../components/LoadingScreenComponent';
import { MeshDatabase } from '../../lib/databases/MeshDatabase';
import { MeshPreviewSystem } from '../mesh/MeshPreviewSystem';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { getOnlyEntity } from '../../utils/entityUtils';
import { registerSystemsAfterLoad } from '../../ECSYConfig';

const kMaxMeshes = 568;

export class AssetLoadingSystem extends System {
	init() {
		this.hasStartedLoadingAssets = false;
	}

	/**
	 * Called once when the system is registered to load all the models, finishing setup for
	 * other systems when all the models are loaded.
	 * Currently only loads GLTFs, but will be expanded to load other assets too.
	 *
	 * This is not called in init, because it relies upon the existence of components that may
	 * not have been created in time for init()
	 */
	_loadAssets() {
		const gameManager = getOnlyEntity(this.queries.gameManager);
		const threeConstants = gameManager.getComponent(THREEGlobalComponent);

		if (!getOnlyEntity(this.queries.loadingScreen, false)) {
			const loadingScreenEntity = this.world.createEntity();
			loadingScreenEntity.addComponent(LoadingScreenComponent, {
				totalMeshes: kMaxMeshes,
			});
		}

		this.loadingManager = new THREE.LoadingManager(
			() => {},
			(_url, loaded, total) => {
				const loadingScreen = getOnlyEntity(
					this.queries.loadingScreen,
				).getMutableComponent(LoadingScreenComponent);
				loadingScreen.totalMeshes = Math.max(total, kMaxMeshes);
				loadingScreen.loadedMeshes = loaded;
			},
		);

		// create the asset database entity, and load all of the pieces
		const assetDatabaseEntity = this.world.createEntity();
		const meshDatabase = new MeshDatabase(
			threeConstants.renderer,
			this.loadingManager,
		);

		assetDatabaseEntity.addComponent(AssetDatabaseComponent, {
			meshes: meshDatabase,
			audio: new AudioDatabase(),
		});

		const assetDatabaseComponent = assetDatabaseEntity.getMutableComponent(
			AssetDatabaseComponent,
		);

		this.hasStartedLoadingAssets = true;

		// check if the server is actually running
		let shouldUseLocalhostServer = false;
		const performLoad = async () => {
			const promises = [];
			promises.push(
				assetDatabaseComponent.loadAllMeshes(shouldUseLocalhostServer),
			);
			promises.push(assetDatabaseComponent.loadAllAudio());

			await Promise.all(promises);
			this._onLoad();

			if (shouldUseLocalhostServer) {
				this.world.registerSystem(MeshPreviewSystem);
			}
		};
		if (!DEBUG_CONSTANTS.ENABLE_LOCALHOST_ASSETS) {
			performLoad();
			return;
		}

		// 1 second timeout for the localhost server
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 1000);
		fetch('http://localhost:8080/', { signal: controller.signal })
			.then((_response) => {
				// as long as we get a response, even if it's 404, we use the localhost server.
				shouldUseLocalhostServer = true;

				// make sure we can look for linked models on the localhost server too.
				// unshift so that we look for models on localhost before going for the pre-linked assets.
				AssetURLs.ADDITIONAL_MESH_DIRS.unshift('http://localhost:8080/');

				clearTimeout(timeoutId);
			})
			.catch((_e) => {
				// no-op
			})
			.finally(() => {
				performLoad();
			});
	}

	_onLoad() {
		this.world.registerSystem(AssetReplacementSystem, { priority: -10 });
		registerSystemsAfterLoad(this.world);

		const loadingScreen = getOnlyEntity(
			this.queries.loadingScreen,
		).getMutableComponent(LoadingScreenComponent);
		loadingScreen.isDoneLoading = true;
	}

	execute() {
		if (!this.hasStartedLoadingAssets) {
			this._loadAssets();
		}
	}
}

AssetLoadingSystem.queries = {
	gameManager: {
		components: [THREEGlobalComponent],
	},
	loadingScreen: {
		components: [LoadingScreenComponent],
	},
};
