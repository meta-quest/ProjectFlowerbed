/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { PlaylistAudioComponent } from '../../components/AudioComponents';
import { SOUNDTRACK } from '@config/SoundtrackIds';
import { SettingsComponent } from '../../components/SettingsComponent';
import { System } from 'ecsy';
import { getOnlyEntity } from '../../utils/entityUtils';

// All this does now is initialize the music entity.
// functionality to play music is in PlaylistAudioSystem.
export class MusicSystem extends System {
	init() {
		this.musicEntity = this.world.createEntity();
		window.addEventListener('experiencestart', () => {
			if (this.enabled) {
				this._addMusic();
			}
		});
		window.addEventListener('experienceend', () => {
			if (this.musicEntity.hasComponent(PlaylistAudioComponent)) {
				this.musicEntity.removeComponent(PlaylistAudioComponent);
			}
		});

		const settings = getOnlyEntity(this.queries.settings, false);
		if (settings) {
			const settingsValues = settings.getComponent(SettingsComponent);
			if (!settingsValues.musicEnabled) {
				// turn this off right away.
				this.stop();
				return;
			}
		}
		this._addMusic();
	}

	stop() {
		if (this.musicEntity.hasComponent(PlaylistAudioComponent)) {
			this.musicEntity.removeComponent(PlaylistAudioComponent);
		}
		super.stop();
	}

	play() {
		super.play();
		this._addMusic();
	}

	_addMusic() {
		if (this.musicEntity.hasComponent(PlaylistAudioComponent)) {
			return;
		}
		this.musicEntity.addComponent(PlaylistAudioComponent, {
			ids: SOUNDTRACK,
		});
	}
}

MusicSystem.queries = {
	settings: {
		components: [SettingsComponent],
	},
};
