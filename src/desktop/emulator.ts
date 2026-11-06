/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Desktop fallback (legacy xplat): on browsers without immersive VR, install
 * the IWER emulated Quest 3 so the full experience runs on a laptop, driven
 * by mouse and keyboard (see desktop-system.ts). In development IWSDK
 * already injects IWER as window.IWER_DEVICE.
 */

export interface EmulatedDevice {
  position: { set(x: number, y: number, z: number): void; x: number; y: number; z: number };
  quaternion: { set(x: number, y: number, z: number, w: number): void };
  stereoEnabled: boolean;
  controllers: Partial<
    Record<
      'left' | 'right',
      {
        position: { set(x: number, y: number, z: number): void };
        quaternion: { set(x: number, y: number, z: number, w: number): void };
        updateButtonValue(id: string, value: number): void;
        updateButtonTouch(id: string, touched: boolean): void;
        updateAxes(id: string, x: number, y: number): void;
      }
    >
  >;
}

let device: EmulatedDevice | null = null;
let installedByUs = false;

/** Install IWER when the browser cannot present immersive VR. */
export async function ensureEmulator(): Promise<void> {
  const existing = (window as unknown as { IWER_DEVICE?: EmulatedDevice }).IWER_DEVICE;
  if (existing) {
    device = existing;
    return;
  }
  const supported = await navigator.xr?.isSessionSupported('immersive-vr').catch(() => false);
  if (supported) return;
  const { XRDevice, metaQuest3 } = await import('iwer');
  const emulated = new XRDevice(metaQuest3);
  emulated.stereoEnabled = false;
  // Chrome ships a native XRSystem with no hardware; replace it.
  emulated.installRuntime({ forceInstall: true });
  device = emulated as unknown as EmulatedDevice;
  installedByUs = true;
}

export function emulatedDevice(): EmulatedDevice | null {
  return device;
}

/** Desktop bindings apply when we installed IWER, or when forced with ?desktop. */
export function desktopMode(): boolean {
  return device != null && (installedByUs || new URLSearchParams(location.search).has('desktop'));
}
