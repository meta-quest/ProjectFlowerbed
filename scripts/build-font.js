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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourceDir = path.resolve(__dirname, '..', 'content', 'fonts');
const exportDir = path.resolve(__dirname, '..', 'src', 'assets', 'fonts');

/**
 * Creates a bitmap font representation of a .ttf font that can be used in three-mesh-ui.
 * @param {string} fontFilename name of the font, including .ttf extension. Assumes the font is in the /content/fonts directory. 
 * @param {number} fontSize font size in pixels. 
 */
const buildFont = (fontFilename, fontSize) => {
	const w = 512;
	const h = 512;

	const fontFile = path.resolve(sourceDir, fontFilename);

	const ext = path.extname(fontFile);
	const filename = path.basename(fontFile, ext) + `-${fontSize}`;
	const charsetFile = path.resolve(sourceDir, 'charset.txt');
	const exportPath = path.resolve(exportDir, filename + '.png');

	if (!fs.existsSync(exportDir)) {
		fs.mkdirSync(exportDir, { recursive: true });
	}
	execSync(
		`npx msdf-bmfont -f json -s ${fontSize} -o ${exportPath} -m ${w},${h} -i ${charsetFile} ${fontFile}`,
	);
	// JSON filename is always set to the same filename as the source file, so we need to modify that
	fs.renameSync(
		path.resolve(exportDir, path.basename(fontFile, ext) + '.json'),
		path.resolve(exportDir, filename + '.json'),
	);
};

buildFont('Roboto-Regular.ttf', 48);
buildFont('Roboto-Bold.ttf', 48);
