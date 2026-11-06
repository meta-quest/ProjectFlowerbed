/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const rootDir = dirname(fileURLToPath(import.meta.url));

/** Ship the licenses with every build (the live demo serves dist/ as-is). */
function emitLegalFiles(): Plugin {
  return {
    name: 'emit-legal-files',
    writeBundle(outputOptions) {
      const outputRoot = resolve(rootDir, outputOptions.dir ?? 'dist');
      for (const file of ['LICENSE', 'THIRD_PARTY_ASSETS.md']) {
        copyFileSync(resolve(rootDir, file), resolve(outputRoot, file));
      }
    },
  };
}

export default defineConfig({
  plugins: [iwsdkDev(), emitLegalFiles()],
  server: { host: '0.0.0.0', port: 8081, open: false },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  // @drawcall/uikitml otherwise pulls a second three/@pmndrs/uikit graph
  // (its own three vs the app's super-three alias). Duplicate Component classes break
  // instanceof checks → "Only pmndrs/uikit components can be added as children".
  resolve: {
    dedupe: ['three', '@pmndrs/uikit', '@pmndrs/uikit-horizon', '@pmndrs/uikit-lucide'],
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: ['three', '@pmndrs/uikit', '@pmndrs/uikit-horizon', '@pmndrs/uikit-lucide', '@drawcall/uikitml'],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  // Relative URLs so the build works from any subpath (GitHub Pages serves /project-flowerbed/).
  base: './',
});
