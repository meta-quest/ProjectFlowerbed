/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import fs from 'fs';
import { NodeIO } from '@gltf-transform/core';
import { simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { LODConfigs, LOD_FILENAME_SUFFIX } from '../src/js/LODConfigs.js';

/**
 * Takes an _already compressed mesh_, strips out collision meshes, and generates LODS for them
 *
 * @param {NodeIO} io
 * @param {string } compressedMeshPath
 * @param {number[]} factors - how simple to make the LODs. Range appears to be from 0-2, should go from highest to lowest
 * @param {number} error - how much the vertices can diverge from the shape of the mesh. default is 0.01.
 */
const _generateLod = async (
	io,
	sourceFilePath,
	compressedMeshPath,
	factors = [1],
	error = 0.01,
) => {
	const document = await io.read(compressedMeshPath);

	// remove all the colliders
	for (const node of document.getRoot().listNodes()) {
		if (!node.getMesh()) continue;

		const params = node.getExtras();
		if (params?.collider) {
			node.dispose();
		}
	}

	const dir = path.dirname(compressedMeshPath);
	for (let i = 0; i < factors.length; i++) {
		const ext = path.extname(compressedMeshPath);
		const baseName = path.basename(compressedMeshPath, ext);

		// we first check if there's a LOD file at the source filepath; if so, we abort because we don't want
		// to overwrite a manually generated lod
		const newFilename = baseName + `${LOD_FILENAME_SUFFIX}${i}`;
		if (
			fs.existsSync(
				path.resolve(
					path.dirname(sourceFilePath),
					newFilename + path.extname(sourceFilePath),
				),
			)
		) {
			continue;
		}

		const factor = factors[i];
		const lodDocument = document.clone();
		await lodDocument.transform(
			simplify({
				simplifier: MeshoptSimplifier,
				ratio: factor,
				error: error,
			}),
		);

		// we need to rename the bin files so they don't overwrite the old ones.
		for (const buffer of lodDocument.getRoot().listBuffers()) {
			buffer.setURI(newFilename + '.bin');
		}

		await io.write(path.resolve(dir, newFilename + ext), lodDocument);
	}
};

export const generateLodFromConfig = async (sourceFilename, targetPath, io) => {
	const lodConfigKey = Object.keys(LODConfigs).find((meshId) => {
		return LODConfigs[meshId].filename === path.basename(sourceFilename);
	});

	if (lodConfigKey) {
		const lodConfig = LODConfigs[lodConfigKey];
		console.log('generating LODs for ', sourceFilename);
		await _generateLod(
			io,
			sourceFilename,
			targetPath,
			lodConfig.factors,
			lodConfig.error,
		);
	}
};
