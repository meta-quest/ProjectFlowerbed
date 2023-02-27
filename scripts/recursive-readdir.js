/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as fs from 'fs'
import * as path from 'path'

const _readdirSyncRecursive = function (
	dirPath,
	originalDirPath,
	arrayOfFiles,
) {
	let files = fs.readdirSync(dirPath);

	originalDirPath = originalDirPath || dirPath;
	arrayOfFiles = arrayOfFiles || [];

	files.forEach(function (file) {
		if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
			arrayOfFiles = _readdirSyncRecursive(
				path.join(dirPath, file),
				originalDirPath,
				arrayOfFiles,
			);
		} else {
			arrayOfFiles.push(
				path.normalize(
					path.relative(originalDirPath, path.join(dirPath, file)),
				),
			);
		}
	});

	return arrayOfFiles;
};

export const readdirSyncRecursive = function (dirPath) {
	return _readdirSyncRecursive(dirPath);
};
