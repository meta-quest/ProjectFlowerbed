/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetURLs } from './AssetURLs';

export const getAudioMix = (assetUrl) => {
	// volume is in db.
	let volume = 0;

	// used only if sound is positional
	let rolloff = 1; // 0-1 - 1 means that it'll be silent further from maxDistance, 0 means the sound won't reduce at all.
	let maxDistance = 100; // distance in meters at which the sound is the quietest it will be.
	switch (assetUrl) {
		case AssetURLs.AUDIO.CAMERA_DELETE:
		case AssetURLs.AUDIO.CAMERA_SAVE:
		case AssetURLs.AUDIO.CAMERA_SHUTTER:
			volume = -8;
			break;
		case AssetURLs.AUDIO.CAMERA_PICTURE_SLIDING:
			volume = -20;
			break;
		case AssetURLs.AUDIO.CHOOSING_SEED:
			volume = -12;
			break;
		case AssetURLs.AUDIO.MENU_OPEN:
		case AssetURLs.AUDIO.MENU_CLOSE:
			volume = -10;
			break;
		case AssetURLs.AUDIO.PLANTING_SEED:
			volume = -8;
			break;
		case AssetURLs.AUDIO.PLANT_GROWTH_LOOP:
			volume = -36;
			break;
		case AssetURLs.AUDIO.PLANT_GROWTH_LOOP_02:
			volume = -30;
			break;
		case AssetURLs.AUDIO.REMOVING_SEED:
			volume = -10;
			break;
		case AssetURLs.AUDIO.SEEDBOX_OPEN:
			volume = -20;
			break;
		case AssetURLs.AUDIO.SEEDBOX_PAGINATE_NEXT:
		case AssetURLs.AUDIO.SEEDBOX_PAGINATE_PREV:
			volume = -10;
			break;
		case AssetURLs.AUDIO.TELEPORT_EXTEND_LINE:
			volume = -21;
			break;
		case AssetURLs.AUDIO.TELEPORT_SNAP_TURN:
			volume = -32;
			break;
		case AssetURLs.AUDIO.TELEPORT:
			volume = -30;
			break;
		case AssetURLs.AUDIO.THROW_SEED:
			volume = -15;
			break;
		case AssetURLs.AUDIO.WATERING_GROUND_LOOP:
		case AssetURLs.AUDIO.WATERING_SEED_LOOP:
			volume = -18;
			break;

		// ambiant
		case AssetURLs.AUDIO.OCEAN_AMBIENT_LOOP:
			volume = -25;
			break;
		case AssetURLs.AUDIO.HEADLOCKED_AMBIENT_LOOP:
			volume = -34;
			rolloff = 0;
			break;

		case AssetURLs.AUDIO.WATER_FLOW_LOOP_01:
		case AssetURLs.AUDIO.WATER_FLOW_LOOP_02:
		case AssetURLs.AUDIO.WATER_FLOW_LOOP_03:
		case AssetURLs.AUDIO.WATER_FLOW_LOOP_04:
			volume = -20;
			maxDistance = 30;
			break;

		case AssetURLs.AUDIO.OCEAN_WAVES_LOOP_01:
		case AssetURLs.AUDIO.OCEAN_WAVES_LOOP_02:
		case AssetURLs.AUDIO.OCEAN_WAVES_LOOP_03:
		case AssetURLs.AUDIO.OCEAN_WAVES_LOOP_04:
			volume = -15;
			maxDistance = 30;
			break;

		// footsteps
		case AssetURLs.AUDIO.GRASS_FOOTSTEPS_01:
		case AssetURLs.AUDIO.GRASS_FOOTSTEPS_02:
		case AssetURLs.AUDIO.GRASS_FOOTSTEPS_03:
		case AssetURLs.AUDIO.GRASS_FOOTSTEPS_04:
		case AssetURLs.AUDIO.GRASS_FOOTSTEPS_05:
		case AssetURLs.AUDIO.GRASS_FOOTSTEPS_06:
			volume = -30;
			break;
		case AssetURLs.AUDIO.DIRT_FOOTSTEPS_01:
		case AssetURLs.AUDIO.DIRT_FOOTSTEPS_02:
		case AssetURLs.AUDIO.DIRT_FOOTSTEPS_03:
		case AssetURLs.AUDIO.DIRT_FOOTSTEPS_04:
		case AssetURLs.AUDIO.DIRT_FOOTSTEPS_05:
			volume = -30;
			break;
		case AssetURLs.AUDIO.STONE_FOOTSTEPS_01:
		case AssetURLs.AUDIO.STONE_FOOTSTEPS_02:
		case AssetURLs.AUDIO.STONE_FOOTSTEPS_03:
		case AssetURLs.AUDIO.STONE_FOOTSTEPS_04:
		case AssetURLs.AUDIO.STONE_FOOTSTEPS_05:
			volume = -30;
			break;
		case AssetURLs.AUDIO.WOOD_FOOTSTEPS_01:
		case AssetURLs.AUDIO.WOOD_FOOTSTEPS_02:
		case AssetURLs.AUDIO.WOOD_FOOTSTEPS_03:
		case AssetURLs.AUDIO.WOOD_FOOTSTEPS_04:
		case AssetURLs.AUDIO.WOOD_FOOTSTEPS_05:
			volume = -30;
			break;

		// fauna
		case AssetURLs.AUDIO.DUCKS_LOOP:
			volume = -27;
			maxDistance = 12;
			break;
		case AssetURLs.AUDIO.SQUIRRELS_LOOP_01:
		case AssetURLs.AUDIO.SQUIRRELS_LOOP_02:
		case AssetURLs.AUDIO.SQUIRRELS_LOOP_03:
		case AssetURLs.AUDIO.SQUIRRELS_LOOP_04:
		case AssetURLs.AUDIO.SQUIRRELS_LOOP_05:
			volume = -27;
			maxDistance = 6;
			break;
		case AssetURLs.AUDIO.SEAGULLS_LOOP_01:
		case AssetURLs.AUDIO.SEAGULLS_LOOP_02:
		case AssetURLs.AUDIO.SEAGULLS_LOOP_03:
		case AssetURLs.AUDIO.SEAGULLS_LOOP_04:
		case AssetURLs.AUDIO.SEAGULLS_LOOP_05:
			volume = -24;
			maxDistance = 30; // needs to be longer because seagulls are flying
			break;

		// music
		case AssetURLs.AUDIO.MUSIC_ARABESQUE:
		case AssetURLs.AUDIO.MUSIC_SPINDLE:
			volume = -33;
			break;
		default:
			volume = -20;
	}
	return {
		volume,
		rolloff,
		maxDistance,
	};
};

// these are all properties used in the WebAudio PannerNode:
// https://developer.mozilla.org/en-US/docs/Web/API/PannerNode
// We use a linear model so that at the maxDistance, the sound is silent.
export const defaultPannerNodeOptions = {
	coneInnerAngle: 360,
	coneOuterAngle: 360,
	coneOuterGain: 0,
	distanceModel: 'linear',
	maxDistance: 1000,
	panningModel: 'HRTF',
	refDistance: 1,
	rolloffFactor: 1,
};
