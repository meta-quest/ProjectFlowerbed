/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Application component catalog, shared by the runtime and the editor.
 */

import { defineComponents } from '@iwsdk/core';
import { PhotoEasel, Plant, Seed } from './components/garden.js';

export default defineComponents([Plant, Seed, PhotoEasel]);
