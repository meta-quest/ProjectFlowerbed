/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Used primarily for bitwise collision layer checking
 * Checks if all the bits in the `allToMatch` are also set in the `source`
 * @param {number} source
 * @param {number} allToMatch
 * @returns
 */
export const doesMatchAll = (source, allToMatch) => {
	return (source & allToMatch) === allToMatch;
};

/**
 * Used primarily for bitwise collision layer checking
 * Checks if any the bits in the `someToMatch` are also set in the `source`,
 * and fails if there are no matches
 * @param {number} source
 * @param {number} someToMatch
 * @returns
 */
export const doesMatchSome = (source, someToMatch) => {
	return (source & someToMatch) > 0;
};

/**
 * Used primarily for bitwise collision layer checking
 * Checks if any the bits in the `noneToMatch` are also set in the `source`,
 * failing if there are any matches
 * @param {number} source
 * @param {number} noneToMatch
 * @returns
 */
export const doesMatchNone = (source, noneToMatch) => {
	return (source & noneToMatch) === 0;
};
