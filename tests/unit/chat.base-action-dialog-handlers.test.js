/**
 * @jest-environment jsdom
 */

import '../setup.js';

describe('BaseActionDialog generic handlers', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('onApplyChange warns when no change', async () => {
    const { BaseActionDialog } = await import('../../scripts/chat/dialogs/base-action-dialog.js');

    const app = {
      outcomes: [
        {
          token: { id: 't1', name: 'Goblin' },
          oldVisibility: 'hidden',
          newVisibility: 'hidden',
          hasActionableChange: false,
        },
      ],
      updateChangesCount: jest.fn(),
    };

    const target = { dataset: { tokenId: 't1' } };
    await BaseActionDialog.onApplyChange({}, target, {
      app,
      applyFunction: jest.fn(),
      actionType: 'Sneak',
    });

    expect(ui.notifications.warn).toHaveBeenCalledWith(
      expect.stringContaining('No changes to apply'),
    );
  });

  test('onApplyChange applies token override via applyFunction', async () => {
    const { BaseActionDialog } = await import('../../scripts/chat/dialogs/base-action-dialog.js');

    const applyFunction = jest.fn().mockResolvedValue(true);

    const app = {
      outcomes: [
        {
          token: { id: 't1', name: 'Goblin' },
          oldVisibility: 'observed',
          newVisibility: 'hidden',
          hasActionableChange: true,
        },
      ],
      updateRowButtonsToApplied: jest.fn(),
      updateChangesCount: jest.fn(),
    };

    const target = { dataset: { tokenId: 't1' } };
    await BaseActionDialog.onApplyChange({}, target, {
      app,
      applyFunction,
      actionType: 'Sneak',
    });

    expect(applyFunction).toHaveBeenCalledWith(
      expect.objectContaining({ overrides: { t1: 'hidden' } }),
      target,
    );
    expect(app.updateRowButtonsToApplied).toHaveBeenCalled();
    expect(ui.notifications.info).toHaveBeenCalledWith(
      expect.stringContaining('Applied sneak result'),
    );
  });

  test('onRevertChange reverts token and updates UI', async () => {
    const { BaseActionDialog } = await import('../../scripts/chat/dialogs/base-action-dialog.js');

    const app = {
      outcomes: [
        {
          token: { id: 't1', name: 'Goblin' },
          oldVisibility: 'hidden',
          currentVisibility: 'observed',
          hasActionableChange: true,
        },
      ],
      updateRowButtonsToReverted: jest.fn(),
      updateChangesCount: jest.fn(),
      _updateOutcomeDisplayForToken: jest.fn(),
    };

    const target = { dataset: { tokenId: 't1' } };
    await BaseActionDialog.onRevertChange({}, target, {
      app,
      actionType: 'Sneak',
    });

    expect(app.updateRowButtonsToReverted).toHaveBeenCalled();
    expect(ui.notifications.info).toHaveBeenCalledWith(
      expect.stringContaining('Reverted changes'),
    );
  });
});
