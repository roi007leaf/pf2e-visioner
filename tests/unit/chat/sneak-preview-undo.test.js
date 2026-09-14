import '../../setup.js';
import { applyBaseActionChange, revertBaseActionChange, applyAllBaseActionChanges, revertAllBaseActionChanges } from '../../../scripts/chat/dialogs/BaseAction/base-action-apply-revert.js';
import Overrides from '../../../scripts/chat/services/infra/AvsOverrideManager.js';
import { preserveSneakOverrides } from '../../../scripts/chat/dialogs/Sneak/sneak-dialog-filtering.js';
import { SneakPreviewDialog } from '../../../scripts/chat/dialogs/SneakPreviewDialog.js';

jest.mock('../../../scripts/chat/services/infra/AvsOverrideManager.js', () => ({
  __esModule: true, default: { getOverrideData: jest.fn(), getOverride: jest.fn(), removeOverride: jest.fn(), onAVSOverride: jest.fn() },
}));
jest.mock('../../../scripts/services/visual-effects.js', () => ({ updateTokenVisuals: jest.fn() }));

describe('Sneak preview apply and undo', () => {
  test.each(['row', 'all'])('%s undo restores a prior Hidden override and remains available after apply', async mode => {
    const observer = { id: 'observer', document: { id: 'observer' } };
    const sneaker = { id: 'sneaker', document: { id: 'sneaker' } };
    let stored = { state: 'hidden', source: 'hide_action', hasCover: true, expectedCover: 'standard' };
    const original = { ...stored };
    Overrides.getOverrideData.mockImplementation(async () => stored);
    Overrides.getOverride.mockImplementation(async () => stored?.state);
    Overrides.removeOverride.mockImplementation(async () => { stored = null; return true; });
    Overrides.onAVSOverride.mockImplementation(async data => { stored = { ...data }; });
    const get = canvas.tokens.get;
    canvas.tokens.get = id => ({ observer, sneaker })[id];
    const outcome = { token: observer, currentVisibility: 'hidden', oldVisibility: 'hidden', newVisibility: 'undetected', hasActionableChange: true };
    const app = { actionData: { actor: sneaker }, outcomes: [outcome],
      getApplyDirection: SneakPreviewDialog.prototype.getApplyDirection, updateChangesCount: jest.fn(), updateRowButtonsToApplied: jest.fn(), updateRowButtonsToReverted: jest.fn() };
    // Dialog rerenders derive rows from the original roll outcomes; bulk actions
    // receive projection copies rather than the objects held by the dialog.
    const originalOutcomes = [{ ...outcome }];
    app._updateOutcomeDisplayForToken = () => {
      app.outcomes = preserveSneakOverrides(originalOutcomes, app.outcomes).map(row => ({ ...row, oldVisibility: stored?.state }));
    };
    app.getFilteredOutcomes = async () => app.outcomes.map(row => ({ ...row }));
    const context = { app, actionType: 'Sneak', applyFunction: async () => { stored = { state: 'undetected', source: 'sneak_action' }; return 1; } };
    const button = { dataset: { tokenId: 'observer' } };
    try {
      await (mode === 'row' ? applyBaseActionChange : applyAllBaseActionChanges)({}, button, context);
      expect(Overrides.getOverrideData).toHaveBeenLastCalledWith('observer', 'sneaker');
      expect(app.outcomes[0].hasRevertableChange).toBe(true);
      await (mode === 'row' ? revertBaseActionChange : revertAllBaseActionChanges)({}, button, context);
      expect(stored).toMatchObject(original);
      expect(app.outcomes[0].hasActionableChange).toBe(true);
      expect(app.outcomes[0].hasRevertableChange).toBe(false);
    } finally { canvas.tokens.get = get; }
  });
});
