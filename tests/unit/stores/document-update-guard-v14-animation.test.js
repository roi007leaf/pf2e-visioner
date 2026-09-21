import {
  clearPendingTokenMovementPosition,
  setPendingTokenMovementPosition,
} from '../../../scripts/services/movement-tracking.js';
import {
  isTokenActivelyAnimating,
  shouldDeferTokenDocumentUpdate,
  waitForTokenDocumentUpdateSafe,
} from '../../../scripts/stores/document-update-guard.js';

function tweeningToken({ withPromise = true, contexts = 0 } = {}) {
  const document = { id: 'ez', x: 1929, y: 8100, parent: { tokens: new Map() } };
  document.parent.tokens.set('ez', document);
  return {
    x: 1929,
    y: 8100,
    document,
    animationContexts: { size: contexts },
    movementAnimationPromise: withPromise ? new Promise(() => {}) : null,
  };
}

describe('document update guard on Foundry v14 movement animation', () => {
  test('a token with a pending movementAnimationPromise counts as animating even when render x == document x', () => {
    const token = tweeningToken();
    expect(isTokenActivelyAnimating(token)).toBe(true);
    expect(shouldDeferTokenDocumentUpdate(token)).toBe(true);
  });

  test('a token with active animation contexts counts as animating', () => {
    const token = tweeningToken({ withPromise: false, contexts: 1 });
    expect(shouldDeferTokenDocumentUpdate(token)).toBe(true);
  });

  test('a token whose move was recorded in preUpdateToken but not yet acknowledged defers', () => {
    const token = tweeningToken({ withPromise: false, contexts: 0 });
    token.controlled = true;
    const saved = globalThis.canvas;
    globalThis.canvas = { tokens: { controlled: [token] } };
    try {
      expect(setPendingTokenMovementPosition(token.document, { x: 2300 }, [token])).toBe(true);
      expect(shouldDeferTokenDocumentUpdate(token)).toBe(true);
    } finally {
      clearPendingTokenMovementPosition('ez');
      globalThis.canvas = saved;
    }
    expect(shouldDeferTokenDocumentUpdate(token)).toBe(false);
  });

  test('a settled token does not defer', () => {
    const token = tweeningToken({ withPromise: false, contexts: 0 });
    expect(shouldDeferTokenDocumentUpdate(token)).toBe(false);
  });

  test('a token document (not placeable) resolves the placeable through .object', () => {
    const token = tweeningToken();
    token.document.object = token;
    expect(shouldDeferTokenDocumentUpdate(token.document)).toBe(true);
  });

  test('waitForTokenDocumentUpdateSafe resolves once the movement promise settles', async () => {
    const token = tweeningToken({ withPromise: false });
    let finish;
    token.movementAnimationPromise = new Promise((resolve) => {
      finish = resolve;
    });
    let resolved = false;
    const wait = waitForTokenDocumentUpdateSafe(token, { intervalMs: 1 }).then(() => {
      resolved = true;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false);
    token.movementAnimationPromise = null;
    finish();
    await wait;
    expect(resolved).toBe(true);
  });
});
