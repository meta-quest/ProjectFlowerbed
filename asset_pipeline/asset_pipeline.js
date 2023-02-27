/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { NodeIO } from '@gltf-transform/core';
import {
	MeshoptCompression,
	KHRONOS_EXTENSIONS,
} from '@gltf-transform/extensions';
import {
	dedup,
	unweld,
	weld,
	tangents,
	reorder,
	quantize,
	textureResize,
	oxipng,
} from '@gltf-transform/functions';
import { Mode, toktx } from '@gltf-transform/cli';
import { GeometryScaledSegments } from './ext-scaled-segments.js';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { generateTangents } from 'mikktspace';

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as readdr from '../scripts/recursive-readdir.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { generateLodFromConfig } from './generate_lod.js';
import * as squoosh from '@squoosh/lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;

const io = new NodeIO()
	.registerExtensions(KHRONOS_EXTENSIONS)
	.registerExtensions([GeometryScaledSegments])
	.registerDependencies({
		'meshopt.decoder': MeshoptDecoder,
		'meshopt.encoder': MeshoptEncoder,
	});

async function stripAnimations(document) {
	document
		.getRoot()
		.listAnimations()
		.forEach((anim) => {
			anim.listChannels().forEach((channel) => {
				channel.dispose();
			});
			anim.dispose();
		});
}

/**
 * Given a path to a .gltf file, this compresses textures (using toktx), compresses the GLTF with meshopt,
 * and dedupes nodes, saving the result also as a .gltf file.
 * @param {string} inputPath 
 * @param {string} outputPath 
 * @param {*} options - see defaultOptions below in the compressGLTFs function for what can be changed;
 * these are used to change parameters for different directories
 */
async function processGLTF(inputPath, outputPath, options) {
	const document = await io.read(inputPath);
	// document.setLogger(new Logger(Logger.Verbosity.DEBUG))

	if (options.stripAnimations) {
		// strip animations
		await stripAnimations(document);
	}

	if (options.resizeTextures) {
		// todo:  make these options more exposed based on type of asset
		// resize textures.  these currently can only be filtered on a regex on the name - soon slot filtering will work (like for toktx below)
		await document.transform(textureResize({ size: [1024, 1024] }));

		await document.transform(
			textureResize({ size: [32, 32], pattern: /metallic/i }),
		);
	}

	// all texture resizing has to happen BEFORE textures get converted to KTX2 textures

	if (options.compressTextures) {
		// we can filter based on texture slots - color, occlusion, emissive, normal, metallicroughness
		// the texture gets processed if it matches ANY of the slots in the array
		// await document.transform( toktx({slots:["metallicroughness"],mode:Mode.UASTC}));

		// squoosh the files as png first to get rid of ICC profiles
		await document.transform(
			oxipng({
				squoosh: squoosh,
				slots: /color/i,
			}),
		);

		await document.transform(
			toktx({
				slots: ['color'],
				mode: options.useUASTCForDiffuse ? Mode.UASTC : Mode.ETC1S,
			}),
		);
		await document.transform(
			toktx({
				slots: ['occlusion', 'emissive', 'normal', 'metallicroughness'],
				mode: Mode.UASTC,
			}),
		);
	}

	await document.transform(unweld(), tangents({ generateTangents }), weld());

	if (options.dedup) {
		await document.transform(dedup());
	}
	await document.transform(
		reorder({ encoder: MeshoptEncoder, target: 'performance' }),
	);

	// if we ever want to go back to the scaled animation extension, this is how to apply it
	// await document.transform(GeometryScaledSegments.apply);

	if (options.quantize) {
		const quantizeLevel = 'medium';
		await document.transform(
			quantize({
				// IMPORTANT: Vertex attributes should be quantized in 'high' mode IFF they are
				// _not_ filtered in 'packages/extensions/src/ext-meshopt-compression/encoder.ts'.
				pattern:
					quantizeLevel === 'medium'
						? /.*/
						: /^(POSITION|TEXCOORD|JOINTS|WEIGHTS)(_\d+)?$/,
				quantizePosition: 14,
				quantizeTexcoord: 12,
				quantizeColor: 8,
				quantizeNormal: 8,
			}),
		);
	}

	// add "filter" encoding to minimize gzipped size
	document
		.createExtension(MeshoptCompression)
		.setRequired(true)
		.setEncoderOptions({
			method: MeshoptCompression.EncoderMethod.FILTER,
		});

	await io.write(outputPath, document);
}

const isSubdirectoryOf = (parent, dir) => {
	const relative = path.relative(parent, dir);
	return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
};

const compressGLTFs = async () => {
	const inDir = path.resolve(__dirname, '../content/models');
	const outDir = path.resolve(__dirname, '../src/assets/models');

	console.log(`Compressing GLTFs. Please note that if a compressed GLTF file already exists
in the 'src/assets' folder with the expected filename, the compression will be skipped.
This is to ensure that only new models are compressed, as compression can take a long time.

If you need to compress an existing model, first delete the version inside the 'src/assets' folder.

Texture compression requires toktx, which can be installed as part of the KTX texture tools
available at https://github.com/KhronosGroup/KTX-Software/releases
+++++++++++++`);

	const exts = ['.gltf', '.glb'];

	const defaultOptions = {
		stripAnimations: true,
		dedup: true,
		quantize: true,
		resizeTextures: true,
		compressTextures: true,
		useUASTCForDiffuse: false,
		useGLTFPack: false, // this overrides all other formats and uses the gltfpack pipeline instead.
		// quantize is still taken into account.
	};

	const customOptions = {
		environment: {
			quantize: false,
			dedup: false,
		},
		fauna: {
			stripAnimations: false,
		},
		flora: {
			stripAnimations: false,
		},
		NUX: {
			quantize: false,
		},
		'props/Prop_Mode_Tiles': {
			// tiles need GLTFPack because they don't work on gltf-transform
			quantize: false,
			useGLTFPack: true,
		},
	};

	const models = readdr.readdirSyncRecursive(inDir);
	for (let model of models) {
		if (exts.indexOf(path.extname(model)) < 0) {
			continue;
		}

		const targetPath = path.resolve(outDir, model);
		const targetDir = path.dirname(targetPath);
		if (!fs.existsSync(targetDir)) {
			fs.mkdirSync(targetDir, { recursive: true });
		}

		const name = path.basename(model, path.extname(model));
		const sourceFilename = path.resolve(inDir, model);

		let processingOptions = defaultOptions;

		let shouldSkip = false;
		for (let folder in customOptions) {
			if (isSubdirectoryOf(path.resolve(inDir, folder), sourceFilename)) {
				if (customOptions[folder] === false) {
					shouldSkip = true;
					continue;
				}
				console.log(`using custom options ${folder}`);
				processingOptions = { ...defaultOptions, ...customOptions[folder] };
			}
		}

		if (shouldSkip) {
			continue;
		}

		if (fs.existsSync(targetPath)) {
			const srcStat = fs.statSync(sourceFilename);
			const targetStat = fs.statSync(targetPath);

			if (srcStat.mtime <= targetStat.mtime) {
				console.log(`Skipping compression of ${name}.`);
				await generateLodFromConfig(sourceFilename, targetPath, io);
				continue;
			}
		}

		if (name.match(/prop_sky/i)) {
			processingOptions.useUASTCForDiffuse = true;
		}

		if (processingOptions.useGLTFPack) {
			// you should install gltfpack natively to use the gltfpack options.
			// the npm version doesn't handle texture compression.
			// (see https://www.npmjs.com/package/gltfpack)
			let gltfPackCommand = `gltfpack -i ${sourceFilename} -o ${targetPath} -cc -tc -tp -mi -km -kn -ke -tu`;
			if (processingOptions.quantize === false) {
				gltfPackCommand += ' -noq';
			}
			try {
				execSync(gltfPackCommand);
				console.log('Saved ' + name);
			} catch (e) {
				console.error('Failed to compress with gltfpack: ', e);
			}
			continue;
		}

		try {
			await processGLTF(sourceFilename, targetPath, processingOptions);
			console.log('Saved ' + name);
		} catch (e) {
			console.error('Failed to compress with gltf-transform: ', e);
			return;
		}

		await generateLodFromConfig(sourceFilename, targetPath, io);
	}
};

compressGLTFs();
