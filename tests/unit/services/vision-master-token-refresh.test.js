import '../../setup.js';

import {
  clearScheduledCanvasPerceptionUpdate,
  flushScheduledCanvasPerceptionUpdate,
} from '../../../scripts/helpers/perception-refresh.js';
import {
  createVisionMasterTokenRefresh,
  hasVisionMasterTokenIdChange,
} from '../../../scripts/services/vision-master-token-refresh.js';

const MODULE_ID = 'pf2e-visioner';

function makeToken(id, overrides = {}) {
  return {
    id,
    document: { id },
    controlled: false,
    initializeVisionSource: jest.fn(),
    ...overrides,
  };
}

function makeTokenDoc(id, { object = makeToken(id), currentMasterId = null } = {}) {
  return {
    id,
    object,
    getFlag: jest.fn((moduleId, key) => {
      if (moduleId === MODULE_ID && key === 'visionMasterTokenId') return currentMasterId;
      return undefined;
    }),
  };
}

describe('vision master token refresh service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    clearScheduledCanvasPerceptionUpdate();
  });

  test('detects explicit vision master flag changes, including null clears', () => {
    expect(
      hasVisionMasterTokenIdChange({
        flags: { [MODULE_ID]: { visionMasterTokenId: 'master-2' } },
      }),
    ).toBe(true);

    expect(
      hasVisionMasterTokenIdChange({
        flags: { [MODULE_ID]: { visionMasterTokenId: null } },
      }),
    ).toBe(true);

    expect(hasVisionMasterTokenIdChange({ flags: { [MODULE_ID]: {} } })).toBe(false);
    expect(hasVisionMasterTokenIdChange({ x: 100 })).toBe(false);
  });

  test('captures the previous master id during pre-update', () => {
    const oldMasterIds = new Map();
    const controller = createVisionMasterTokenRefresh({ oldMasterIds });
    const tokenDoc = makeTokenDoc('subject', { currentMasterId: 'old-master' });

    const captured = controller.capturePreUpdate(tokenDoc, {
      flags: { [MODULE_ID]: { visionMasterTokenId: 'new-master' } },
    });

    expect(captured).toBe(true);
    expect(oldMasterIds.get('subject')).toBe('old-master');
    expect(tokenDoc.getFlag).toHaveBeenCalledWith(MODULE_ID, 'visionMasterTokenId');
  });

  test('refreshes subject, old master, new master, and perception after update', async () => {
    const oldMasterIds = new Map([['subject', 'old-master']]);
    const subject = makeToken('subject');
    const oldMaster = makeToken('old-master');
    const newMaster = makeToken('new-master');
    const canvasRef = {
      tokens: { get: jest.fn((id) => ({ 'old-master': oldMaster, 'new-master': newMaster })[id]) },
      perception: { update: jest.fn() },
    };
    const controller = createVisionMasterTokenRefresh({
      oldMasterIds,
      getCanvas: () => canvasRef,
    });

    const result = await controller.refreshAfterUpdate(makeTokenDoc('subject', { object: subject }), {
      flags: { [MODULE_ID]: { visionMasterTokenId: 'new-master' } },
    });
    flushScheduledCanvasPerceptionUpdate();

    expect(result).toEqual({ refreshed: true, oldMasterId: 'old-master', newMasterId: 'new-master' });
    expect(oldMasterIds.has('subject')).toBe(false);
    expect(subject.initializeVisionSource).toHaveBeenCalledTimes(1);
    expect(oldMaster.initializeVisionSource).toHaveBeenCalledTimes(1);
    expect(newMaster.initializeVisionSource).toHaveBeenCalledTimes(1);
    expect(canvasRef.perception.update).toHaveBeenCalledWith({
      initializeVision: true,
      refreshLighting: true,
    });
  });

  test('clears captured state when update has no token object', async () => {
    const oldMasterIds = new Map([['subject', 'old-master']]);
    const canvasRef = {
      tokens: { get: jest.fn() },
      perception: { update: jest.fn() },
    };
    const controller = createVisionMasterTokenRefresh({
      oldMasterIds,
      getCanvas: () => canvasRef,
    });

    const result = await controller.refreshAfterUpdate(makeTokenDoc('subject', { object: null }), {
      flags: { [MODULE_ID]: { visionMasterTokenId: 'new-master' } },
    });

    expect(result).toEqual({ refreshed: false, reason: 'no-token' });
    expect(oldMasterIds.has('subject')).toBe(false);
    expect(canvasRef.tokens.get).not.toHaveBeenCalled();
    expect(canvasRef.perception.update).not.toHaveBeenCalled();
  });

  test('updates shared vision indicator for controlled GM tokens without breaking refresh on failure', async () => {
    const subject = makeToken('subject', { controlled: true });
    const updateSharedVisionIndicator = jest.fn().mockRejectedValue(new Error('indicator failed'));
    const warn = jest.fn();
    const canvasRef = {
      tokens: { get: jest.fn() },
      perception: { update: jest.fn() },
    };
    const controller = createVisionMasterTokenRefresh({
      getCanvas: () => canvasRef,
      getGame: () => ({ user: { isGM: true } }),
      updateSharedVisionIndicator,
      warn,
    });

    await controller.refreshAfterUpdate(makeTokenDoc('subject', { object: subject }), {
      flags: { [MODULE_ID]: { visionMasterTokenId: null } },
    });
    flushScheduledCanvasPerceptionUpdate();

    expect(subject.initializeVisionSource).toHaveBeenCalledTimes(1);
    expect(canvasRef.perception.update).toHaveBeenCalledTimes(1);
    expect(updateSharedVisionIndicator).toHaveBeenCalledWith(subject);
    expect(warn).toHaveBeenCalledWith(
      'PF2E Visioner | Failed to update shared vision indicator:',
      expect.any(Error),
    );
  });
});
