/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export const LOD_FILENAME_SUFFIX = `_LOD`; // the index of the LOD goes after the suffix

export const LODConfigs = {
	// key is the meshId of the LOD, this is used at runtime to determine
	// the distances each level of the LOD should pop in
	Prop_Pergola: {
		filename: 'Prop_Pergola.gltf', // filename is the filename that the source model should match for LODs to be generated
		factors: [3, 1],
		error: 0.1,
		distance: [15, 40],
	},

	Prop_Gazebo: {
		filename: 'Prop_Gazebo.gltf',
		factors: [2, 1],
		error: 0.1,
		distance: [15, 40],
	},

	Tree_Hero: {
		filename: 'Tree_Hero.gltf',
		factors: [2, 1],
		error: 0.1,
		distance: [15, 40],
	},

	Prop_Fence_01_01: {
		filename: 'Prop_Fence_01_01.gltf',
		factors: [3, 1],
		error: 0.1,
		distance: [6, 30],
	},

	Prop_Planter_Circular_01: {
		filename: 'Prop_Planter_Circular_01.gltf',
		factors: [3, 1],
		error: 0.1,
		distance: [6, 30],
	},
	Prop_Planter_Circular_02: {
		filename: 'Prop_Planter_Circular_02.gltf',
		factors: [3, 1],
		error: 0.1,
		distance: [6, 30],
	},
	Prop_Planter_Long01: {
		filename: 'Prop_Planter_Long01.gltf',
		factors: [3, 1],
		error: 0.1,
		distance: [6, 30],
	},
	Prop_Planter_Long02: {
		filename: 'Prop_Planter_Long02.gltf',
		factors: [3, 1],
		error: 0.1,
		distance: [6, 30],
	},
	Prop_Planter_Long03: {
		filename: 'Prop_Planter_Long03.gltf',
		factors: [3, 1],
		error: 0.1,
		distance: [6, 30],
	},
	Prop_Planter_Long04: {
		filename: 'Prop_Planter_Long04.gltf',
		factors: [3, 1],
		error: 0.1,
		distance: [6, 30],
	},
	Bench: {
		filename: 'Bench.gltf',
		factors: [3, 1],
		error: 0.1,
		distance: [6, 30],
	},
};
