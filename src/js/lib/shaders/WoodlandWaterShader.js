/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
	Color,
	MixOperation,
	RepeatWrapping,
	TextureLoader,
	Vector4,
} from 'three';

const WaterShader = {
	normalParsChunk: /* glsl */ `
		#ifdef USE_NORMALMAP

			uniform sampler2D normalMap;
			uniform vec2 normalScale;

		#endif

		#ifdef OBJECTSPACE_NORMALMAP

			uniform mat3 normalMatrix;

		#endif

		#if ! defined ( USE_TANGENT ) && ( defined ( TANGENTSPACE_NORMALMAP ) || defined ( USE_CLEARCOAT_NORMALMAP ) )

			// Normal Mapping Without Precomputed Tangents
			// http://www.thetenthplanet.de/archives/1180

			vec3 perturbNormal2Arb( vec3 eye_pos, vec3 surf_norm, vec3 mapN, float faceDirection ) {

				// Workaround for Adreno 3XX dFd*( vec3 ) bug. See #9988

				vec3 q0 = vec3( dFdx( eye_pos.x ), dFdx( eye_pos.y ), dFdx( eye_pos.z ) );
				vec3 q1 = vec3( dFdy( eye_pos.x ), dFdy( eye_pos.y ), dFdy( eye_pos.z ) );

				// use the worldposition instead of vUv because we can't guarantee (and don't use) the uv
				vec2 st0 = dFdx( vWorldPosition.xz );
				vec2 st1 = dFdy( vWorldPosition.xz );

				vec3 N = surf_norm; // normalized

				vec3 q1perp = cross( q1, N );
				vec3 q0perp = cross( N, q0 );

				vec3 T = q1perp * st0.x + q0perp * st1.x;
				vec3 B = q1perp * st0.y + q0perp * st1.y;

				float det = max( dot( T, T ), dot( B, B ) );
				float scale = ( det == 0.0 ) ? 0.0 : faceDirection * inversesqrt( det );

				return normalize( T * ( mapN.x * scale ) + B * ( mapN.y * scale ) + N * mapN.z );

			}

		#endif
	`,
	normalFragmentChunk: /* glsl */ `

			// sample voronoi maps (distort uvs with flowdata)
			const vec2 flowDirection = vec2(-11.3, 4.4);
			const vec2 flowDirection1 = vec2(6.0, -7.0);
			const vec2 flowDirection2 = vec2(-3.3, -5.1);

			// flow direction -- direction + speed of flow
			// wave config.xy -- time-based driver of flow speed
			// scalar at the end -- overall scale -- smaller number is bigger ripples
			vec2 uv0 = ( vWorldPosition.xz + flowDirection * wave_config.xx) * 0.412;
			vec2 uv1 = ( vWorldPosition.xz + flowDirection1 * wave_config.xx) * 0.572;
			vec2 uv2 = ( vWorldPosition.xz + flowDirection2 * wave_config.xx) * 0.272;

			vec3 voronoi_norm_0 = texture2D(normalMap, uv0).xyz * 2.0 - 1.0;
			vec3 voronoi_norm_1 = texture2D(normalMap, uv1).xyz * 2.0 - 1.0;
			vec3 voronoi_norm_2 = texture2D(normalMap, uv2).xyz * 2.0 - 1.0;
			// voronoi_norm_0 *= wave_config.z;
			// voronoi_norm_1.xy *= wave_config.w;
			// voronoi_norm_2 *= wave_config.w;

			vec3 mapN = voronoi_norm_0 + voronoi_norm_1 + voronoi_norm_2;
			mapN = normalize(mapN);

			#ifdef USE_TANGENT

				normal = normalize( vTBN * mapN );

			#else

				normal = perturbNormal2Arb( - vViewPosition, normal, mapN, faceDirection );

			#endif
		`,

	lightFragmentEndChunk: /* glsl */ `
		#include <lights_fragment_end>

		vec3 fragToCam = normalize( vViewPosition );

		float _Bias = 0.0;
		float _Scale = 2.25;
		float _Power = 2.0;
		float fresnel = 1.0 - saturate(_Bias + _Scale * pow(dot(fragToCam, normal), _Power));

		// Compute luminance of the specular lighting components
		float specLuminance =
			(reflectedLight.directSpecular.r * 0.21 + reflectedLight.directSpecular.g * 0.72 + reflectedLight.directSpecular.b * 0.07) +
			(reflectedLight.indirectSpecular.r * 0.21 + reflectedLight.indirectSpecular.g * 0.72 + reflectedLight.indirectSpecular.b * 0.07);

		// Drive the specular highlights to full opacity, regardless of the fresnel term.
		diffuseColor.a = max( fresnel, specLuminance );
	`,
	envMapFragmentChunk: /* glsl */ `
	#ifdef USE_ENVMAP

	#ifdef ENV_WORLDPOS

		vec3 cameraToFrag;

		if ( isOrthographic ) {

			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );

		} else {

			cameraToFrag = normalize( vWorldPosition - cameraPosition );

		}

		// Transforming Normal Vectors with the Inverse Transformation
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );

		#ifdef ENVMAP_MODE_REFLECTION

			vec3 reflectVec = reflect( cameraToFrag, worldNormal );

		#else

			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );

		#endif

	#else

		vec3 reflectVec = vReflect;

	#endif

	#ifdef ENVMAP_TYPE_CUBE

		vec4 envColor = textureCube( envMap, vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );

	#elif defined( ENVMAP_TYPE_CUBE_UV )

		vec4 envColor = textureCubeUV( envMap, reflectVec, 0.0 );

	#else

		vec4 envColor = vec4( 0.0 );

	#endif

	// Custom version of Environment Map Blending -- we use an altered version of ENVMAP_BLENDING_MIX that adds the specular highlights in separately.

	// Original version of ENVMAP_BLENDING_MIX:
	// outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );

	// Instead, only mix the diffuse & emissive with the envmap, so that the specular still blows out to white highlights.
	outgoingLight = mix( reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance, envColor.xyz, specularStrength * reflectivity );
	outgoingLight += reflectedLight.directSpecular;


#endif
	`,
};

const textureLoader = new TextureLoader();
const WaterMaterial = {
	setupMaterial: function (material) {
		material.name = 'WaterMaterial';
		material.wave_config = new Vector4();
		material.transparent = true;
		material.shininess = 3000.0;
		material.reflectivity = 0.75;
		material.combine = MixOperation;

		material.normalMap = textureLoader.load(
			'assets/images/voronoi_normal_1.png',
		);
		material.normalMap.wrapS = material.normalMap.wrapT = RepeatWrapping;

		material.roughness = 0.0;
		material.color = new Color(0x386368); //Alt colors: 0x386368, 0x544891, 0x487391

		material.customProgramCacheKey = function () {
			return 'water';
		};

		material.onBeforeCompile = (shader) => {
			shader.fragmentShader = shader.fragmentShader
				.replace(
					'#include <normal_pars_fragment>',
					`#include <normal_pars_fragment>
     				 uniform vec4 wave_config;`,
				)
				.replace(
					'#include <normalmap_pars_fragment>',
					WaterShader.normalParsChunk,
				)
				.replace(
					'#include <normal_fragment_maps>',
					WaterShader.normalFragmentChunk,
				)
				.replace('#include <envmap_fragment>', WaterShader.envMapFragmentChunk)
				.replace(
					'#include <lights_fragment_end>',
					WaterShader.lightFragmentEndChunk,
				);

			shader.uniforms.wave_config = {
				type: 'v4',
				value: material.wave_config,
			};
		};
	},
};

export { WaterMaterial };
