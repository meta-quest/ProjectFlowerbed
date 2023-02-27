/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { LoadingScreenComponent } from '../../components/LoadingScreenComponent';
import { System } from 'ecsy';
import { getOnlyEntity } from '../../utils/entityUtils';

export class LoadingScreenSystem extends System {
	execute() {
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

		/** @type {HTMLElement} */
		const loadingBar = document.querySelector('#loading-bar');
		if (loadingScreen.totalMeshes === 0) {
			console.warn('Loading 0 meshes. Is that right?');
			loadingScreen.isDoneLoading = true;
			return;
		}

		if (loadingScreen.isDoneLoading) {
			loadingBar.style.width = '0%';
			loadingBar.parentElement.classList.remove('loading-button');

			setTimeout(() => {
				// hide the loading bar div
				loadingBar.style.opacity = 0;
			}, 2000);

			// stop this system
			this.stop();
			return;
		}

		const percentage = loadingScreen.loadedMeshes / loadingScreen.totalMeshes;

		// we set the max percentage to 95% so that it's obvious that there is still loading happening even
		// if we have, say, 299/300 models loaded.
		loadingBar.style.width = (100 - percentage * 95).toString() + '%';
	}
}

LoadingScreenSystem.queries = {
	loadingScreen: {
		components: [LoadingScreenComponent],
	},
};
