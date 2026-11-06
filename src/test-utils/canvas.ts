/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * happy-dom has no 2D canvas, so getContext('2d') returns null and modules
 * that paint small textures at import time throw. Importing this module
 * first installs a recording no-op 2D context. Every call is logged in
 * `canvasCalls` so tests can assert on what was drawn.
 */

export interface CanvasCall {
  canvas: HTMLCanvasElement;
  method: string;
  args: unknown[];
}

export const canvasCalls: CanvasCall[] = [];

const gradient = { addColorStop: () => {} };

function fakeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = { canvas };
  return new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        canvasCalls.push({ canvas, method: String(prop), args });
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient' || prop === 'createPattern') {
          return gradient;
        }
        if (prop === 'measureText') return { width: 0 };
        if (prop === 'getImageData' || prop === 'createImageData') {
          const [, , w = 1, h = 1] = args as number[];
          return { width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) };
        }
        return undefined;
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
const original = HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.getContext = function getContext(
  this: HTMLCanvasElement,
  type: string,
  ...rest: unknown[]
) {
  if (type !== '2d') return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
  let context = contexts.get(this);
  if (!context) contexts.set(this, (context = fakeContext(this)));
  return context;
} as typeof HTMLCanvasElement.prototype.getContext;
