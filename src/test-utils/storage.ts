/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Storage wrappers for `vi.stubGlobal('localStorage', ...)`. Spying on
 * happy-dom's proxied localStorage does not restore cleanly, so tests swap
 * the global instead.
 */

export interface StorageOptions {
  /** Called before every setItem; throw to simulate a failing write. */
  onSet?: (key: string, value: string) => void;
}

export function wrapStorage(base: Storage, options: StorageOptions = {}): Storage {
  return {
    get length() {
      return base.length;
    },
    clear: () => base.clear(),
    getItem: (key) => base.getItem(key),
    key: (index) => base.key(index),
    removeItem: (key) => base.removeItem(key),
    setItem: (key, value) => {
      options.onSet?.(key, value);
      base.setItem(key, value);
    },
  };
}

/** A storage that reads normally but rejects every write (full or disabled). */
export function fullStorage(base: Storage): Storage {
  return wrapStorage(base, {
    onSet: () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    },
  });
}
