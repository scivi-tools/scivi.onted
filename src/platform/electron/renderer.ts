/** The renderer-side access to the Electron platform, exposed by the preload script. */
import type { Platform } from '../types';

declare global {
  interface Window {
    ontedPlatform?: Platform;
  }
}

export function getElectronPlatform(): Platform {
  if (!window.ontedPlatform) throw new Error('The Electron preload script is not loaded');
  return window.ontedPlatform;
}
