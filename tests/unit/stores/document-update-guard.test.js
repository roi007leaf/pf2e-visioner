import '../../setup.js';
import {
  isTokenActivelyAnimating,
  shouldDeferTokenDocumentUpdate,
} from '../../../scripts/stores/document-update-guard.js';

describe('document-update-guard - v13 movement tween detection', () => {
  test('isTokenActivelyAnimating is true when only movementAnimationPromise is set (v13)', () => {
    const token = {
      object: { _animation: null, x: 100, y: 100, movementAnimationPromise: new Promise(() => {}) },
      x: 100,
      y: 100,
    };
    expect(isTokenActivelyAnimating(token)).toBe(true);
  });

  test('isTokenActivelyAnimating is false when no animation and no movement promise', () => {
    const token = { object: { _animation: null, x: 100, y: 100 }, x: 100, y: 100 };
    expect(isTokenActivelyAnimating(token)).toBe(false);
  });

  test('shouldDeferTokenDocumentUpdate defers during a v13 tween even when render==document position', () => {
    const token = {
      object: { _animation: null, x: 500, y: 500, movementAnimationPromise: new Promise(() => {}) },
      x: 500,
      y: 500,
    };
    expect(shouldDeferTokenDocumentUpdate(token)).toBe(true);
  });

  test('shouldDeferTokenDocumentUpdate does not defer a settled token', () => {
    const token = { object: { _animation: null, x: 500, y: 500 }, x: 500, y: 500 };
    expect(shouldDeferTokenDocumentUpdate(token)).toBe(false);
  });
});
