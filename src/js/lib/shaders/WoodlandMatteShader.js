/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Vector2 } from 'three';

const MatteShader = {
	fogFragmentChunk: /* glsl */ `
		float fogFactor = vFogDepth;
		float heightScale = 1.0 - saturate(max(vWorldPosition.y - fog_config.x, 0.0) * fog_config.y); //20.0, 0.0125
		fogFactor *= heightScale;

		fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogFactor * fogFactor );

		gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
	`,
};

const MatteMaterial = {
	setupMaterial: function (material) {
		material.roughness = 1.0;
		material.fog_config = new Vector2();
		material.fog_config.x = 20.0;
		material.fog_config.y = 0.0125;
		material.customProgramCacheKey = function () {
			return 'matte';
		};

		material.onBeforeCompile = (shader) => {
			shader.vertexShader =
				'#define USE_TRANSMISSION\n' + // to get vWorldPosition
				'#define USE_ENVMAP\n' + // to get vWorldPosition
				shader.vertexShader;

			shader.fragmentShader = shader.fragmentShader
				.replace(
					'#include <normal_pars_fragment>',
					`#include <normal_pars_fragment>
					 varying vec3 vWorldPosition;
					 uniform vec2 fog_config;`,
				)
				.replace('#include <fog_fragment>', MatteShader.fogFragmentChunk);

			shader.uniforms.fog_config = {
				type: 'v2',
				value: material.fog_config,
			};
		};
	},
};

export { MatteMaterial };
