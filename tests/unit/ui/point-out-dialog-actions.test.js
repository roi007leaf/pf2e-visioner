jest.mock('../../../scripts/chat/services/infra/notifications.js', () => ({
  notify: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../scripts/chat/services/index.js', () => ({
  applyNowPointOut: jest.fn(async () => 1),
  revertNowPointOut: jest.fn(async () => undefined),
}));

import { applyNowPointOut, revertNowPointOut } from '../../../scripts/chat/services/index.js';
import {
  applyAllPointOutChanges,
  applyPointOutChange,
  revertAllPointOutChanges,
  revertPointOutChange,
} from '../../../scripts/chat/dialogs/PointOut/point-out-dialog-actions.js';

describe('point out dialog actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildOutcome(id, overrides = {}) {
    return {
      target: { id, name: id },
      currentVisibility: 'observed',
      newVisibility: 'hidden',
      hasActionableChange: true,
      ...overrides,
    };
  }

  function buildApp(overrides = {}) {
    return {
      actionData: { actor: { id: 'actor' } },
      bulkActionState: 'initial',
      rowTimers: new Map(),
      outcomes: [buildOutcome('ally-1')],
      getFilteredOutcomes: jest.fn(async () => [buildOutcome('ally-1')]),
      updateRowButtonsToApplied: jest.fn(),
      updateRowButtonsToReverted: jest.fn(),
      updateBulkActionButtons: jest.fn(),
      updateChangesCount: jest.fn(),
      ...overrides,
    };
  }

  test('apply all sends overrides for changed filtered allies', async () => {
    const app = buildApp();

    await applyAllPointOutChanges(app);

    expect(applyNowPointOut).toHaveBeenCalledWith(
      expect.objectContaining({ overrides: { 'ally-1': 'hidden' } }),
      expect.any(Object),
    );
    expect(app.bulkActionState).toBe('applied');
  });

  test('revert all delegates to point out service', async () => {
    const app = buildApp();

    await revertAllPointOutChanges(app);

    expect(revertNowPointOut).toHaveBeenCalledWith(app.actionData, expect.any(Object));
    expect(app.bulkActionState).toBe('reverted');
  });

  test('per-row apply sends one override', async () => {
    const app = buildApp();

    await applyPointOutChange(app, { dataset: { tokenId: 'ally-1' } });

    expect(applyNowPointOut).toHaveBeenCalledWith(
      expect.objectContaining({ overrides: { 'ally-1': 'hidden' } }),
      expect.any(Object),
    );
    expect(app.updateRowButtonsToApplied).toHaveBeenCalled();
  });

  test('per-row revert passes target token id to service', async () => {
    const app = buildApp();

    await revertPointOutChange(app, { dataset: { tokenId: 'ally-1' } });

    expect(revertNowPointOut).toHaveBeenCalledWith(
      expect.objectContaining({ targetTokenId: 'ally-1' }),
      expect.any(Object),
    );
    expect(app.updateRowButtonsToReverted).toHaveBeenCalled();
  });
});
