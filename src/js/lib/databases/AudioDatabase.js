/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Howl, Howler } from 'howler';
import { defaultPannerNodeOptions, getAudioMix } from '@config/AudioMixing';

import { AssetURLs } from '@config/AssetURLs';

const dbToGain = (dbfs) => {
	return Math.pow(10, dbfs / 20);
};

export class AudioDatabase {
	constructor() {
		this.sounds = {};
	}

	/**
	 *
	 * @param {string} id key to identify the sound with
	 * @param {string[]} audioUrls URLs for each audio file.
	 * @param {HowlOptions} options any additional options to add to an individual sound
	 */
	async load(id, audioUrls, options = {}) {
		const self = this;
		return new Promise((resolve, reject) => {
			const loadedSound = new Howl({
				src: audioUrls,
				...options,
			});
			loadedSound.once('load', () => {
				self.sounds[id] = loadedSound;
				const audioMix = getAudioMix(AssetURLs.AUDIO[id]);
				loadedSound.pannerAttr({
					...defaultPannerNodeOptions,
					maxDistance: audioMix.maxDistance,
					rolloffFactor: audioMix.rolloff,
				});
				resolve();
			});
			loadedSound.once('loaderror', (_soundId, error) => {
				console.error(error);
				reject(error);
			});
		});
	}

	get(id) {
		return this.sounds[id];
	}

	/**
	 * Plays a sound. Returns the instance id of the newly played sound,
	 * which can be used with get(audioId) to perform additional operations
	 * on the sound.
	 * @param {string} id - audio id, to fetch the correct sound
	 * @param {*} fadeInDuration - optional, in milliseconds.
	 * @returns
	 */
	play(id, fadeInDuration = 0) {
		const sound = this.sounds[id];
		const expectedGain = this._getDefaultVolume(id);
		const instanceId = sound.play();
		sound.seek(0, instanceId);
		sound.off('fade', undefined, instanceId);
		if (fadeInDuration) {
			sound.volume(0, instanceId);
		} else {
			sound.volume(expectedGain, instanceId);
		}

		sound.once('play', () => {
			if (fadeInDuration) {
				sound.fade(0, expectedGain, fadeInDuration, instanceId);
			}
		});

		return instanceId;
	}

	stop(id, fadeOutDuration = 0, instanceId) {
		const sound = this.sounds[id];
		if (fadeOutDuration) {
			const expectedVolume = sound.volume(instanceId);
			sound.fade(expectedVolume, 0, fadeOutDuration, instanceId);
			sound.once('fade', () => {
				this.sounds[id].stop(instanceId);
			});
			return;
		}
		sound.stop(instanceId);
	}

	setVolume(id, volumeDb = 0, fadeDuration = 0, instanceId) {
		const expectedGain = dbToGain(volumeDb);
		const sound = this.sounds[id];
		if (fadeDuration) {
			sound.fade(
				sound.volume(instanceId),
				expectedGain,
				fadeDuration,
				instanceId,
			);
			sound.once('fade', () => {
				sound.volume(expectedGain, instanceId);
			});
			return;
		}
		sound.volume(expectedGain, instanceId);
	}

	_getDefaultVolume(id) {
		return dbToGain(getAudioMix(AssetURLs.AUDIO[id]).volume);
	}

	/**
	 * Needs to be called per-frame to move the audio listener.
	 * @param {THREE.Vector3} position - global position of the listener
	 * @param {THREE.Vector3} rotation - global rotation of the listener
	 * @param {THREE.Vector3} up - the up vector. Can be retrieved from an Object3D by calling `object.up`
	 */
	moveListener(position, rotation, up) {
		Howler.pos(position.x, position.y, position.z);
		Howler.orientation(rotation.x, rotation.y, rotation.z, up.x, up.y, up.z);
	}
}
