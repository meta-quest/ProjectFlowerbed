/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
	ExtensionProperty,
	Extension,
	PropertyType,
} from '@gltf-transform/core';

const NAME = 'META_woodland_scaled_segments';

export class ScaledSegments extends ExtensionProperty {
	static EXTENSION_NAME = NAME;

	constructor(graph) {
		super(graph);

		this.extensionName = NAME;
		this.propertyType = 'ScaledSegments';
		this.parentTypes = [PropertyType.MESH];
	}

	init() {}

	getSegmentPositions() {
		return this.segmentPositions;
	}

	setSegmentPositions(segmentPositions) {
		this.segmentPositions = segmentPositions;
		return this;
	}
}

export class GeometryScaledSegments extends Extension {
	static EXTENSION_NAME = NAME;
	constructor(doc) {
		super(doc);
		this.extensionName = NAME;
	}

	createScaledSegments() {
		return new ScaledSegments(this.document.getGraph());
	}

	read(_) {
		return this;
	}

	write(context) {
		const jsonDoc = context.jsonDoc;

		this.document
			.getRoot()
			.listMeshes()
			.forEach((mesh) => {
				const extProp = mesh.getExtension(NAME);
				jsonDoc.json.meshes[0].extensions =
					jsonDoc.json.meshes[0].extensions || {};
				jsonDoc.json.meshes[0].extensions[NAME] = {
					segmentPositions: extProp.getSegmentPositions(),
				};
			});

		return this;
	}

	static async apply(document, _stack) {
		// this stage should be early in the transform pipeline (doesn't work well after quantization/meshopt)
		const segmentExtension = document.createExtension(GeometryScaledSegments);

		document
			.getRoot()
			.listNodes()
			.forEach((node) => {
				const segs = segmentExtension.createScaledSegments();
				let mesh = node.getMesh();
				let skin = node.getSkin();
				if (mesh && skin) {
					console.log('MESH');
					let boneRemaps = [0, 1, 2, 3, 4];
					let rootBoneIdx = 5; // init this to a value > 4;
					let bonePositions = [];
					let rootPosition = null;
					let joints = skin.listJoints();
					for (let i = 0; i < joints.length; i++) {
						let joint = joints[i];
						if (joint.getName().match(/root/i)) {
							// it's the root! remove this from the list of active joints
							rootBoneIdx = i;
							rootPosition = joint.getTranslation();
							boneRemaps[i] = -1;
						} else {
							// boneRemaps[i] = i > rootBoneIdx? i - 1: i
							boneRemaps[i] = bonePositions.length;
							bonePositions.push(joint.getTranslation());
						}
					}
					console.log(bonePositions);
					console.log(rootPosition);
					console.log(rootBoneIdx);

					// should be one primitive
					const prims = mesh.listPrimitives();
					if (prims.length != 1) {
						console.log(
							`ERROR: mesh has ${prims.length} primitives.  Aborting.`,
						);
						return;
					}
					const prim = prims[0];

					const positions = prim.getAttribute('POSITION');
					const skinIndices = prim.getAttribute('JOINTS_0');
					const skinWeights = prim.getAttribute('WEIGHTS_0');

					if (!positions || !skinIndices || !skinWeights) {
						console.log(
							`ERROR: mesh doesn't have positions, joints, and weights. Aborting.`,
						);
						return;
					}
					const numVertices = positions.getCount();
					console.log(`num verts: ${numVertices}`);

					let vertexPosition = [0, 0, 0];
					const vertexIndices = [0, 0, 0, 0];
					const vertexWeights = [0, 0, 0, 0];

					for (let i = 0; i < numVertices; i++) {
						const newWeights = [0, 0, 0, 0];
						// remap node.geometry.attributes.skinIndex and skinWeight arrays
						positions.getElement(i, vertexPosition);
						skinIndices.getElement(i, vertexIndices);
						skinWeights.getElement(i, vertexWeights);

						for (let j = 0; j < 4; j++) {
							let newIndex = boneRemaps[vertexIndices[j]];
							let w = vertexWeights[j];
							if (newIndex >= 0 && w > 0.01) {
								newWeights[newIndex] = w;
								vertexPosition[0] += bonePositions[newIndex][0] * -w;
								vertexPosition[1] += bonePositions[newIndex][1] * -w;
								vertexPosition[2] += bonePositions[newIndex][2] * -w;
							}
						}

						skinWeights.setElement(i, newWeights);
						positions.setElement(i, vertexPosition);
					}

					segs.setSegmentPositions(bonePositions);
					mesh.setExtension('META_woodland_scaled_segments', segs);

					prim.setAttribute('JOINTS_0', null);
					node.setSkin();
				}
			});
	}
}
