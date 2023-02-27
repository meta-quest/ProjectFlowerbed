/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export const experienceStartedEvent = new Event('experiencestart', {
	bubbles: true,
});

export const experienceEndedEvent = new Event('experienceend', {
	bubbles: true,
});

/** PHOTO EVENTS */

/**
 * Fired when a photo is deleted by using one of the photo buttons (but not if it autoclears)
 * Used for the photo contextual tooltips.
 * should be attached to `window`
 */
export const usedPhotoButtonEvent = new Event('photocleared');

/** UI EVENTS */

/**
 * Fired when the NUX state has been reset, which tells the ResetNUXSystem to also clear out the localstorage
 * flag. Should be attached to `window`.
 */
export const resetNUXEvent = new Event('resetnux');

/**
 * Fired when any of the settings change, which tells the SettingsSystem to start or stop other systems based on
 * what the settings' values are. Should be attached to `window`.
 */
export const changedSettingsEvent = new Event('changedsettings');
