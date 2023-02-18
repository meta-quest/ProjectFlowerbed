/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { RepeatWrapping, TextureLoader } from 'three';

const GroundShader = {
	colorFragmentChunk: /* glsl */ `
		// sample voronoi map
		vec2 uv0 = ( vWorldPosition.xz * 0.15 );
		vec2 uv1 = ( vWorldPosition.xz * 0.03 );
		vec2 uv2 = ( vWorldPosition.xz * 0.7 );

		float voronoi_val_0 = smoothstep(0.1,0.15,texture2D(voronoi_map, uv0).x);
		float voronoi_val_1 = smoothstep(0.05,0.1,texture2D(voronoi_map, uv1).x);
		float voronoi_val_2 = smoothstep(0.30,0.40,texture2D(voronoi_map, uv2).x);
		diffuseColor = mix(diffuseColor, vec4(0.0, 154.0/255.0, 23.0/255.0, 1.0), voronoi_val_1 * 0.3 + 0.7);
		diffuseColor = mix(diffuseColor, vec4(245.0/255.0,222.0/255.0,179.0/255.0,1.0), (voronoi_val_2 * 0.2 + 0.8) * 0.7);
		// bias this towards the standard green
		diffuseColor = mix(diffuseColor, vec4(98.0/255.0, 128.0/255.0,64.0/255.0,1.0), voronoi_val_0 * 0.2 + 0.3);
	`,
};

const textureLoader = new TextureLoader();

const GroundMaterial = {
	setupMaterial: function (material) {
		material.roughness = 1.0;
		material.customProgramCacheKey = function () {
			return 'ground';
		};
		material.onBeforeCompile = (shader) => {
			shader.vertexShader =
				'#define USE_TRANSMISSION\n' + // to get vWorldPosition
				shader.vertexShader;

			shader.fragmentShader = shader.fragmentShader
				.replace(
					'#include <normal_pars_fragment>',
					`#include <normal_pars_fragment>
							 varying vec3 vWorldPosition;
							 uniform sampler2D voronoi_map;
							`,
				)
				.replace('#include <color_fragment>', GroundShader.colorFragmentChunk);

			shader.uniforms.voronoi_map = {
				value: textureLoader.load('assets/images/voronoi_sdf_0.png'),
			};

			shader.uniforms.voronoi_map.value.wrapS = shader.uniforms.voronoi_map.value.wrapT = RepeatWrapping;
		};
	},
};

export { GroundMaterial };
