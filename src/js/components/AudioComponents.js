/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, SystemStateComponent, Types } from 'ecsy';

export class AudioListener extends Component {}

export class OneshotAudioComponent extends Component {
	/**
	 * Creates a OneshotAudioComponent and attaches it to a temporary entity.
	 * Useful for playing a sound without worrying about attaching it to any existing object.
	 * @param {World} world - the world to create the entity in
	 * @param {*} properties - properties of the OneshotAudioComponent, as if you were adding it to an entity.
	 */
	static createSFX(world, properties) {
		const tempEntity = world.createEntity();
		tempEntity.addComponent(OneshotAudioComponent, {
			...properties,
			isTempEntity: true,
		});
	}
}

OneshotAudioComponent.schema = {
	id: { type: Types.String },
	/**
	 * @type {THREE.Vector3} optional. Omit to make the sound non-positional.
	 */
	position: { type: Types.Ref },

	// set to true if the entity that this component is attached to should be destroyed after the sound is played.
	isTempEntity: { type: Types.Boolean, default: false },
};

/**
 * When attached, plays a looping sound.
 * Remove to stop the sound.
 * Doesn't have a specific position field, and instead attaches to an Object3DComponent for positional audio tracking.
 */
export class LoopingAudioComponent extends Component {}

LoopingAudioComponent.schema = {
	id: { type: Types.String },
	fadeInDuration: { type: Types.Number, default: 0 },
	fadeOutDuration: { type: Types.Number, default: 0 },
};

/**
 * Helper component to keep track of sounds that are currently being played. Please do not
 * attach this component manually to entities.
 */
export class LoopingAudioResources extends SystemStateComponent {}

LoopingAudioResources.schema = {
	// id for the sound file
	audioId: { type: Types.String },
	// id for the current sound being played, produced by Howl
	instanceId: { type: Types.Number },
	volume: { type: Types.Number },
	// mirrored from the component so we can use it upon removal.
	fadeOutDuration: { type: Types.Number, default: 0 },
};

export class PlaylistAudioComponent extends Component {}

PlaylistAudioComponent.schema = {
	/**
	 * @type {string[]} all the ids for the sounds that should be looped in the playlist
	 */
	ids: { type: Types.Ref },
	minDelay: { type: Types.Number, default: 0 }, // in ms
	maxDelay: { type: Types.Number, default: 0 }, // in ms
	shuffle: { type: Types.Boolean, default: true },
};

/**
 * Helper component to keep track of a playlist's current state. Please do not attach this component
 * manually to entities.
 */
export class PlaylistAudioResources extends SystemStateComponent {
	getDelay() {
		return Math.max(
			this.minDelay + (this.maxDelay - this.minDelay) * Math.random(),
			0,
		);
	}
}

PlaylistAudioResources.schema = {
	/**
	 * @type {string[]}
	 * all the ids of sounds to be looped.
	 * Note that this is the order that they will be played, and may be different from the order in the
	 * corresponding PlaylistAudioComponent if the playlist has been shuffled.
	 */
	ids: { type: Types.Ref },

	/**
	 * @type {Howl} the Howl audio object for the currently playing sound
	 */
	currentlyPlaying: { type: Types.Ref },

	// the howl id of the current instance of the sound referenced in currentlyPlaying
	currentlyPlayingId: { type: Types.Number },
	minDelay: { type: Types.Number, default: 0 }, // in ms
	maxDelay: { type: Types.Number, default: 0 }, // in ms
};
