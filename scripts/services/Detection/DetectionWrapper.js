import { registerDetectionWrappers } from './detection-wrapper-registration.js';

/**
 * Class wrapper for PF2E detection integration to support init/teardown.
 * The old initializeDetectionWrapper() remains for compatibility.
 */
export class DetectionWrapper {
  constructor() {
    this._registered = false;
  }

  register() {
    if (this._registered) return;
    if (!game.modules.get('lib-wrapper')?.active) {
      console.warn(
        'Per-Token Visibility: libWrapper not found - visual conditions may not work properly',
      );
      return;
    }

    registerDetectionWrappers();

    this._registered = true;
  }

  /** Best-effort unregister. libWrapper doesn't expose an unregister; rely on reload lifecycle. */
  unregister() {
    // no-op by design; kept for symmetry and future-proofing
  }
}

export function initializeDetectionWrapper() {
  try {
    (DetectionWrapper._instance ||= new DetectionWrapper()).register();
  } catch (_) { }
}
