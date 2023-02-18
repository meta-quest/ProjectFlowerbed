/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ShaderChunk, Vector4 } from 'three';

import { createDerivedMaterial } from 'troika-three-utils';

const FaunaShader = {
	morphtargetParsVertexChunk: /* glsl */ `
        uniform vec4 influences;

        uniform sampler2DArray morphTargetsTexture;
        uniform ivec2 morphTargetsTextureSize;
        vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
            int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
            int y = texelIndex / morphTargetsTextureSize.x;
            int x = texelIndex - y * morphTargetsTextureSize.x;
            ivec3 morphUV = ivec3( x, y, morphTargetIndex );
            return texelFetch( morphTargetsTexture, morphUV, 0 );
        }
    `,

	morphtargetVertexChunk: /* glsl */ `
        for ( int i = 0; i < min( 4, MORPHTARGETS_COUNT ); i ++ ) {
            if ( influences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * influences[ i ];
        }
    `,

	morphcolorVertexChunk: /* glsl */ ``,

	morphnormalVertexChunk: /* glsl */ `
        for ( int i = 0; i < min( 4, MORPHTARGETS_COUNT ); i ++ ) {
            if ( influences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * influences[ i ];
        }
    `,
};

const FaunaMaterial = {
	setupNode: function (node) {
		const uniforms = {
			influences: { value: new Vector4(0, 1, 0, 0) },
		};

		let newMaterial = createDerivedMaterial(node.material, {
			uniforms: uniforms,
			defines: { MORPHTARGETS_TEXTURE: '' },
			customRewriter: (input) => {
				input.vertexShader = input.vertexShader
					.replace(
						ShaderChunk.morphtarget_pars_vertex,
						FaunaShader.morphtargetParsVertexChunk,
					)
					.replace(
						ShaderChunk.morphcolor_vertex,
						FaunaShader.morphcolorVertexChunk,
					)
					.replace(
						ShaderChunk.morphnormal_vertex,
						FaunaShader.morphnormalVertexChunk,
					)
					.replace(
						ShaderChunk.morphtarget_vertex,
						FaunaShader.morphtargetVertexChunk,
					);
				return input;
			},
		});

		newMaterial.morphTargetEnabled = true;

		node.material = newMaterial;
	},
};

export { FaunaMaterial };
