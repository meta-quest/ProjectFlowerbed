/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
	PlayerColliderComponent,
	PlayerStateComponent,
} from '../../components/PlayerStateComponent';
import { OneshotAudioComponent } from '../../components/AudioComponents';
import { System } from 'ecsy';
import { getOnlyEntity } from '../../utils/entityUtils';

/**
 * System to play footstep sounds as the player walks across the environment.
 * Currently unused; we did not implement a way to switch footstep sound types for different environments,
 * so if enabled this will only play walking-on-grass sounds.
 */
export class FootstepSoundsSystem extends System {
	init() {
		// create a set of the footstep sounds
		this.footstepSounds = [
			'GRASS_FOOTSTEPS_01',
			'GRASS_FOOTSTEPS_02',
			'GRASS_FOOTSTEPS_03',
			'GRASS_FOOTSTEPS_04',
			'GRASS_FOOTSTEPS_05',
			'GRASS_FOOTSTEPS_06',
		];
		this.distanceSinceLastFootstep = 0;
	}

	execute(_delta, _time) {
		// get the player's speed
		// figure out the timer for when footsteps should play
		// when the timer runs out, if player is still moving, play sound, new timer.
		const playerEntity = getOnlyEntity(this.queries.player, false);
		if (!playerEntity) {
			return;
		}

		const playerState = playerEntity.getComponent(PlayerStateComponent);
		if (!playerState.didMove) {
			return;
		}
		const playerCollider = playerEntity.getComponent(PlayerColliderComponent);
		if (!playerCollider.isGrounded && !playerCollider.hasHitSlope) {
			return; // no footsteps while in the air.
		}
		this.distanceSinceLastFootstep += playerState.deltaMovement.length();
		if (this.distanceSinceLastFootstep > 0.3) {
			OneshotAudioComponent.createSFX(this.world, {
				id: this.footstepSounds[
					Math.floor(Math.random() * this.footstepSounds.length)
				],
				position: playerState.viewerTransform.position,
			});
			this.distanceSinceLastFootstep = 0;
		}
	}
}

FootstepSoundsSystem.queries = {
	player: {
		components: [PlayerStateComponent, PlayerColliderComponent],
	},
};
