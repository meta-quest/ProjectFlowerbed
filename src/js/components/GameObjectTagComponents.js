/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { TagComponent } from 'ecsy';

/**
 * Used on entities representing lights
 */
export class Light extends TagComponent {}

/**
 * Used for UI states on buttons, etc.
 */
export class Hovered extends TagComponent {}
export class Pressed extends TagComponent {}

/**
 * Used on UI elements to determine whether to show them or not
 */
export class IsActive extends TagComponent {}

/**
 * Attached to the main environment mesh only
 */
export class MainEnvironment extends TagComponent {}

/**
 * Used for handling behaviors for objects linked in the main
 * environment.
 */
export class EnvironmentProp extends TagComponent {}
