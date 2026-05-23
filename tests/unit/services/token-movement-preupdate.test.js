import '../../setup.js';

import {
  handlePreUpdateTokenMovement,
  shouldBlockWaitingSneakMovement,
} from '../../../scripts/services/token-movement-preupdate.js';

function makeTokenDoc({
  id = 'token-1',
  waitingSneak = false,
  waitingEffect = false,
  object = null,
} = {}) {
  return {
    id,
    actor: {
      itemTypes: {
        effect: waitingEffect ? [{ system: { slug: 'waiting-for-sneak-start' } }] : [],
      },
    },
    object,
    getFlag: jest.fn((moduleId, key) => {
      if (key === 'waitingSneak') return waitingSneak;
      return undefined;
    }),
  };
}

describe('token movement pre-update service', () => {
  test('does not block non-position updates', () => {
    expect(
      shouldBlockWaitingSneakMovement(makeTokenDoc({ waitingSneak: true }), { name: 'New' }, 'u1', {
        isAvsEnabled: () => true,
        isUserGm: () => false,
      }),
    ).toBe(false);
  });

  test('blocks non-GM movement while waiting for sneak start', () => {
    expect(
      shouldBlockWaitingSneakMovement(makeTokenDoc({ waitingSneak: true }), { x: 100 }, 'u1', {
        isAvsEnabled: () => true,
        isUserGm: () => false,
      }),
    ).toBe(true);
  });

  test('does not block GM movement while waiting for sneak start', () => {
    expect(
      shouldBlockWaitingSneakMovement(makeTokenDoc({ waitingEffect: true }), { x: 100 }, 'gm', {
        isAvsEnabled: () => true,
        isUserGm: () => true,
      }),
    ).toBe(false);
  });

  test('returns false and warns when waiting-sneak movement is blocked', () => {
    const warn = jest.fn();

    const result = handlePreUpdateTokenMovement(makeTokenDoc({ waitingSneak: true }), { x: 100 }, {}, 'u1', {
      isAvsEnabled: () => true,
      isUserGm: () => false,
      notifyWarn: warn,
    });

    expect(result).toBe(false);
    expect(warn).toHaveBeenCalledWith('You cannot move until Sneak has started.');
  });

  test('records pending movement without refreshing Visioner visuals before movement completes', () => {
    const setPendingTokenMovementPosition = jest.fn(() => true);
    const refreshPendingMovementTokenVisibility = jest.fn();

    handlePreUpdateTokenMovement(makeTokenDoc({ id: 'mover' }), { x: 100 }, { animate: true }, 'u1', {
      isAvsEnabled: () => false,
      isUserGm: () => false,
      getControlledTokens: () => [{ document: { id: 'mover' } }],
      setPendingTokenMovementPosition,
      refreshPendingMovementTokenVisibility,
    });

    expect(setPendingTokenMovementPosition).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mover' }),
      { x: 100 },
      [{ document: { id: 'mover' } }],
      {
        userId: 'u1',
        hookOptions: { animate: true },
        predictFinalVisibility: true,
      },
    );
    expect(refreshPendingMovementTokenVisibility).not.toHaveBeenCalled();
  });

  test('fires established invisible cleanup without awaiting it', () => {
    const clearEstablishedInvisibleStates = jest.fn().mockResolvedValue(undefined);
    const token = {
      actor: {
        hasCondition: jest.fn(() => true),
      },
    };

    handlePreUpdateTokenMovement(makeTokenDoc({ object: token }), { y: 200 }, {}, 'u1', {
      isAvsEnabled: () => false,
      isUserGm: () => false,
      setPendingTokenMovementPosition: jest.fn(() => false),
      getConditionManager: () => ({ clearEstablishedInvisibleStates }),
    });

    expect(clearEstablishedInvisibleStates).toHaveBeenCalledWith(token);
  });
});
