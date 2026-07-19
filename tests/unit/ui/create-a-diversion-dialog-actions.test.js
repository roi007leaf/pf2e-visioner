jest.mock('../../../scripts/chat/services/infra/notifications.js', () => ({
  notify: {
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../scripts/chat/services/index.js', () => ({
  applyNowDiversion: jest.fn(async () => 1),
  revertNowDiversion: jest.fn(async () => undefined),
}));

jest.mock('../../../scripts/chat/services/infra/shared-utils.js', () => ({
  applyVisibilityChanges: jest.fn(async () => undefined),
}));

import { applyNowDiversion, revertNowDiversion } from '../../../scripts/chat/services/index.js';
import { applyVisibilityChanges } from '../../../scripts/chat/services/infra/shared-utils.js';
import {
  applyAllDiversionChanges,
  applyDiversionChange,
  revertAllDiversionChanges,
  revertDiversionChange,
} from '../../../scripts/chat/dialogs/CreateADiversion/create-a-diversion-dialog-actions.js';

describe('create a diversion dialog actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildObserver(id) {
    return { id, name: id };
  }

  function buildApp(overrides = {}) {
    return {
      actionData: { actor: { id: 'diverter' } },
      ignoreAllies: true,
      bulkActionState: 'initial',
      rowTimers: new Map(),
      outcomes: [
        {
          observer: buildObserver('observer-1'),
          currentVisibility: 'observed',
          newVisibility: 'hidden',
          overrideState: 'hidden',
          hasActionableChange: true,
        },
      ],
      processedOutcomes: null,
      updateRowButtonsToApplied: jest.fn(),
      updateRowButtonsToReverted: jest.fn(),
      updateBulkActionButtons: jest.fn(),
      updateChangesCount: jest.fn(),
      ...overrides,
    };
  }

  test('per-row apply sends single observer override', async () => {
    const app = buildApp();

    await applyDiversionChange(app, { dataset: { tokenId: 'observer-1' } });

    expect(applyNowDiversion).toHaveBeenCalledWith(
      expect.objectContaining({
        overrides: { 'observer-1': 'hidden' },
      }),
      expect.any(Object),
    );
    expect(app.updateRowButtonsToApplied).toHaveBeenCalledWith([
      { target: { id: 'observer-1' }, hasActionableChange: true },
    ]);
  });

  test('per-row revert restores original visibility through shared utility', async () => {
    const app = buildApp();

    await revertDiversionChange(app, { dataset: { tokenId: 'observer-1' } });

    expect(applyVisibilityChanges).toHaveBeenCalledWith(
      app.outcomes[0].observer,
      [{ target: app.actionData.actor, newVisibility: 'observed' }],
      { direction: 'observer_to_target' },
    );
    expect(app.bulkActionState).toBe('initial');
    expect(app.updateRowButtonsToReverted).toHaveBeenCalled();
  });

  test('per-row revert restores chosen Distracting Performance beneficiary', async () => {
    const beneficiary = { id: 'ally' };
    const app = buildApp({
      actionData: { actor: { id: 'diverter' }, diversionTarget: beneficiary },
    });

    await revertDiversionChange(app, { dataset: { tokenId: 'observer-1' } });

    expect(applyVisibilityChanges).toHaveBeenCalledWith(
      app.outcomes[0].observer,
      [{ target: beneficiary, newVisibility: 'observed' }],
      { direction: 'observer_to_target' },
    );
  });

  test('apply all uses processed visible outcomes', async () => {
    const app = buildApp({
      processedOutcomes: [
        {
          observer: buildObserver('observer-2'),
          newVisibility: 'undetected',
          hasActionableChange: true,
        },
      ],
    });

    await applyAllDiversionChanges(app);

    expect(applyNowDiversion).toHaveBeenCalledWith(
      expect.objectContaining({
        ignoreAllies: true,
        overrides: { 'observer-2': 'undetected' },
      }),
      expect.any(Object),
    );
    expect(app.bulkActionState).toBe('applied');
  });

  test('revert all delegates to diversion service for visible changes', async () => {
    const app = buildApp({
      processedOutcomes: [{ observer: buildObserver('observer-2'), hasActionableChange: true }],
    });

    await revertAllDiversionChanges(app);

    expect(revertNowDiversion).toHaveBeenCalledWith(
      expect.objectContaining({ ignoreAllies: true }),
      expect.any(Object),
    );
    expect(app.bulkActionState).toBe('reverted');
  });
});
