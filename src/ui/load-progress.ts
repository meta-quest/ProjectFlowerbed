/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Real loading progress for the landing page: counts asset requests under
 * /flowerbed/ as they start and finish. Installed before World.create.
 */

import { signal } from '@iwsdk/core';

export const loadProgress = signal(0);

export function trackAssetLoading(): void {
  let started = 0;
  let finished = 0;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/flowerbed/')) return original(input, init);
    started += 1;
    const done = () => {
      finished += 1;
      loadProgress.value = finished / Math.max(started, 1);
    };
    return original(input, init).then(
      (response) => {
        done();
        return response;
      },
      (error) => {
        done();
        throw error;
      },
    );
  };
}
