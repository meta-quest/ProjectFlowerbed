/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// See https://github.com/eslint/eslint/issues/14137
// for why this cannot be an ECMA module.
module.exports = {
	env: {
		browser: true,
		es2021: true,
	},
	extends: ['eslint:recommended', 'prettier'],
	parserOptions: {
		ecmaVersion: 12,
		sourceType: 'module',
	},
	rules: {
		'sort-imports': [
			'warn',
			{
				ignoreCase: false,
				ignoreDeclarationSort: false,
				ignoreMemberSort: false,
				memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
				allowSeparatedGroups: false,
			},
		],
		'no-unused-vars': [
			'warn',
			{ vars: 'all', args: 'all', argsIgnorePattern: '^_' },
		],
		'lines-between-class-members': ['warn', 'always'],
		indent: ['error', 'tab', { SwitchCase: 1, ignoreComments: true }],
	},
};
