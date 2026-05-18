/**
 * @jest-environment jsdom
 */

import '../../setup.js';

describe('SneakPreviewDialog DOM updates', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  test('updates outcome rows inside the dialog instead of the first matching document row', async () => {
    const { SneakPreviewDialog } = await import(
      '../../../scripts/chat/dialogs/SneakPreviewDialog.js'
    );
    const outside = document.createElement('section');
    outside.innerHTML = `
      <table><tbody>
        <tr data-token-id="target-1">
          <td class="outcome"><span class="outcome-text">outside</span></td>
          <td class="actions"></td>
        </tr>
      </tbody></table>
    `;
    const dialogRoot = document.createElement('section');
    dialogRoot.innerHTML = `
      <table><tbody>
        <tr data-token-id="target-1">
          <td class="outcome"><span class="outcome-text">inside</span></td>
          <td class="actions"></td>
        </tr>
      </tbody></table>
    `;
    document.body.append(outside, dialogRoot);

    const dialog = Object.create(SneakPreviewDialog.prototype);
    dialog.element = dialogRoot;
    dialog.getOutcomeLabel = jest.fn(() => 'Success');
    dialog.getOutcomeClass = jest.fn(() => 'success');
    dialog._updateVisibilityStateIndicators = jest.fn();
    dialog.updateActionButtonsForToken = jest.fn();

    await dialog._updateOutcomeDisplayForToken('target-1', {
      outcome: 'success',
      newVisibility: 'hidden',
      oldVisibility: 'observed',
    });

    expect(outside.querySelector('.outcome-text').textContent).toBe('outside');
    expect(dialogRoot.querySelector('.outcome-text').textContent).toBe('Success');
    expect(dialog._updateVisibilityStateIndicators).toHaveBeenCalledWith(
      dialogRoot.querySelector('tr[data-token-id="target-1"]'),
      'hidden',
    );
  });

  test('defer handlers are bound once across repeated render hooks', async () => {
    const { SneakPreviewDialog } = await import(
      '../../../scripts/chat/dialogs/SneakPreviewDialog.js'
    );
    const dialogRoot = document.createElement('section');
    dialogRoot.innerHTML = `
      <table><tbody>
        <tr data-token-id="target-1">
          <td>
            <button data-action="toggleDefer" data-token-id="target-1">
              <i class="fas fa-hourglass-half"></i>
            </button>
          </td>
        </tr>
      </tbody></table>
      <button data-action="bulkDefer"></button>
      <button data-action="bulkUndefer"></button>
    `;
    document.body.append(dialogRoot);

    const dialog = Object.create(SneakPreviewDialog.prototype);
    dialog.element = dialogRoot;
    dialog.outcomes = [{ token: { id: 'target-1' } }];
    dialog._deferredChecks = new Set();
    dialog._bulkDeferAllEligible = jest.fn();
    dialog._bulkUndeferAll = jest.fn();
    dialog._bulkRestoreDefers = jest.fn();

    const deferButton = dialogRoot.querySelector('[data-action="toggleDefer"]');
    const bulkDeferButton = dialogRoot.querySelector('[data-action="bulkDefer"]');
    const bulkUndeferButton = dialogRoot.querySelector('[data-action="bulkUndefer"]');
    const deferSpy = jest.spyOn(deferButton, 'addEventListener');
    const bulkDeferSpy = jest.spyOn(bulkDeferButton, 'addEventListener');
    const bulkUndeferSpy = jest.spyOn(bulkUndeferButton, 'addEventListener');

    dialog.addDeferHandlers();
    dialog.addDeferHandlers();

    expect(deferSpy).toHaveBeenCalledTimes(1);
    expect(bulkDeferSpy).toHaveBeenCalledTimes(1);
    expect(bulkUndeferSpy).toHaveBeenCalledTimes(1);
  });
});
