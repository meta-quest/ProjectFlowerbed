/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from 'fs';
import { ImagePool } from '@squoosh/lib';
import { readdirSyncRecursive } from './recursive-readdir.js';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// copy images from content/images to src/assets/images and do a little compression.
// this is here mostly so that if the entire src/assets folder gets blown away, we can still recreate it.
const compressImages = async () => {
	const inDir = path.resolve(__dirname, '..', 'content', 'images');
	const imageFiles = readdirSyncRecursive(inDir);
	const outDir = path.resolve(__dirname, '..', 'src', 'assets', 'images');

	const imagePool = new ImagePool();

	for (let file of imageFiles) {
		const sourceFile = path.resolve(inDir, file);

		const targetFile = path.resolve(outDir, file);
		const targetDir = path.dirname(targetFile);
		if (!fs.existsSync(targetDir)) {
			fs.mkdirSync(targetDir);
		}

		if (fs.existsSync(targetFile)) {
			const srcStat = fs.statSync(sourceFile);
			const targetStat = fs.statSync(targetFile);
			if (srcStat.mtime <= targetStat.mtime) {
				console.log(`Skipping compression of ${file}.`);
				continue;
			}
		}

		const image = imagePool.ingestImage(sourceFile);
		const encodeOptions = {};
		if (path.extname(file) === '.jpg') {
			encodeOptions.mozjpeg = {};
		} else {
			encodeOptions.oxipng = {};
		}
		await image.encode(encodeOptions);

		for (const encodedImage of Object.values(image.encodedWith)) {
			fs.writeFileSync(targetFile, (await encodedImage).binary);
			console.log(`Successfully compressed ${file}`)
		}
	}
	await imagePool.close();
};

compressImages();
