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
          <td>
            <span class="state-icon selected" data-state="observed"></span>
            <span class="state-icon" data-state="hidden"></span>
          </td>
          <td class="actions"></td>
        </tr>
      </tbody></table>
    `;
    document.body.append(outside, dialogRoot);

    const dialog = Object.create(SneakPreviewDialog.prototype);
    dialog.element = dialogRoot;
    dialog.getOutcomeLabel = jest.fn(() => 'Success');
    dialog.getOutcomeClass = jest.fn(() => 'success');
    dialog.updateActionButtonsForToken = jest.fn();

    await dialog._updateOutcomeDisplayForToken('target-1', {
      outcome: 'success',
      newVisibility: 'hidden',
      oldVisibility: 'observed',
    });

    expect(outside.querySelector('.outcome-text').textContent).toBe('outside');
    expect(dialogRoot.querySelector('.outcome-text').textContent).toBe('Success');
    expect(dialogRoot.querySelector('[data-state="hidden"]').classList.contains('selected')).toBe(
      true,
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

    const listenerSpy = jest.spyOn(dialogRoot, 'addEventListener');

    dialog.addDeferHandlers();
    dialog.addDeferHandlers();
    dialogRoot.querySelector('[data-action="bulkDefer"]').click();

    const clickBindings = listenerSpy.mock.calls.filter(([eventName]) => eventName === 'click');
    expect(clickBindings).toHaveLength(1);
    expect(dialog._bulkDeferAllEligible).toHaveBeenCalledTimes(1);
  });
});
