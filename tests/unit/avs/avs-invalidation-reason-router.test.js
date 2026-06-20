import { jest } from '@jest/globals';

import {
  AVS_INVALIDATION_REASON_HANDLERS,
  AvsInvalidationReasonRouter,
  changeAffectsLineOfSight,
  changeAffectsVisibility,
} from '../../../scripts/visibility/auto-visibility/core/AvsInvalidationReasonRouter.js';

function hasProperty(obj, path) {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) current = current[key];
    else return false;
  }
  return true;
}

describe('AvsInvalidationReasonRouter', () => {
  test('dispatches invalidation reasons to named handlers', () => {
    const ambientLightUpdated = jest.fn(() => 'handled');
    const router = new AvsInvalidationReasonRouter({
      handlersByName: { ambientLightUpdated },
    });
    const change = {
      reason: 'ambient-light-updated',
      changeData: { config: { bright: 20 } },
    };

    expect(router.dispatch(change)).toBe('handled');
    expect(ambientLightUpdated).toHaveBeenCalledWith(change);
  });

  test('returns false for unknown or unwired reasons', () => {
    const router = new AvsInvalidationReasonRouter({
      handlersByName: {},
    });

    expect(router.dispatch({ reason: 'unknown-reason' })).toBe(false);
    expect(router.dispatch({ reason: 'ambient-light-updated' })).toBe(false);
  });

  test('keeps all invalidation reason names in router ownership', () => {
    expect(AVS_INVALIDATION_REASON_HANDLERS).toEqual(expect.objectContaining({
      'ambient-light-updated': 'ambientLightUpdated',
      'wall-updated': 'wallUpdated',
      'token-position-updated': 'tokenPositionUpdated',
      'effect-visibility-updated': 'effectVisibilityUpdated',
    }));
  });

  test('detects visibility-affecting ambient light fields', () => {
    expect(changeAffectsVisibility(null, hasProperty)).toBe(true);
    expect(changeAffectsVisibility({ config: { bright: 20 } }, hasProperty)).toBe(true);
    expect(changeAffectsVisibility({ unrelated: true }, hasProperty)).toBe(false);
  });

  test('detects line-of-sight-affecting wall fields', () => {
    expect(changeAffectsLineOfSight(null, hasProperty)).toBe(true);
    expect(changeAffectsLineOfSight({ threshold: { sight: 10 } }, hasProperty)).toBe(true);
    expect(changeAffectsLineOfSight({ move: 1 }, hasProperty)).toBe(false);
  });
});
