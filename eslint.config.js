/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'public/**', 'artifacts/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node-run tooling: config files and maintenance scripts.
    files: ['*.config.{js,ts}', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'three',
              message: 'Import Three.js runtime values from @iwsdk/core to avoid duplicate runtimes.',
            },
          ],
          patterns: [
            {
              group: ['three/examples/jsm/loaders/*', 'three/addons/loaders/*'],
              importNames: ['default'],
              message: 'Use IWSDK AssetManager for runtime asset loading.',
            },
          ],
        },
      ],
    },
  },
  {
    // Runtime code: no `any`, and type-aware promise checks.
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
);
