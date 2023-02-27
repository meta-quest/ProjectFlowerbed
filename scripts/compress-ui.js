/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from 'fs';
import { readdirSyncRecursive } from './recursive-readdir.js';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// all this does is minify the json for the UI elements and copy it to the src/assets directory
const compressUI = async () => {
	const inDir = path.resolve(__dirname, '..', 'content', 'ui');
	const files = readdirSyncRecursive(inDir);
	const outDir = path.resolve(__dirname, '..', 'src', 'assets', 'ui');

	for (let file of files) {
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

		try {
			const parsedJSON = JSON.parse(fs.readFileSync(sourceFile));
			fs.writeFileSync(targetFile, JSON.stringify(parsedJSON));
		} catch (e) {
			console.warn(e);
			continue;
		}
	}
};

compressUI();
