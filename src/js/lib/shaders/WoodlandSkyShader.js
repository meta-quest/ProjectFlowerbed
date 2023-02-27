/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { UniformsUtils } from 'three';

const SkyMaterial = {
	setupMaterial: function (material, cloudMap) {
		const diffuseBlendParsChunk = `
			uniform sampler2D map;
			uniform sampler2D cloud_map;
		`;

		const diffuseBlendChunk = `
			vec4 baseColor = texture2D( map, vUv );
			vec4 cloudColor = texture2D( cloud_map, vUv );

			diffuseColor *= mix(baseColor, cloudColor, cloudColor.a);
		`;

		material.customProgramCacheKey = function () {
			return 'sky';
		};
		material.onBeforeCompile = (shader) => {
			shader.uniforms = UniformsUtils.merge([
				shader.uniforms,
				material.uniforms,
			]);
			shader.uniforms.cloud_map = { value: cloudMap };

			shader.fragmentShader = shader.fragmentShader
				.replace('#include <map_pars_fragment>', diffuseBlendParsChunk)
				.replace('#include <map_fragment>', diffuseBlendChunk);
		};
	},
};

export { SkyMaterial };
