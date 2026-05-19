/**
 * @jest-environment jsdom
 */

jest.mock('../../../scripts/chat/services/infra/notifications.js', () => ({
  notify: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../scripts/chat/services/index.js', () => ({
  applyNowSeek: jest.fn(async () => 2),
  revertNowSeek: jest.fn(async () => undefined),
}));

jest.mock('../../../scripts/chat/services/infra/AvsOverrideManager.js', () => ({
  __esModule: true,
  default: {
    getOverride: jest.fn(async () => false),
    removeOverride: jest.fn(async () => undefined),
  },
}));

jest.mock('../../../scripts/services/visual-effects.js', () => ({
  updateTokenVisuals: jest.fn(async () => undefined),
  updateWallVisuals: jest.fn(async () => undefined),
}));

import { applyNowSeek, revertNowSeek } from '../../../scripts/chat/services/index.js';
import { notify } from '../../../scripts/chat/services/infra/notifications.js';
import {
  applyAllSeekChanges,
  applySeekChange,
  revertAllSeekChanges,
} from '../../../scripts/chat/dialogs/Seek/seek-dialog-actions.js';

describe('seek dialog actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildApp(overrides = {}) {
    return {
      actionData: { actor: { id: 'observer' }, messageId: 'msg1' },
      actorToken: { id: 'observer' },
      ignoreAllies: true,
      ignoreWalls: false,
      encounterOnly: false,
      bulkActionState: 'initial',
      rowTimers: new Map(),
      outcomes: [],
      getOutcomeTokenId: (outcome) => outcome?.target?.id ?? null,
      getFilteredOutcomes: jest.fn(async () => []),
      updateRowButtonsToApplied: jest.fn(),
      updateRowButtonsToReverted: jest.fn(),
      updateBulkActionButtons: jest.fn(),
      updateChangesCount: jest.fn(),
      ...overrides,
    };
  }

  test('apply all sends token and wall overrides through seek service', async () => {
    const app = buildApp({
      getFilteredOutcomes: jest.fn(async () => [
        {
          target: { id: 't1', name: 'Target 1' },
          overrideState: 'hidden',
          hasActionableChange: true,
        },
        {
          _isWall: true,
          wallId: 'w1',
          overrideState: 'hidden',
          hasActionableChange: true,
        },
      ]),
    });

    await applyAllSeekChanges(app);

    expect(applyNowSeek).toHaveBeenCalledWith(
      expect.objectContaining({
        ignoreAllies: true,
        overrides: {
          t1: 'hidden',
          __wall__: { w1: 'hidden' },
        },
      }),
      expect.any(Object),
    );
    expect(app.updateRowButtonsToApplied).toHaveBeenCalledTimes(1);
    expect(app.bulkActionState).toBe('applied');
  });

  test('apply all warns when no visible actionable outcomes remain', async () => {
    await applyAllSeekChanges(buildApp());

    expect(applyNowSeek).not.toHaveBeenCalled();
    expect(notify.info).toHaveBeenCalledWith('No changes to apply');
  });

  test('revert all delegates to seek service and updates buttons', async () => {
    const app = buildApp({
      getFilteredOutcomes: jest.fn(async () => [
        { target: { id: 't1' }, changed: true, hasActionableChange: true },
      ]),
    });

    await revertAllSeekChanges(app);

    expect(revertNowSeek).toHaveBeenCalledWith(
      expect.objectContaining({ ignoreAllies: true }),
      expect.any(Object),
    );
    expect(app.updateRowButtonsToReverted).toHaveBeenCalledWith([
      { target: { id: 't1' }, changed: true, hasActionableChange: true },
    ]);
    expect(app.bulkActionState).toBe('reverted');
  });

  test('single row apply strips template limits after dialog filtering', async () => {
    const app = buildApp({
      actionData: {
        actor: { id: 'observer' },
        seekTemplateCenter: { x: 10, y: 10 },
        seekTemplateRadiusFeet: 30,
      },
      outcomes: [
        {
          target: { id: 't1', name: 'Target 1' },
          overrideState: 'hidden',
          hasActionableChange: true,
        },
      ],
    });

    await applySeekChange(app, { dataset: { tokenId: 't1' } });

    expect(applyNowSeek).toHaveBeenCalledWith(
      expect.not.objectContaining({
        seekTemplateCenter: expect.anything(),
        seekTemplateRadiusFeet: expect.anything(),
      }),
      expect.any(Object),
    );
    expect(app.updateRowButtonsToApplied).toHaveBeenCalledWith([{ target: { id: 't1' } }]);
  });
});
