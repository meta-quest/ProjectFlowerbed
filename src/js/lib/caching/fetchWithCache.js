/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// modifies the fetch API so that it checks the cache API for caches before pulling
// a server fetch.

import * as localforage from 'localforage';
import { CACHE_CONSTANTS } from '../../Constants';

export const initializeCache = async () => {
	if ('caches' in window) {
		const existingUniqueKey = await localforage.getItem('cache_version');
		if (existingUniqueKey === CACHE_CONSTANTS.UNIQUE_KEY) {
			return;
		}

		// clear the cache
		if (caches.has(CACHE_CONSTANTS.CACHE_NAME)) {
			caches.delete(CACHE_CONSTANTS.CACHE_NAME);
		}

		// then recreate it
		await localforage.setItem('cache_version', CACHE_CONSTANTS.UNIQUE_KEY);
	}
};

export const setupFetchWithCache = () => {
	if ('caches' in window) {
		const scopedFetch = window.fetch;
		window.fetch = async (input, init) => {
			const cachable = ['.gltf', '.ktx2', '.webm', '.mp3', '.bin', '.png'];
			let isCachable = false;

			for (let ext of cachable) {
				if (input.url && input.url.endsWith(ext)) {
					isCachable = true;
					break;
				}
			}
			if (!isCachable) {
				return await scopedFetch(input, init);
			}
			const cache = await caches.open(CACHE_CONSTANTS.CACHE_NAME);
			const res = await cache.match(input.url);
			if (!res) {
				const newRes = await scopedFetch(input, init);
				// only cache successful responses.
				if (newRes.status < 400) {
					// clone is needed because cache.put consumes the response body.
					cache.put(input.url, newRes.clone());
				}

				return newRes;
			}
			return res;
		};
	}
};
