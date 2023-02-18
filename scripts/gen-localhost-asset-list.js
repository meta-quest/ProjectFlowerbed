/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * This is used to generate the src/js/config/localURLs/LocalURLs.js file, which is only relevant
 * if using localhost to hotswap models (disabled by default, since it was a debug tool.) 
 */
import fs from 'fs';
import path, { dirname } from 'path';

import { AssetURLs } from '../src/js/config/github/AssetURLs.js';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let localhostAssets = {};

let serverName = `http://localhost:8080/`

for (let mesh in AssetURLs.MESHES) {
	// filename should just be lowercase mesh name
	const expectedFilename = mesh.toLocaleLowerCase();

	// allow both gltf and glb
	localhostAssets[mesh] = [
		`${serverName}${expectedFilename}.gltf`,
		`${serverName}${expectedFilename}.glb`,
	];
}

let header = `/**
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/

/**
Auto-generated file.

This is a list of all of the models that are expected in the experience, and where on a localhost server
the experience will look for them.

If you create a localhost server on port 8080 and have models available at any of the URLs expected for each model
(either .gltf or .glb), the experience will use those models instead of the ones included by default in the
built version, allowing you to preview models without needing a fresh build of Flowerbed. If any model doesn't exist
on the localhost server, it'll fall back to the one that's included in the build.

(Also note that this code path will only run if ENABLE_LOCALHOST_ASSETS in src/js/Constants.js is set to true.)

Note that the localhost server needs CORS enabled so that Flowerbed can fetch the models from it; this can be done
with the http-server npm module by running

$ http-server --cors

on the directory with the replacement assets.

Note that some models require specific anchor points or named objects to function; without them, the experience
may fail to run, or that particular model may look incorrect.
*/
`

let finalString = `${header}

export const LocalAssetURLs = ${JSON.stringify(
	localhostAssets,
	null,
	'\t',
)}`;

fs.writeFileSync(path.resolve(__dirname, '../src/js/config/localURLs/LocalURLs.js'), finalString);
