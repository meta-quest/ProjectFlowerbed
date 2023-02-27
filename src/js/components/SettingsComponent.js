/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, TagComponent, Types } from 'ecsy';
import { StorageInterface } from '../lib/StorageInterface';
import { changedSettingsEvent } from '../lib/CustomEvents';

export class SettingsPanelComponent extends TagComponent {}
export class ControlsPanelComponent extends TagComponent {}

/**
 * This contains all of the _savable_ settings, and is serialized to localstorage every time it's modified.
 * Do not add in-game state to this component.
 */
export class SettingsComponent extends Component {
	/**
	 *
	 * @param {typeof SettingsComponent.schema} newSettings the settings to override. Omitted fields are not overridden.
	 */
	updateSettings(newSettings) {
		this.vignetteEnabled = newSettings.vignetteEnabled ?? this.vignetteEnabled;
		this.musicEnabled = newSettings.musicEnabled ?? this.musicEnabled;

		// save the settings
		const settingsValues = this.serialize();
		StorageInterface.saveSettings(settingsValues);
		window.dispatchEvent(changedSettingsEvent);
	}
}

SettingsComponent.schema = {
	vignetteEnabled: { type: Types.Boolean, default: true },
	musicEnabled: { type: Types.Boolean, default: true },
};
