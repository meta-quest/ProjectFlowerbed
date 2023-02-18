/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { readdirSyncRecursive } from './recursive-readdir.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const inDir = path.resolve(__dirname, '..', 'content', 'videos');
const videoFiles = readdirSyncRecursive(inDir);
const outDir = path.resolve(__dirname, '..', 'src', 'assets', 'videos');

if (!fs.existsSync(outDir)) {
	fs.mkdirSync(outDir);
}

const desiredExtnames = ['.mp4', '.mkv'];

// This compresses all video files into .webm files using ffmpeg.

for (let file of videoFiles) {
	if (desiredExtnames.includes(path.extname(file))) {
		const sourceFile = path.resolve(inDir, file);
		const targetFile =
			path.resolve(
				outDir,
				path.dirname(file),
				path.basename(file, path.extname(file)),
			) + '.mp4';

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
			execSync(`ffmpeg -y -i ${sourceFile} -vf "scale='w=min(720,iw)':'h=-2'" -crf 28 -an ${targetFile}`);
		} catch (e) {
			console.log(
				'In order to compress video, you must have `ffmpeg` installed and on your path. See https://ffmpeg.org/ for more information.',
			);
			console.log(e);
		}
	}
}
