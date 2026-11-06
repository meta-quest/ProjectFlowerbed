/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Player settings as a signal, persisted on every change.
 */

import { signal } from '@iwsdk/core';
import { loadSettings, saveSettings, type Settings } from './storage.js';

export const settings = signal<Settings>(loadSettings());

export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.peek(), ...patch };
  saveSettings(settings.peek());
}
