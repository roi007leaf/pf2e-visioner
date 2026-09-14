import '../../setup.js';
import { applyNowConsequences, revertNowConsequences } from '../../../scripts/chat/services/index.js';
import { applyConsequencesChange, applyAllConsequencesChanges, revertAllConsequencesChanges } from '../../../scripts/chat/dialogs/Consequences/consequences-dialog-actions.js';

jest.mock('../../../scripts/chat/services/index.js', () => ({
  applyNowConsequences: jest.fn(async () => 1), revertNowConsequences: jest.fn(async () => 1),
}));
jest.mock('../../../scripts/chat/services/infra/AvsOverrideManager.js', () => ({
  __esModule: true, default: { removeOverride: jest.fn(async () => true) },
}));
jest.mock('../../../scripts/services/visual-effects.js', () => ({ updateTokenVisuals: jest.fn() }));
jest.mock('../../../scripts/chat/services/infra/shared-utils.js', () => ({
  filterOutcomesByEncounter: rows => rows, filterOutcomesByAllies: rows => rows,
}));

function app() {
  return {
    actionData: { messageId: 'attack', actor: { id: 'attacker' } },
    outcomes: [{ target: { id: 'observer' }, currentVisibility: 'hidden', newVisibility: 'avs', hasActionableChange: true }],
    updateRowButtonsToApplied: jest.fn(), updateRowButtonsToReverted: jest.fn(),
    updateChangesCount: jest.fn(), updateBulkActionButtons: jest.fn(),
  };
}

describe('consequence AVS preview undo', () => {
  beforeEach(() => jest.clearAllMocks());
  test('row AVS uses the action application that records undo', async () => {
    await applyConsequencesChange(app(), { dataset: { tokenId: 'observer' } });
    expect(applyNowConsequences).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'attack', overrides: { observer: 'avs' },
    }), expect.anything());
  });
  test('bulk AVS records undo before Revert All', async () => {
    const dialog = app();
    await applyAllConsequencesChanges(dialog);
    await revertAllConsequencesChanges(dialog);
    expect(applyNowConsequences).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'attack', overrides: { observer: 'avs' },
    }), expect.anything());
    expect(revertNowConsequences).toHaveBeenCalledWith(dialog.actionData, expect.anything());
  });
});
