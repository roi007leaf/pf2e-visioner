import '../../setup.js';

import {
  hasActivePendingTokenMovement,
  hasPendingTokenMovementPosition,
  setPendingTokenMovementPosition,
  clearPendingTokenMovementPosition,
  completePendingTokenMovement,
  schedulePendingTokenMovementCompletion,
} from '../../../scripts/services/movement-tracking.js';

function makeTokenDoc(id, overrides = {}) {
  return {
    id,
    x: 100,
    y: 200,
    isOwner: false,
    testUserPermission: jest.fn(() => false),
    ownership: {},
    actor: null,
    object: null,
    ...overrides,
  };
}

function makeControlledToken(id) {
  return { id, document: { id } };
}

afterEach(() => {
  globalThis.__pf2eVisionerHasActivePendingTokenMovement = false;
  jest.useRealTimers();
});

describe('setPendingTokenMovementPosition', () => {
  test('1. returns false when changes has neither x nor y', () => {
    const tokenDoc = makeTokenDoc('t1');
    const result = setPendingTokenMovementPosition(tokenDoc, { z: 5 }, [], {});
    expect(result).toBe(false);
    expect(hasPendingTokenMovementPosition('t1')).toBe(false);
    clearPendingTokenMovementPosition('t1');
  });

  test('2. controlled token with x change → returns true; active + has flags', () => {
    const tokenDoc = makeTokenDoc('t2');
    const controlled = [makeControlledToken('t2')];
    const result = setPendingTokenMovementPosition(tokenDoc, { x: 300 }, controlled, {});
    expect(result).toBe(true);
    expect(hasActivePendingTokenMovement()).toBe(true);
    expect(hasPendingTokenMovementPosition('t2')).toBe(true);
    clearPendingTokenMovementPosition('t2');
  });

  test('3. echoed move (GM client, options.userId !== game.user.id) → returns false', () => {
    global.game.user = { id: 'gm-user', isGM: true };
    const tokenDoc = makeTokenDoc('t3');
    const result = setPendingTokenMovementPosition(tokenDoc, { x: 50 }, [], { userId: 'other-user' });
    expect(result).toBe(false);
    expect(hasPendingTokenMovementPosition('t3')).toBe(false);
    clearPendingTokenMovementPosition('t3');
  });

  test('4. GM client, GM moved own token (options.userId === game.user.id) → returns true (gm-token)', () => {
    global.game.user = { id: 'gm-user', isGM: true };
    const tokenDoc = makeTokenDoc('t4');
    const result = setPendingTokenMovementPosition(tokenDoc, { x: 50 }, [], { userId: 'gm-user' });
    expect(result).toBe(true);
    expect(hasPendingTokenMovementPosition('t4')).toBe(true);
    clearPendingTokenMovementPosition('t4');
  });

  test('5. Non-GM owner (tokenDoc.isOwner true) with no options.userId → returns true', () => {
    global.game.user = { id: 'player-user', isGM: false };
    const tokenDoc = makeTokenDoc('t5', { isOwner: true });
    const result = setPendingTokenMovementPosition(tokenDoc, { x: 50 }, [], {});
    expect(result).toBe(true);
    expect(hasPendingTokenMovementPosition('t5')).toBe(true);
    clearPendingTokenMovementPosition('t5');
  });
});

describe('completePendingTokenMovement', () => {
  beforeEach(() => {
    global.game.user = { id: 'gm-user', isGM: true };
    global.Hooks.callAll.mockClear();
  });

  test('6. fires hook once with correct payload, clears entry', () => {
    const tokenDoc = makeTokenDoc('t6');
    const controlled = [makeControlledToken('t6')];
    setPendingTokenMovementPosition(tokenDoc, { x: 400, y: 500 }, controlled, {});

    const entry = hasPendingTokenMovementPosition('t6');
    expect(entry).toBe(true);

    global.canvas.tokens.get = jest.fn((id) => id === 't6' ? null : null);

    const result = completePendingTokenMovement('t6');
    expect(result).toBe(true);

    expect(global.Hooks.callAll).toHaveBeenCalledTimes(1);
    const [eventName, payload] = global.Hooks.callAll.mock.calls[0];
    expect(eventName).toBe('pf2e-visioner.pendingTokenMovementComplete');
    expect(payload.tokenId).toBe('t6');
    expect(payload.tokenDoc).toBe(tokenDoc);
    expect(payload.movementChanges).toEqual({ x: 400, y: 500 });

    expect(hasPendingTokenMovementPosition('t6')).toBe(false);
  });

  test('7. mismatched expectedSerial → returns false, no hook, entry remains', () => {
    const tokenDoc = makeTokenDoc('t7');
    const controlled = [makeControlledToken('t7')];
    setPendingTokenMovementPosition(tokenDoc, { x: 100 }, controlled, {});

    const result = completePendingTokenMovement('t7', 99999);
    expect(result).toBe(false);
    expect(global.Hooks.callAll).not.toHaveBeenCalled();
    expect(hasPendingTokenMovementPosition('t7')).toBe(true);
    clearPendingTokenMovementPosition('t7');
  });

  test('8. TTL: advance timers 2500ms → hook fired and entry cleared', () => {
    jest.useFakeTimers();
    const tokenDoc = makeTokenDoc('t8');
    const controlled = [makeControlledToken('t8')];
    setPendingTokenMovementPosition(tokenDoc, { x: 700 }, controlled, {});

    expect(hasPendingTokenMovementPosition('t8')).toBe(true);

    jest.advanceTimersByTime(2500);

    expect(global.Hooks.callAll).toHaveBeenCalledWith(
      'pf2e-visioner.pendingTokenMovementComplete',
      expect.objectContaining({ tokenId: 't8' }),
    );
    expect(hasPendingTokenMovementPosition('t8')).toBe(false);
    jest.useRealTimers();
  });
});

describe('clearPendingTokenMovementPosition', () => {
  test('9. removes entry and global flag becomes false', () => {
    global.game.user = { id: 'gm-user', isGM: true };
    const tokenDoc = makeTokenDoc('t9');
    const controlled = [makeControlledToken('t9')];
    setPendingTokenMovementPosition(tokenDoc, { x: 10 }, controlled, {});
    expect(hasActivePendingTokenMovement()).toBe(true);

    clearPendingTokenMovementPosition('t9');

    expect(hasPendingTokenMovementPosition('t9')).toBe(false);
    expect(globalThis.__pf2eVisionerHasActivePendingTokenMovement).toBe(false);
  });
});

describe('schedulePendingTokenMovementCompletion', () => {
  beforeEach(() => {
    global.game.user = { id: 'gm-user', isGM: true };
    global.Hooks.callAll.mockClear();
  });

  test('10. no animation: returns true; after settle window (~300ms+) hook fires and entry cleared', () => {
    jest.useFakeTimers();

    const tokenDoc = makeTokenDoc('t10', { object: { _animation: null, x: 999, y: 999 } });
    global.canvas.tokens.get = jest.fn((id) => id === 't10' ? tokenDoc.object : null);

    const controlled = [makeControlledToken('t10')];
    setPendingTokenMovementPosition(tokenDoc, { x: 999, y: 999 }, controlled, {});

    const result = schedulePendingTokenMovementCompletion(tokenDoc);
    expect(result).toBe(true);

    jest.advanceTimersByTime(50);
    jest.advanceTimersByTime(50);
    jest.advanceTimersByTime(50);
    jest.advanceTimersByTime(50);
    jest.advanceTimersByTime(50);
    jest.advanceTimersByTime(50);
    jest.advanceTimersByTime(50);

    expect(global.Hooks.callAll).toHaveBeenCalledWith(
      'pf2e-visioner.pendingTokenMovementComplete',
      expect.objectContaining({ tokenId: 't10' }),
    );
    expect(hasPendingTokenMovementPosition('t10')).toBe(false);

    jest.useRealTimers();
  });
});
