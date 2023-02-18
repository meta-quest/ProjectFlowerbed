/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import {
	PlaylistAudioComponent,
	PlaylistAudioResources,
} from '../../components/AudioComponents';

import { AssetDatabaseComponent } from '../../components/AssetDatabaseComponent';
import { Object3DComponent } from '../../components/Object3DComponent';
import { PlayerStateComponent } from '../../components/PlayerStateComponent';
import { System } from 'ecsy';
import { getOnlyEntity } from '../../utils/entityUtils';
import { updateMatrixRecursively } from '../../utils/object3dUtils';

const _vector = new THREE.Vector3();

export class PlaylistAudioSystem extends System {
	init() {
		// play sounds from playlists that were created before
		// audio was initialized
		this.queries.playlistSounds.results.forEach((entity) => {
			this._createPlaylistResources(entity);
		});
	}

	execute() {
		// Handle playlist sounds,
		// which loop an array of sound ids.
		this.queries.playlistSounds.added.forEach((entity) => {
			this._createPlaylistResources(entity);
		});

		this.queries.playlistSounds.removed.forEach((entity) => {
			const playlistResource = entity.getMutableComponent(
				PlaylistAudioResources,
			);

			this._stopPlaylist(playlistResource);
			// remove the resources
			entity.removeComponent(PlaylistAudioResources);
		});

		this.queries.positionalPlaylistSounds.results.forEach((entity) => {
			updateMatrixRecursively(entity.getComponent(Object3DComponent).value);
			entity.getComponent(Object3DComponent).value.getWorldPosition(_vector);
			const position = _vector;
			const playlistResource = entity.getComponent(PlaylistAudioResources);

			if (!playlistResource?.currentlyPlaying) {
				return;
			}

			playlistResource.currentlyPlaying.pos(
				position.x,
				position.y,
				position.z,
				playlistResource.currentlyPlayingId,
			);
		});
	}

	_createPlaylistResources(entity) {
		const loop = entity.getComponent(PlaylistAudioComponent);
		const playlist = [...loop.ids];
		if (loop.shuffle) {
			shuffle(playlist);
		}

		// add resource component to keep track of what's being played
		entity.addComponent(PlaylistAudioResources, {
			ids: playlist,
			currentlyPlaying: undefined,
			minDelay: loop.minDelay,
			maxDelay: loop.maxDelay,
		});

		const playlistResource = entity.getMutableComponent(PlaylistAudioResources);

		const startingDelay = playlistResource.getDelay();
		setTimeout(() => {
			this._playSoundinPlaylist(entity, 0);
		}, startingDelay);
	}

	_playSoundinPlaylist(playlistEntity, trackNumber) {
		const playlistResource = playlistEntity.getMutableComponent(
			PlaylistAudioResources,
		);
		const audioDatabase = getOnlyEntity(
			this.queries.assetDatabase,
		).getComponent(AssetDatabaseComponent)?.audio;

		if (trackNumber >= playlistResource.ids.length) {
			trackNumber = 0;
		}

		const trackId = audioDatabase.play(playlistResource.ids[trackNumber]);
		playlistResource.currentlyPlayingId = trackId;
		playlistResource.currentlyPlaying = audioDatabase.get(
			playlistResource.ids[trackNumber],
		);

		playlistResource.currentlyPlaying.once(
			'play',
			() => {
				if (playlistResource.currentlyPlaying.loop(trackId)) {
					playlistResource.currentlyPlaying.loop(false, trackId);
				}
				// we need to set the position right at start so that we don't end up with
				// weird volume discrepancies when the tab is backgrounded.
				if (playlistEntity.getComponent(Object3DComponent)) {
					const position = playlistEntity.getComponent(Object3DComponent).value
						.position;
					playlistResource.currentlyPlaying.pos(
						position.x,
						position.y,
						position.z,
						trackId,
					);
				}
			},
			trackId,
		);

		playlistResource.currentlyPlaying.once(
			'end',
			() => {
				const actualDelay = playlistResource.getDelay();

				playlistResource.currentlyPlaying = undefined;
				setTimeout(() => {
					this._playSoundinPlaylist(playlistEntity, trackNumber + 1);
				}, actualDelay);
			},
			trackId,
		);
	}

	_stopPlaylist(playlistResource) {
		if (!playlistResource.currentlyPlaying) {
			return;
		}
		playlistResource.currentlyPlaying.off('end');
		playlistResource.currentlyPlaying.stop();
	}
}

PlaylistAudioSystem.queries = {
	assetDatabase: {
		components: [AssetDatabaseComponent],
	},
	playlistSounds: {
		components: [PlaylistAudioComponent],
		listen: { added: true, removed: true, changed: [PlaylistAudioComponent] },
	},
	positionalPlaylistSounds: {
		components: [PlaylistAudioComponent, Object3DComponent],
	},
	player: {
		components: [PlayerStateComponent],
	},
};

// See https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle#The_modern_algorithm
// We should separate this out into arrayUtils once we use it more than once.
function shuffle(array) {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
}
