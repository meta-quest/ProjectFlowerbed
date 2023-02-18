/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const UnderwaterDirtShader = {
	/*
		colorFragmentChunk - this handles the "shallow water" component of the underwater material. Tint the diffuse component of everything under the water towards a lighter blue-green color, based on a shallow depth.
	*/
	colorFragmentChunk: /* glsl */ `

		// Blend the diffuse color towards a blue tone below the water level.
		if (vWorldPosition.y < 0.0)
		{
			//NOTE: This assumes 0.0 is the water level -- would need to add some additional offsetting here if that was not the case.
			float depthScale = saturate( vWorldPosition.y * -0.5 ); // multiple by 1/depth (where depth is negative)
			diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.329, 0.3), min(depthScale, 0.5));
		}

	`,
	/*
		fogFragmentChunk - this handles the "deep water" component of the underwater material. Use a depth-based fog that blends everything towards a deep blue color based on a deeper depth.
	*/
	fogFragmentChunk: /* glsl */ `
	#ifdef USE_FOG

		float fogFactor;
		vec3 finalFogColor = fogColor;

		#ifdef FOG_EXP2

			if (vWorldPosition.y < 0.0)
			{
				//NOTE: This assumes 0.0 is the water level -- would need to add some additional offsetting here if that was not the case.
				fogFactor = saturate(vWorldPosition.y * -0.2); // multiple by 1/depth (where depth is negative)

				finalFogColor = vec3(0.1, 0.45, 0.355); //vec3(0.1, 0.35, 0.45);
			}
			else
			{
				fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
			}

		#else

			fogFactor = smoothstep( fogNear, fogFar, vFogDepth );

		#endif

		gl_FragColor.rgb = mix( gl_FragColor.rgb, finalFogColor, fogFactor );

	#endif
	`,
};

const UnderwaterDirtMaterial = {
	setupMaterial: function (material) {
		material.name = 'UnderwaterDirtMaterial';
		material.customProgramCacheKey = function () {
			return 'underwater_dirt';
		};

		material.onBeforeCompile = (shader) => {
			shader.vertexShader =
				'#define USE_ENVMAP\n' + // to get vWorldPos
				shader.vertexShader;

			shader.fragmentShader = shader.fragmentShader
				.replace(
					'#include <normal_pars_fragment>',
					`#include <normal_pars_fragment>
					 varying vec3 vWorldPosition;`,
				)
				.replace(
					'#include <color_fragment>',
					UnderwaterDirtShader.colorFragmentChunk,
				)
				.replace(
					'#include <fog_fragment>',
					UnderwaterDirtShader.fogFragmentChunk,
				);

			// console.log(shader.fragmentShader);
		};
	},
};

export { UnderwaterDirtMaterial };
