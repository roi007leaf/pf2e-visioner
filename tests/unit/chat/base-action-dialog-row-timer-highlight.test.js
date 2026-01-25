describe('BaseActionDialog row timer highlight', () => {
  test('attachRowTimerHandlers re-applies active state from stored timer config', async () => {
    const { BaseActionDialog } = await import(
      '../../../scripts/chat/dialogs/base-action-dialog.js'
    );

    const app = new BaseActionDialog();
    app.element = document.createElement('div');

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions';

    const timerBtn = document.createElement('button');
    timerBtn.type = 'button';
    timerBtn.className = 'row-timer-toggle';
    timerBtn.dataset.tokenId = 't1';
    timerBtn.innerHTML = '<i class="fas fa-clock"></i>';
    actionsCell.appendChild(timerBtn);

    const row = document.createElement('tr');
    row.dataset.tokenId = 't1';
    row.appendChild(actionsCell);

    const tbody = document.createElement('tbody');
    tbody.appendChild(row);

    const table = document.createElement('table');
    table.appendChild(tbody);
    app.element.appendChild(table);

    app.rowTimers.set('t1', { type: 'rounds', rounds: 1 });

    app._attachRowTimerHandlers();

    expect(timerBtn.classList.contains('active')).toBe(true);
    expect(timerBtn.querySelector('.row-timer-label')?.textContent).toBe('1r');
  });
});
