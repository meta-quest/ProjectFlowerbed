/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ShaderChunk, Vector3, Vector4 } from 'three';

import { createDerivedMaterial } from 'troika-three-utils';

const PlantShader = {
	skinningParsVertexChunk: /* glsl */ `
		uniform vec4 scaleBoneOffsets[4];
		uniform vec4 boneScales;
	`,

	skinningVertexChunk: /* glsl */ `
		vec4 offset = vec4(0.0,0.0,0.0,0.0);
		#pragma unroll_loop_start
		for ( int i = 0; i < 4; i ++ ) {
			offset.xyz += (transformed.xyz - scaleBoneOffsets[i].xyz) * (boneScales[i]) * skinWeight[i];
		}
		#pragma unroll_loop_end

		transformed.xyz += offset.xyz;
		`,

	skinningDisableChunk: /* glsl */ ` `,
};

const PlantMaterial = {
	setupNode: function (node) {
		let bonePositions = [];

		let boneRemaps = [0, 1, 2, 3, 4];
		let rootBoneIdx = 5;
		for (let i = 0; i < node.skeleton.bones.length; i++) {
			let bone = node.skeleton.bones[i];

			if (bone.name.match(/root/i)) {
				// it's the root!  remap this
				rootBoneIdx = i;
				boneRemaps[i] = -1;

				// we also need to grab the inverse transform and append it to the node transform
				// to account for quantization from gltf-transform
				let boneInverse = node.skeleton.boneInverses[i];

				let position = new Vector3();
				let scale = new Vector3();

				position.setFromMatrixPosition(boneInverse);
				scale.setFromMatrixScale(boneInverse);

				node.scale.multiply(scale);
				node.position.add(position);
			} else {
				// should these be offset by the root position?  let's not for now and assume the art is correct.
				boneRemaps[i] = i > rootBoneIdx ? i - 1 : i;
				// be sure to take the node transform into account, because that's where quantization is factored in
				let v = bone.position.clone();
				v.sub(node.position);
				v.divide(node.scale);
				bonePositions.push(v);
			}
		}

		const index = new Vector4();
		const weight = new Vector4();
		const newWeight = new Vector4();

		const skinIndex = node.geometry.attributes.skinIndex;
		const skinWeight = node.geometry.attributes.skinWeight;
		const numVertices = node.geometry.attributes.skinWeight.count;

		for (let i = 0; i < numVertices; i++) {
			// remap node.geometry.attributes.skinIndex and skinWeight arrays
			newWeight.set(0, 0, 0, 0);
			index.fromBufferAttribute(skinIndex, i);
			weight.fromBufferAttribute(skinWeight, i);

			for (let j = 0; j < 4; j++) {
				let newIndex = boneRemaps[index.getComponent(j)];
				let w = weight.getComponent(j);
				if (newIndex >= 0 && w > 0.01) {
					newWeight.setComponent(newIndex, w);
				}
			}

			skinWeight.setXYZW(i, newWeight.x, newWeight.y, newWeight.z, newWeight.w);
		}

		// remove skinIndex afterwards

		delete node.geometry.attributes.skinIndex;

		// be sure not to let anything renormalize the skin weights after this

		let offsetVector = [];
		for (let i = 0; i < 4; i++) {
			offsetVector.push(
				new Vector4(
					bonePositions[i].x,
					bonePositions[i].y,
					bonePositions[i].z,
					0.0,
				),
			);
		}

		const uniforms = {
			scaleBoneOffsets: { value: offsetVector },
			boneScales: { value: new Vector4(1.0, 1.0, 8.0, 1.0) },
		};

		let newMaterial = createDerivedMaterial(node.material, {
			uniforms: uniforms,
			defines: { USE_SKINNING: '' },
			customRewriter: (input) => {
				input.vertexShader = input.vertexShader
					.replace(
						ShaderChunk.skinning_pars_vertex,
						PlantShader.skinningParsVertexChunk,
					)
					.replace(
						ShaderChunk.skinbase_vertex,
						PlantShader.skinningDisableChunk,
					)
					.replace(
						ShaderChunk.skinnormal_vertex,
						PlantShader.skinningDisableChunk,
					)
					.replace(
						ShaderChunk.skinning_vertex,
						PlantShader.skinningVertexChunk,
					);
				return input;
			},
		});

		newMaterial.boneScaleAnimated = true;

		node.material = newMaterial;
	},
};

export { PlantMaterial };
