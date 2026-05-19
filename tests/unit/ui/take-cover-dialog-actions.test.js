jest.mock('../../../scripts/chat/services/infra/notifications.js', () => ({
  notify: {
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../scripts/chat/services/index.js', () => ({
  applyNowTakeCover: jest.fn(async () => 1),
  revertNowTakeCover: jest.fn(async () => undefined),
}));

import { applyNowTakeCover, revertNowTakeCover } from '../../../scripts/chat/services/index.js';
import {
  applyAllTakeCoverChanges,
  applyTakeCoverChange,
  revertAllTakeCoverChanges,
  revertTakeCoverChange,
} from '../../../scripts/chat/dialogs/TakeCover/take-cover-dialog-actions.js';

describe('take cover dialog actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildOutcome(id) {
    return {
      target: { id, name: id },
      currentCover: 'none',
      newVisibility: 'standard',
      hasActionableChange: true,
    };
  }

  function buildApp(overrides = {}) {
    return {
      actionData: { actor: { id: 'taker' } },
      bulkActionState: 'initial',
      outcomes: [buildOutcome('observer-1')],
      getFilteredOutcomes: jest.fn(async () => [buildOutcome('observer-1')]),
      updateBulkActionButtons: jest.fn(),
      updateRowButtonsToApplied: jest.fn(),
      updateRowButtonsToReverted: jest.fn(),
      updateChangesCount: jest.fn(),
      close: jest.fn(),
      ...overrides,
    };
  }

  test('apply all sends cover overrides and closes dialog', async () => {
    const app = buildApp();

    await applyAllTakeCoverChanges(app);

    expect(applyNowTakeCover).toHaveBeenCalledWith(
      expect.objectContaining({ overrides: { 'observer-1': 'standard' } }),
      expect.any(Object),
    );
    expect(app.bulkActionState).toBe('applied');
    expect(app.close).toHaveBeenCalled();
  });

  test('revert all delegates to take cover service', async () => {
    const app = buildApp();

    await revertAllTakeCoverChanges(app);

    expect(revertNowTakeCover).toHaveBeenCalledWith(app.actionData, expect.any(Object));
    expect(app.bulkActionState).toBe('reverted');
  });

  test('per-row apply sends one cover override', async () => {
    const app = buildApp();

    await applyTakeCoverChange(app, { dataset: { tokenId: 'observer-1' } });

    expect(applyNowTakeCover).toHaveBeenCalledWith(
      expect.objectContaining({ overrides: { 'observer-1': 'standard' } }),
      expect.any(Object),
    );
  });

  test('per-row revert passes target token id', async () => {
    const app = buildApp();

    await revertTakeCoverChange(app, { dataset: { tokenId: 'observer-1' } });

    expect(revertNowTakeCover).toHaveBeenCalledWith(
      expect.objectContaining({ targetTokenId: 'observer-1' }),
      expect.any(Object),
    );
  });
});
