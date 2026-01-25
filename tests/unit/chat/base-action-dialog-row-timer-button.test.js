import '../../setup.js';

describe('BaseActionDialog row timer button', () => {
  test('updateActionButtonsForToken keeps timer button for tokens', async () => {
    const { BaseActionDialog } = await import(
      '../../../scripts/chat/dialogs/base-action-dialog.js'
    );

    const app = new BaseActionDialog();
    app.element = document.createElement('div');

    const table = document.createElement('table');
    const tbody = document.createElement('tbody');
    const row = document.createElement('tr');
    row.dataset.tokenId = 't1';
    const actions = document.createElement('td');
    actions.className = 'actions';
    row.appendChild(actions);
    tbody.appendChild(row);
    table.appendChild(tbody);
    app.element.appendChild(table);

    app.updateActionButtonsForToken('t1', true);
    expect(actions.querySelector('.row-timer-toggle[data-token-id="t1"]')).not.toBeNull();

    app.updateActionButtonsForToken('t1', true);
    expect(actions.querySelector('.row-timer-toggle[data-token-id="t1"]')).not.toBeNull();

    app.updateActionButtonsForToken('t1', false);
    expect(actions.querySelector('.row-timer-toggle')).toBeNull();
  });
});
