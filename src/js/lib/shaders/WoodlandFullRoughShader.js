/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const FullRoughShader = {
	metalnessReplacementChunk: /* glsl */ `
		const float metalnessFactor = 0.0;
	`,
	roughnessReplacementChunk: /* glsl */ `
		const float roughnessFactor = 1.0;
	`,
};

const FullRoughMaterial = {
	setupMaterial: function (material) {
		material.onBeforeCompile = (shader) => {
			shader.fragmentShader = shader.fragmentShader
				.replace(
					'#include <metalnessmap_fragment>',
					FullRoughShader.metalnessReplacementChunk,
				)
				.replace(
					'#include <roughnessmap_fragment>',
					FullRoughShader.roughnessReplacementChunk,
				);
		};
	},
};

export { FullRoughMaterial };
