/**
 * @jest-environment jsdom
 */

import '../../setup.js';

describe('BaseActionDialog generic handlers', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('onApplyChange warns when no change', async () => {
    const { BaseActionDialog } = await import(
      '../../../scripts/chat/dialogs/base-action-dialog.js'
    );

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
    const { BaseActionDialog } = await import(
      '../../../scripts/chat/dialogs/base-action-dialog.js'
    );

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
      expect.objectContaining({ overrides: { t1: { state: 'hidden', timedOverride: null } } }),
      target,
    );
    expect(app.updateRowButtonsToApplied).toHaveBeenCalled();
  });

  test('onRevertChange reverts token and updates UI', async () => {
    const { BaseActionDialog } = await import(
      '../../../scripts/chat/dialogs/base-action-dialog.js'
    );

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
  });

  test('dropdown document click handler is bound once across rerenders', async () => {
    const { BaseActionDialog } = await import(
      '../../../scripts/chat/dialogs/base-action-dialog.js'
    );
    const addEventListenerSpy = jest.spyOn(document, 'addEventListener');
    const app = Object.create(BaseActionDialog.prototype);
    app.element = document.createElement('section');
    app.element.innerHTML = `
      <div class="row-action-dropdown">
        <button class="dropdown-toggle"></button>
        <div class="dropdown-menu"></div>
      </div>
    `;

    app._attachDropdownHandlers();
    app._attachDropdownHandlers();

    const documentClickBindings = addEventListenerSpy.mock.calls.filter(
      ([eventName]) => eventName === 'click',
    );
    expect(documentClickBindings).toHaveLength(1);
  });

  test('dropdown document click handler can be detached on dialog close', async () => {
    const { BaseActionDialog } = await import(
      '../../../scripts/chat/dialogs/base-action-dialog.js'
    );
    const addEventListenerSpy = jest.spyOn(document, 'addEventListener');
    const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');
    const app = Object.create(BaseActionDialog.prototype);
    app.element = document.createElement('section');
    app.element.innerHTML = `
      <div class="row-action-dropdown">
        <button class="dropdown-toggle"></button>
        <div class="dropdown-menu"></div>
      </div>
    `;

    app._attachDropdownHandlers();
    const handler = addEventListenerSpy.mock.calls.find(([eventName]) => eventName === 'click')?.[1];

    app._detachDropdownDocumentHandler();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('click', handler);
    expect(app._dropdownDocumentClickHandler).toBeNull();
  });

  test('updateChangesCount updates dialog counter synchronously', async () => {
    const { BaseActionDialog } = await import(
      '../../../scripts/chat/dialogs/base-action-dialog.js'
    );
    const app = Object.create(BaseActionDialog.prototype);
    app.getChangesCounterClass = () => 'changes-count';
    app.element = document.createElement('section');
    app.element.innerHTML = `
      <span class="changes-count"></span>
      <table>
        <tbody>
          <tr data-token-id="t1">
            <td>
              <button class="row-action-btn apply-change"></button>
              <button class="row-action-btn revert-change" disabled></button>
            </td>
          </tr>
        </tbody>
      </table>
    `;

    const count = app.updateChangesCount();

    expect(count).toBe(1);
    expect(app.element.querySelector('.changes-count').textContent).toBe('1');
  });
});
