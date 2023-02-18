/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

import { AssetURLs } from '@config/AssetURLs';
import { LocalAssetURLs } from '../config/localURLs/LocalURLs';

export class AssetDatabaseComponent extends Component {
	/**
	 * Loads all of the meshes defined in AssetURLs, with the key being used as the id to retrieve them later
	 * @param attemptGetLocalURLs - Whether or not we will attempt to get the meshes from localhost as a preview first
	 */
	async loadAllMeshes(attemptGetLocalURLs = false) {
		if (!this.updatedMeshes) {
			this.updatedMeshes = [];
		}
		const meshes = AssetURLs.MESHES;
		const ids = Object.keys(meshes);

		let promises = [];
		for (let id of ids) {
			if (attemptGetLocalURLs && LocalAssetURLs[id]) {
				promises.push(this.meshes.load(id, ...LocalAssetURLs[id], meshes[id]));
				continue;
			}
			promises.push(this.meshes.load(id, meshes[id]));
		}

		return Promise.all(promises).then(() => {
			this.updatedMeshes.push(...ids);
			return Promise.resolve();
		});
	}

	/**
	 * This loads a new mesh into the mesh database and also sets a flag on the AssetDatabaseComponent
	 * so that any Object3Ds that were referencing the replaced meshId gets their mesh replaced.
	 * @param {string} meshId id of the mesh to replace, usually a key in AssetURLs.MESHES
	 * @param {string} newMeshURL url to fetch the mesh from
	 */
	replaceMesh(meshId, newMeshURL) {
		if (!this.updatedMeshes) {
			this.updatedMeshes = [];
		}
		this.meshes.load(meshId, newMeshURL).then(() => {
			this.updatedMeshes.push(meshId);
		});
	}

	loadAllAudio() {
		const audio = AssetURLs.AUDIO;
		const ids = Object.keys(audio);

		let promises = [];
		for (let id of ids) {
			let audioArray = [audio[id] + '.webm', audio[id] + '.mp3'];
			// we have to wrap the audio in an array if it isn't already an array
			promises.push(this.audio.load(id, audioArray));
		}

		return Promise.all(promises);
	}
}

AssetDatabaseComponent.schema = {
	/**
	 * @type {import("../lib/databases/AudioDatabase")}
	 */
	audio: { type: Types.Ref },
	/**
	 * @type {import("../lib/databases/MeshDatabase")}
	 */
	meshes: { type: Types.Ref },

	/**
	 * @type {string[]}
	 */
	updatedMeshes: { type: Types.Ref },
};
