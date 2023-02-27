/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

// Number.EPSILON is the smallest value between 1 and the number greater than 1, represented as floating
// point numbers. The value is often too small to be used as a proper epsilon for comparisons, as
// errors built up from mathematical operations can end up producing error greater than that very small value
// So we define our own epsilon here.
export const EPSILON = 0.000001;
export const EPSILON_SQUARED = EPSILON * EPSILON;

// should all be set to false on release.
const DEBUG_CONSTANTS = {
	ENABLE_LOCALHOST_ASSETS: false, // whether to look for assets on localhost:8080
	SHOULD_SHOW_NUX: true,
	SHOW_RESET_NUX_BUTTON: false, // use to show debug buttons on 2d landing page that resets the NUX
	ENABLE_UI_PREVIEW_SYSTEM: false, // adds extra functions to the window to edit and preview UI panels
	SHOW_STATIC_COLLIDERS: false, // visibility for colliders in the collision world
	SHOW_SEEDBOX_COLLIDERS: false, // visibility for colliders in the seedbox
	SHOW_FAUNA_BOUNDARIES: false,
	SHOW_FAUNA_COLLIDERS: false,
	DEBUG_FAUNA_RESPAWN: false,
	USE_SANDBOX_ENVIRONMENT: false, // enable to load the sandbox environment, which loads much faster than the main
	// environment at the cost of not being able to test any environment features. Do not land any diffs where this is set to true!
	LOCK_VIEW_FOR_PERF_TESTS: false,
	SUPPRESS_CONTROLS_PANEL: false,
	DISABLE_LAND_FAUNA: true,
	DISABLE_WATER_FAUNA: false,
	DISABLE_AIR_FAUNA: false,
};

const CACHE_CONSTANTS = {
	CACHE_NAME: 'flowerbed-asset-cache',

	// the unique key is used to validate the cache; if we change it on a build,
	// the whole cache will empty on next load.
	UNIQUE_KEY: 'v1',
};

const LOCOMOTION_CONSTANTS = {
	SNAP_TURN_ANGLE_MIN: (Math.PI / 180) * 30,
	SNAP_TURN_ANGLE_MAX: (Math.PI / 180) * 150,
	SNAP_TURN_VALUE_MIN: 0.8,
	SNAP_TURN_LEFT_QUAT: new THREE.Quaternion(0, 0.3826834, 0, 0.9238795),
	SNAP_TURN_RIGHT_QUAT: new THREE.Quaternion(0, -0.3826834, 0, 0.9238795),
	TELEPORT_BACKWARD_ANGLE_MIN: (Math.PI / 180) * 150,
	TELEPORT_BACKWARD_ANGLE_MAX: (Math.PI / 180) * 180,
	TELEPORT_FORWARD_ANGLE_MIN: (Math.PI / 180) * 0,
	TELEPORT_FORWARD_ANGLE_MAX: (Math.PI / 180) * 30,
	TELEPORT_VALUE_MIN: 0.8,
	TELEPORT_BUFFER_RADIUS: 0.75, // minimum distance from obstacles for valid teleports
	TELEPORT_SHORT_DISTANCESQ_THRESHOLD: 5 * 5, // distance squared for the point at which we we differ between playing the 'short' teleport sound and the 'long' teleport sound.
	JOYSTICK_STATE: {
		DISENGAGED: 0,
		LEFT: 1,
		RIGHT: 2,
		BACK: 3,
	},
	MAX_MOVEMENT_SPEED: 3.0,
	// todo: take this from a tag in the gltf
	INITIAL_POSITION: {
		BASE_SCENE: new THREE.Vector3(0.0, 7.0, 0.0),
	},
};

const SEEDBOX_CONSTANTS = {
	NUM_SLOTS: 9,
	FOCUS_AREA_DIMENSION: { x: 0.14, yFront: 0.1, yBack: -0.06, z: 0.14 },
	SEEDBOX_TO_HEADSET_VIEW_ANGLE: Math.PI / 4,
	HEADSET_TO_SEEDBOX_VIEW_ANGLE: Math.PI / 3,
	SEED_SELECTION_RADIUS: 0.07,
};

const PLANTING_CONSTANTS = {
	SEEDBOX_WRIST_OFFSET: new THREE.Vector3(0, 0.2, 0),
	PLANT_INITIAL_OFFSET: new THREE.Vector3(0, 0, 0),
	// PICKED_TIME_TO_LIVE indicates the time in seconds that a picked plant has
	// before being completely purged from the threejs scene and ECSY world when
	// flying away
	PICKED_TIME_TO_LIVE: 5,
	PICKED_FLYING_SPEED: 25,
	PICKED_FLYING_AWAY_DIRECTION: new THREE.Vector3(0, 1, 0),

	SEED_FLYING_SPEED: 10,
};

// The values of each plant type should be the name of one of the plants listed in
// AssetURLs (the string after `PLANT_`). Other parts of the code will automatically
// fetch models from the mesh database based on the PLANT_TYPE value.
// The order listed here is also the order that these plants will appear in the seedbox, for now.
export const PLANT_TYPES = {
	PANSY_A: 'pansy_a',
	PANSY_B: 'pansy_b',
	PANSY_C: 'pansy_c',
	ROSE_A: 'rose_a',
	ROSE_B: 'rose_b',
	ROSE_C: 'rose_c',
	ROSE_D: 'rose_d',
	TULIP: 'tulip',
	TULIP_A: 'tulip_a',
	TULIP_B: 'tulip_b',
	TULIP_C: 'tulip_c',
	TULIP_D: 'tulip_d',
	FIR: 'fir',
	CARNATION_A: 'carnation_a',
	CARNATION_B: 'carnation_b',
	DAFFODIL_A: 'daffodil_a',
	DAFFODIL_B: 'daffodil_b',
	SUCCULENT_A: 'succulent_a',
	SUCCULENT_B: 'succulent_b',
	SUCCULENT_C: 'succulent_c',
	ALLIUM_A: 'allium_a',
	ALLIUM_B: 'allium_b',
	ALLIUM_C: 'allium_c',
	SUNFLOWER_A: 'sunflower_a',
	SUNFLOWER_B: 'sunflower_b',
	SUGARPINE: 'sugarpine',
	LAVENDER_A: 'lavender_a',
	LAVENDER_B: 'lavender_b',
	CHERRYBLOSSOM: 'cherryblossom',
	OAK: 'oak',
	NASTURTIUM_A: 'nasturtium_a',
	NASTURTIUM_B: 'nasturtium_b',
	NASTURTIUM_C: 'nasturtium_c',
};

export const PLANT_GROUPS = {};
// Page 1
PLANT_GROUPS['allium_a'] = ['allium_a'];
PLANT_GROUPS['allium_b'] = ['allium_b'];
PLANT_GROUPS['allium_c'] = ['allium_c'];
PLANT_GROUPS['sunflower_a'] = ['sunflower_a'];
PLANT_GROUPS['sunflower_b'] = ['sunflower_b'];
PLANT_GROUPS['oak'] = ['oak'];
PLANT_GROUPS['sugarpine'] = ['sugarpine'];
PLANT_GROUPS['fir'] = ['fir']; //cedar hedge
PLANT_GROUPS['cherryblossom'] = ['cherryblossom'];

// Page 2
PLANT_GROUPS['nasturtium_a'] = ['nasturtium_a'];
PLANT_GROUPS['nasturtium_b'] = ['nasturtium_b'];
PLANT_GROUPS['nasturtium_c'] = ['nasturtium_c'];
PLANT_GROUPS['tulip_a'] = ['tulip_a'];
PLANT_GROUPS['tulip_b'] = ['tulip_b'];
PLANT_GROUPS['tulip_c'] = ['tulip_c'];
PLANT_GROUPS['tulip_d'] = ['tulip_d'];
PLANT_GROUPS['carnation_a'] = ['carnation_a'];
PLANT_GROUPS['carnation_b'] = ['carnation_b'];

// Page 3
PLANT_GROUPS['daffodil_a'] = ['daffodil_a'];
PLANT_GROUPS['daffodil_b'] = ['daffodil_b'];
PLANT_GROUPS['rose_a'] = ['rose_a'];
PLANT_GROUPS['rose_b'] = ['rose_b'];
PLANT_GROUPS['rose_c'] = ['rose_c'];
PLANT_GROUPS['rose_d'] = ['rose_d'];
PLANT_GROUPS['pansy_a'] = ['pansy_a'];
PLANT_GROUPS['pansy_b'] = ['pansy_b'];
PLANT_GROUPS['pansy_C'] = ['pansy_c'];

// Page 4
PLANT_GROUPS['succulent_a'] = ['succulent_a'];
PLANT_GROUPS['succulent_b'] = ['succulent_b'];
PLANT_GROUPS['succulent_c'] = ['succulent_c'];
PLANT_GROUPS['lavender_a'] = ['lavender_a'];
PLANT_GROUPS['lavender_b'] = ['lavender_b'];

const FOLLOW_CONSTANTS = {
	TARGET_Y_RESET_THRESHOLD: 0.2,
	STATIC_ZONE_ANGLE_THRESHOLD: Math.PI / 6,
	FOLLOW_SPEED_MAX: 1.6,
	FOLLOW_ACCELERATION: 0.6,
	FOLLOW_DEDELERATION: -0.6,
	FOLLOW_DEADZONE_RADIUS: 0.02,
	GAZE_TARGET_VISIBLE: false,
};

const RAY_CONSTANTS = {
	RENDER_ORDER: 999,
	RAY_TEXTURE_SIZE: 128,
	CURVED_RAY_SEGEMENTS: 20,
	STRAIGHT_RAY_SEGEMENTS: 1,
	STRAIGHT_RAY_MAX_LENGTH: 5,
	UI_RAY: {
		// RADII_FUNC defines a line or a curve for greater customization on radii
		// of different segments of the ray. It takes in a float between 0 and 1
		// denoting where this point is on the curve (0.5 means that this is the
		// half way point), and it returns the value of this point on the curve.
		// RADII_FUNC(0) denotes the starting radius of the ray
		// RADII_FUNC(1) denotes the ending radius of the ray
		RADII_FUNC: (_) => 0.005,
		COLOR: [0xffffff], // white
		OPACITY: [0.3],

		RAY_GRADIENT_START: [0.02],
		RAY_GRADIENT_OPAQUE_START: [0.07],
		RAY_GRADIENT_OPAQUE_END: [0.6],
		RAY_GRADIENT_END: [1, 1.0],
	},
	SHORT_RAY: {
		RADII_FUNC: (_) => 0.005,
		COLOR: [0xffffff], // white
		OPACITY: [0.5],

		RAY_GRADIENT_START: [0.02],
		RAY_GRADIENT_OPAQUE_START: [0.07],
		RAY_GRADIENT_OPAQUE_END: [0.6],
		RAY_GRADIENT_END: [1, 1.0],
	},
	SELECTION_RAY: {
		RADII_FUNC: (_) => 0.005,
		COLOR: [0xffffff], // white
		OPACITY: [0.6],
		// Used to define the transparency gradient on the ray:
		// ray is 100% transparent until RAY_GRADIENT_START, then fades into full opacity by RAY_GRADIENT_OPAQUE_START
		// it remains fully opaque until RAY_GRADIENT_OPAQUE_END, then fades out to full transparency by RAY_GRADIENT_END
		RAY_GRADIENT_START: [0.01],
		RAY_GRADIENT_OPAQUE_START: [0.3],
		RAY_GRADIENT_OPAQUE_END: [1.0],
		RAY_GRADIENT_END: [1.0],
	},
	PLANTING_RAY: {
		SHOOTING_SPEED: 8,
		RADII_FUNC: (_) => 0.01,
		// color and opacity of the two modes of ray [default, special]
		COLOR: [0x86dc3d, 0x771111], // default green, special red
		OPACITY: [0.8, 0.8],
		RAY_GRADIENT_START: [0.02, 0.02],
		RAY_GRADIENT_OPAQUE_START: [0.1, 0.1],
		RAY_GRADIENT_OPAQUE_END: [0.6, 0.6],
		RAY_GRADIENT_END: [1.0, 1.0],
		// Cuts off the geometry generation of the ray at this percentage along the path
		SPAN_OVERRIDE: [0.5, 0.5],
	},
	PICKING_RAY: {
		RADII_FUNC: (_) => 0.01,
		COLOR: [0x660000, 0x660000], // red
		OPACITY: [0.5, 0.5],
		RAY_GRADIENT_START: [0.02, 0.02],
		RAY_GRADIENT_OPAQUE_START: [0.07, 0.07],
		RAY_GRADIENT_OPAQUE_END: [1.0, 1.0],
		RAY_GRADIENT_END: [1.0, 1.0],
	},
	TELEPORT_RAY: {
		SHOOTING_SPEED: 10,
		RADII_FUNC: () => 0.01,
		COLOR: [0x48adc8, 0x771111],
		OPACITY: [0.8, 0.8],
		RAY_GRADIENT_START: [0.02, 0.02],
		RAY_GRADIENT_OPAQUE_START: [0.1, 0.1],
		RAY_GRADIENT_OPAQUE_END: [0.6, 0.6],
		RAY_GRADIENT_END: [0.8, 0.8],
		SPAN_OVERRIDE: [0.75, 0.75],
	},
	WATERING_RAY: {
		SHOOTING_SPEED: 4.5,
		RADII_FUNC: (i) => 0.02 + i * 0.5,
		COLOR: [0x336dff], // deep blue
		OPACITY: [0.75],
		RAY_GRADIENT_OPAQUE_END: [0.4],
		RAY_GRADIENT_END: [0.9],
	},
};

const INDICATOR_RING_CONSTANTS = {
	PLANTABLE_RING: {
		RADIUS: 0.6,
		HEIGHT: 0.05,
		COLOR: 0x86dc3d, // green
		OPACITY: 0.8,
	},
	NOT_PLANTABLE_RING: {
		RADIUS: 0.6,
		HEIGHT: 0.1,
		COLOR: 0x771111, // red
		OPACITY: 0.7,
	},
	TELEPORTABLE_RING: {
		RADIUS: 0.6,
		HEIGHT: 0.1,
		COLOR: 0x48adc8, // light blue
		OPACITY: 0.8,
	},
	NOT_TELEPORTABLE_RING: {
		RADIUS: 0.6,
		HEIGHT: 0.1,
		COLOR: 0x771111, // red
		OPACITY: 0.8,
	},
};

const PHYSICS_CONSTANTS = {
	GRAVITY: -10,
	PHYSICS_STEPS: 2,
};

const UI_CONSTANTS = {
	UI_PIXELS_PER_METER: 512,
	UI_FADE_TIME: 300, // in ms
	UI_OFFSET_BUFFER: 5 / 512, // distance individual UI panels are from one another, to prevent z-fighting.
};

const NUX_CONSTANTS = {
	LOCOMOTION_TUTORIAL_RADIUS: 1,
	HAND_NUX_PULSE_DURATION: 2,
	HAND_NUX_ACTIVATION_DELAY: 30,
};

const LOCALSTORAGE_KEYS = {
	SEEN_NUX: 'has_seen_nux',
	SEEN_PLANT_SWITCH_TOOLTIP: 'has_seen_plant_tooltip',
	SEEN_CAMERA_SHUTTER_BLINK: 'has_seen_camera_shutter_blink',
	SEEN_GRAB_PHOTO_TOOLTIP: 'has_seen_grab_photo_tooltip',
};

const SCREENSHOT_BASE_WIDTH = 150;
const SCREENSHOT_BASE_HEIGHT = 100;
const SCREENSHOT_PHOTO_SCALE = 8;
const SCREENSHOT_PREVIEW_SCALE = 1;

const SCREENSHOT_CAMERA_CONSTANTS = {
	CAMERA_FOV: 37,
	CAMERA_PREVIEW_RESOLUTION_WIDTH:
		SCREENSHOT_BASE_WIDTH * SCREENSHOT_PREVIEW_SCALE,
	CAMERA_PREVIEW_RESOLUTION_HEIGHT:
		SCREENSHOT_BASE_HEIGHT * SCREENSHOT_PREVIEW_SCALE,
	CAMERA_PREVIEW_NEAR: 0.15,
	CAMERA_PREVIEW_FAR: 800,
	CAMERA_PHOTO_RESOLUTION_WIDTH: SCREENSHOT_BASE_WIDTH * SCREENSHOT_PHOTO_SCALE,
	CAMERA_PHOTO_RESOLUTION_HEIGHT:
		SCREENSHOT_BASE_HEIGHT * SCREENSHOT_PHOTO_SCALE,
	CAMERA_PHOTO_NEAR: 0.15,
	CAMERA_PHOTO_FAR: 800,
	CAMERA_SCREEN_WIDTH: 0.106,
	CAMERA_SCREEN_HEIGHT: 0.075,
	PHOTO_HEIGHT: 0.09,
	PREVIEW_PADDING: [0.01, 0.01],
	RENDER_FRAME_RATE: 30,
	FRAME_RATE_MULTIPLIER_WHEN_MOVING: 1,
	PHOTO_GRAB_DISTANCE: 0.1,
	PHOTO_HIGHLIGHT_DISTANCE: 0.2,
	PHOTO_PADDING: [
		5 * SCREENSHOT_PREVIEW_SCALE,
		5 * SCREENSHOT_PREVIEW_SCALE,
		5 * SCREENSHOT_PREVIEW_SCALE,
		17 * SCREENSHOT_PREVIEW_SCALE,
	], // [top, right, bottom, left]
	PHOTO_WATERMARK_OFFSET: 10,
	PHOTO_WATERMARK_SIZE: 100,
	PHOTO_PRINTING_DURATION: 1,
	SHUTTER_EFFECT_DURATION: 0.7,
	SHUTTER_BUTTON_DEPRESSED_Y_OFFSET: -0.008,
	BUTTON_DEFAULT_COLOR: 0xffffff,
	BUTTON_HIGHLIGHT_COLOR: 0xfff000,
	PHOTO_EXPIRATION_TIME: 5,
};

const MODE_SELECTION_WHEEL_CONSTANTS = {
	WHEEL_POSITION_OFFSET: new THREE.Vector3(0, 0, -0.2),
	SELECT_THRESHOLD: 0.06, // distance threshold
	TRANSITION_DURATION: 0.1,
	SELECTED_TRANSITION_DELAY: 0.2,
	TILE_FACE_COLOR_DEFAULT: 0xffffff,
	TILE_FACE_COLOR_SELECTED: 0x79fcf2,
	TILE_FACE_COLOR_HOVERED: 0xfaf084,
	TILE_ENCLOSURE_COLOR: 0xd3d3d3,
};

const LONG_PRESS_DURATION = 0.5;

const COLLISION_LAYERS = {
	UNKNOWN: 0 << 0,
	PLANT: 1 << 0,
	OBSTACLE: 1 << 1,
	BOUNDARY: 1 << 2, // used for invisible borders; you can teleport through them.

	// invisible obstacles won't block the ray from passing through it
	// and won't show the intersection of collision
	INVISIBLE: 1 << 3,
	TELEPORT_SURFACE: 1 << 4,
	PLANTABLE_SURFACE: 1 << 5,
};

const LOCOMOTION_VIGNETTE_CONSTATNTS = {
	// dimension of the tube controls the min field of view when vignette is fully deployed
	TUBE_RADIUS: 0.2,
	TUBE_LENGTH: 0.4,
	TUBE_TEXTURE_SIZE: 64,
	// the threshold of speed factor over which the vignette will be deployed fully
	// for example, if player is moving at a speed factor of over 0.9, the vignette will always be fully deployed
	// and when player is moving at a speed factor under the threshold, the extent of vignette deployment is linear to the speed factor
	MAX_DEPLOYMENT_THRESHOLD: 0.9,
	// offset for the gradient texture, higher means the vignette edge is darker
	GRADIENT_START_OFFSET: 0.3,
};

const WATER_FAUNA_CONSTANTS = {
	GROUPS: [
		{
			AREA_ID: 'RIVER',
			NUMBER_OF_FAUNA: 3,
			VARIATION_MESH_IDS: ['FAUNA_FISH_A'],
			SELF_ALTER_ANIM_IDS: ['Breathing'],
			SELF_ALTER_ANIM_DURATION: 1,
			SELF_ALTER_ANIM_MAX_INFLUENCE: 1,
			SYNC_ANIM_SEQUENCE_IDS: ['Twist_Left', 'Twist_Right'],
			ANIM_SEQUENCE_DURATION: 1,
			ANIM_SEQUENCE_MAX_INFLUENCE: 0.6,
			BASE_SPEED: 0.3,
			SPEED_DELTA_RANGE: 0.3,
			BASE_DEPTH: -0.3,
			DEPTH_DELTA_RANGE: 0.4,
			BASE_SCALE: 1.25,
			SCALE_DELTA_RANGE: 1.5,
			TURN_STAGE_THRESHOLDS: [1, 0.7, 0.5],
			TURN_FACTOR_MULTIPLIER: 2,
			AVOID_OTHERS: false,
			CULLING_DISTANCE: 20,
		},
		{
			AREA_ID: 'POND',
			NUMBER_OF_FAUNA: 3,
			VARIATION_MESH_IDS: ['FAUNA_FISH_A'],
			SELF_ALTER_ANIM_IDS: ['Breathing'],
			SELF_ALTER_ANIM_DURATION: 1,
			SELF_ALTER_ANIM_MAX_INFLUENCE: 1,
			SYNC_ANIM_SEQUENCE_IDS: ['Twist_Left', 'Twist_Right'],
			ANIM_SEQUENCE_DURATION: 1,
			ANIM_SEQUENCE_MAX_INFLUENCE: 0.6,
			BASE_SPEED: 0.3,
			SPEED_DELTA_RANGE: 0.3,
			BASE_DEPTH: -0.3,
			DEPTH_DELTA_RANGE: 0.4,
			BASE_SCALE: 1.25,
			SCALE_DELTA_RANGE: 1.5,
			TURN_STAGE_THRESHOLDS: [2, 1, 0.5],
			TURN_FACTOR_MULTIPLIER: 2,
			AVOID_OTHERS: false,
			CULLING_DISTANCE: 20,
		},
		{
			AREA_ID: 'RIVER',
			NUMBER_OF_FAUNA: 0,
			VARIATION_MESH_IDS: ['FAUNA_DUCK_B'],
			SELF_ALTER_ANIM_IDS: ['StretchForward'],
			SELF_ALTER_ANIM_DURATION: 4,
			SELF_ALTER_ANIM_MAX_INFLUENCE: 0.2,
			SYNC_ANIM_SEQUENCE_IDS: [
				'Paddle_LeftLegForward',
				'Paddle_RightLegForward',
			],
			ANIM_SEQUENCE_DURATION: 1,
			ANIM_SEQUENCE_MAX_INFLUENCE: 0.6,
			BASE_SPEED: 0.15,
			SPEED_DELTA_RANGE: 0.2,
			BASE_DEPTH: 0,
			DEPTH_DELTA_RANGE: 0,
			BASE_SCALE: 1,
			SCALE_DELTA_RANGE: 0.04,
			TURN_STAGE_THRESHOLDS: [1, 0.7, 0.5],
			TURN_FACTOR_MULTIPLIER: 1,
			AVOID_OTHERS: true,
			CULLING_DISTANCE: 60,
		},
		{
			AREA_ID: 'POND',
			NUMBER_OF_FAUNA: 2,
			VARIATION_MESH_IDS: ['FAUNA_DUCK_B'],
			SELF_ALTER_ANIM_IDS: ['StretchForward'],
			SELF_ALTER_ANIM_DURATION: 4,
			SELF_ALTER_ANIM_MAX_INFLUENCE: 0.2,
			SYNC_ANIM_SEQUENCE_IDS: [
				'Paddle_LeftLegForward',
				'Paddle_RightLegForward',
			],
			ANIM_SEQUENCE_DURATION: 1,
			ANIM_SEQUENCE_MAX_INFLUENCE: 0.6,
			BASE_SPEED: 0.15,
			SPEED_DELTA_RANGE: 0.2,
			BASE_DEPTH: 0,
			DEPTH_DELTA_RANGE: 0,
			BASE_SCALE: 1,
			SCALE_DELTA_RANGE: 0.04,
			TURN_STAGE_THRESHOLDS: [2, 1, 0.5],
			TURN_FACTOR_MULTIPLIER: 1,
			AVOID_OTHERS: true,
			CULLING_DISTANCE: 60,
		},
	],
};

const AERIAL_FAUNA_CONSTANTS = {
	GROUPS: [
		{
			BOUNDING_BOX3: new THREE.Box3(
				new THREE.Vector3(-50, 10, -50),
				new THREE.Vector3(50, 30, 50),
			),
			NUMBER_OF_FAUNA: 5,
			VARIATION_MESH_IDS: ['FAUNA_SEAGULL_FLYING'],
			SELF_ALTER_ANIM_IDS: [],
			SELF_ALTER_ANIM_DURATION: 1,
			SELF_ALTER_ANIM_MAX_INFLUENCE: 1,
			SYNC_ANIM_SEQUENCE_IDS: ['Flap_Up', 'Flap_Down'],
			ANIM_SEQUENCE_DURATION: 0.3,
			ANIM_SEQUENCE_MAX_INFLUENCE: 1,
			BASE_SPEED: 5,
			SPEED_DELTA_RANGE: 2,
			MIN_Y_RAD: (-20 * Math.PI) / 180,
			MAX_Y_RAD: (20 * Math.PI) / 180,
			TURN_RAD: (3 * Math.PI) / 180,
			HORIZONTAL_PATH_VARIATION_FREQ: 1 / 20,
			HORIZONTAL_PATH_VARIATION_FACTOR: (0.3 * Math.PI) / 180,
			VERTICAL_PATH_VARIATION_FREQ: 1,
			VERTICAL_PATH_VARIATION_FACTOR: 0,
			AUDIO_CONFIG: {
				ids: [
					'SEAGULLS_LOOP_01',
					'SEAGULLS_LOOP_02',
					'SEAGULLS_LOOP_03',
					'SEAGULLS_LOOP_04',
					'SEAGULLS_LOOP_05',
				],
				maxDelay: 3000,
			},
			CULLING_DISTANCE: 1000,
		},
	],
};

const THREEJS_LAYERS = {
	VIEWER_ONLY: 11,
	SCREENSHOT_ONLY: 12,
};

export {
	DEBUG_CONSTANTS,
	CACHE_CONSTANTS,
	LOCOMOTION_CONSTANTS,
	SEEDBOX_CONSTANTS,
	PLANTING_CONSTANTS,
	PHYSICS_CONSTANTS,
	FOLLOW_CONSTANTS,
	RAY_CONSTANTS,
	INDICATOR_RING_CONSTANTS,
	UI_CONSTANTS,
	NUX_CONSTANTS,
	LOCALSTORAGE_KEYS,
	SCREENSHOT_CAMERA_CONSTANTS,
	MODE_SELECTION_WHEEL_CONSTANTS,
	LONG_PRESS_DURATION,
	COLLISION_LAYERS,
	LOCOMOTION_VIGNETTE_CONSTATNTS,
	WATER_FAUNA_CONSTANTS,
	AERIAL_FAUNA_CONSTANTS,
	THREEJS_LAYERS,
};
