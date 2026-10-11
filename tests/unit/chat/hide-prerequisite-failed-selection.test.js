/**
 * @jest-environment jsdom
 */

import '../../setup.js';

function failedPrereqOutcome() {
  return {
    target: { id: 'observer-1' },
    outcome: 'success',
    oldVisibility: 'observed',
    currentVisibility: 'observed',
    newVisibility: 'avs',
    overrideState: null,
    _calculatedNewVisibility: 'hidden',
    hasPositionData: true,
    positionDisplay: { endPosition: { qualifies: false } },
  };
}

function renderRow() {
  const root = document.createElement('section');
  root.innerHTML = `
    <table><tbody>
      <tr data-token-id="observer-1">
        <td class="override-icons">
          <span class="state-icon" data-state="avs"></span>
          <span class="state-icon" data-state="observed"></span>
          <span class="state-icon" data-state="hidden"></span>
        </td>
      </tr>
    </tbody></table>
  `;
  document.body.append(root);
  return root;
}

describe('Hide failed prerequisite selection', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('dialog selects AVS, not calculated hidden, when end prerequisite fails', async () => {
    const { HidePreviewDialog } = await import('../../../scripts/chat/dialogs/HidePreviewDialog.js');
    const root = renderRow();
    const dialog = Object.create(HidePreviewDialog.prototype);
    Object.defineProperty(dialog, 'element', { value: root });
    dialog.outcomes = [failedPrereqOutcome()];
    dialog.isOldStateAvsControlled = () => true;
    dialog.updateActionButtonsForToken = jest.fn();

    dialog.markInitialSelections();

    expect(root.querySelector('.state-icon.selected')?.dataset.state).toBe('avs');
    expect(dialog.outcomes[0].hasActionableChange).toBe(false);
  });

  test('dialog still selects calculated state when prerequisite met', async () => {
    const { HidePreviewDialog } = await import('../../../scripts/chat/dialogs/HidePreviewDialog.js');
    const root = renderRow();
    const dialog = Object.create(HidePreviewDialog.prototype);
    Object.defineProperty(dialog, 'element', { value: root });
    const outcome = failedPrereqOutcome();
    outcome.positionDisplay.endPosition.qualifies = true;
    dialog.outcomes = [outcome];
    dialog.isOldStateAvsControlled = () => true;
    dialog.updateActionButtonsForToken = jest.fn();

    dialog.markInitialSelections();

    expect(root.querySelector('.state-icon.selected')?.dataset.state).toBe('hidden');
  });

  test('direct apply does not promote calculated hidden when prerequisite fails', async () => {
    const { getDirectHideChangedOutcomes } = await import('../../../scripts/chat/ui/event-binder.js');
    const outcome = {
      ...failedPrereqOutcome(),
      positionDisplay: undefined,
      positionQualification: { endQualifies: false },
      changed: false,
    };
    const handler = { isOldStateAvsControlled: () => true };

    expect(getDirectHideChangedOutcomes(handler, [outcome], {})).toEqual([]);
    expect(outcome.overrideState).toBeNull();
  });
});
