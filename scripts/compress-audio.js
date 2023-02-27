/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { readdirSyncRecursive } from './recursive-readdir.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const inDir = path.resolve(__dirname, '..', 'content', 'audio');
const audioFiles = readdirSyncRecursive(inDir);
const outDir = path.resolve(__dirname, '..', 'src', 'assets', 'audio');

if (!fs.existsSync(outDir)) {
	fs.mkdirSync(outDir);
}

// This compresses all sound effects and music into a .webm and .mp3 file using ffmpeg.
// The .webm file is used for most contexts, and falls back to .mp3 only if .webm isn't supported.

const desiredExtnames = ['.wav', '.mp3'];

for (let file of audioFiles) {
	if (desiredExtnames.includes(path.extname(file))) {
		const sourceFile = path.resolve(inDir, file);

		const targetFiles = [
			path.resolve(
				outDir,
				path.dirname(file),
				path.basename(file, path.extname(file)),
			) + '.webm',
			path.resolve(
				outDir,
				path.dirname(file),
				path.basename(file, path.extname(file)),
			) + '.mp3',
		];

		for (let targetFile of targetFiles) {
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
				execSync(`ffmpeg -y -i ${sourceFile} ${targetFile}`);
			} catch (e) {
				console.log(
					'In order to compress audio, you must have `ffmpeg` installed and on your path. See https://ffmpeg.org/ for more information.',
				);
				console.log(e);
			}
		}
	}
}
