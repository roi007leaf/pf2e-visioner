import '../../setup.js';

import * as intents from '../../../scripts/visibility/auto-visibility/core/TokenInvalidationIntents.js';

describe('TokenInvalidationIntents', () => {
  const tokenDoc = { id: 'token-1' };
  const changes = { x: 100, y: 120 };
  const context = { options: { animate: true }, userId: 'user-1' };

  test('builds movement intents with update context', () => {
    expect(intents.tokenPositionUpdated(tokenDoc, changes, context)).toEqual({
      reason: 'token-position-updated',
      document: tokenDoc,
      changeData: changes,
      options: { animate: true },
      userId: 'user-1',
    });

    expect(intents.tokenMovementCompleted(tokenDoc, changes, context)).toEqual({
      reason: 'token-movement-completed',
      document: tokenDoc,
      changeData: changes,
      options: { animate: true },
      userId: 'user-1',
    });
  });

  test('builds validation-only movement intents without visibility recalculation policy', () => {
    expect(intents.tokenMovementOverrideValidationRequired(tokenDoc, changes, context)).toEqual({
      reason: 'token-movement-override-validation-required',
      document: tokenDoc,
      changeData: changes,
      options: { animate: true },
      userId: 'user-1',
    });
  });

  test('builds lifecycle intents with only the document', () => {
    expect(intents.tokenCreated(tokenDoc)).toEqual({
      reason: 'token-created',
      document: tokenDoc,
    });
    expect(intents.tokenDeleted(tokenDoc)).toEqual({
      reason: 'token-deleted',
      document: tokenDoc,
    });
  });

  test('builds token update intents with stable reason names', () => {
    expect(intents.tokenLightUpdated(tokenDoc, changes, context).reason).toBe('token-light-updated');
    expect(intents.tokenLightEmitterMoved(tokenDoc, changes, context).reason).toBe(
      'token-light-emitter-moved',
    );
    expect(intents.tokenLightRecalculationRequired(tokenDoc, changes, context).reason).toBe(
      'token-light-recalculation-required',
    );
    expect(intents.tokenMovementActionCacheInvalidated(tokenDoc, changes, context).reason).toBe(
      'token-movement-action-cache-invalidated',
    );
    expect(intents.tokenMovementActionUpdated(tokenDoc, changes, context).reason).toBe(
      'token-movement-action-updated',
    );
    expect(intents.tokenHiddenToggled(tokenDoc, changes, context).reason).toBe(
      'token-hidden-toggled',
    );
    expect(intents.tokenVisibilityAffectingUpdated(tokenDoc, changes, context).reason).toBe(
      'token-visibility-affecting-updated',
    );
  });
});
