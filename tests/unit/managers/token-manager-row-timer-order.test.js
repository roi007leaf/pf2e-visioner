import '../../setup.js';

jest.mock('../../../scripts/ui/TimerDurationDialog.js', () => ({
  TimerDurationDialog: {
    show: jest.fn(async (opts) => {
      opts?.onApply?.({ type: 'realtime', minutes: 1 });
    }),
  },
}));

import { VisionerTokenManager } from '../../../scripts/managers/token-manager/TokenManager.js';

describe('VisionerTokenManager row timer ordering', () => {
  test('setting row timer does not rerender and does not reset state selection', async () => {
    const observer = createMockToken({
      id: 'observer-1',
      isOwner: true,
      actor: createMockActor({ type: 'character', hasPlayerOwner: true }),
    });

    const manager = new VisionerTokenManager(observer);
    manager.render = jest.fn();
    manager.rowTimers = new Map();
    manager.rendered = true;
    manager.element = document.createElement('div');

    const iconSelection = document.createElement('div');
    iconSelection.className = 'icon-selection';
    iconSelection.dataset.target = 't1';

    const stateBtn = document.createElement('button');
    stateBtn.className = 'state-icon selected';
    stateBtn.dataset.state = 'observed';
    stateBtn.dataset.target = 't1';
    iconSelection.appendChild(stateBtn);

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'hidden';
    hiddenInput.name = 'visibility.t1';
    hiddenInput.value = 'observed';
    iconSelection.appendChild(hiddenInput);

    const timerBtn = document.createElement('button');
    timerBtn.type = 'button';
    timerBtn.className = 'row-timer-toggle';
    timerBtn.dataset.action = 'toggleRowTimer';
    timerBtn.dataset.targetId = 't1';
    iconSelection.appendChild(timerBtn);

    manager.element.appendChild(iconSelection);

    await VisionerTokenManager.toggleRowTimer.call(manager, {}, timerBtn);

    expect(manager.render).not.toHaveBeenCalled();
    expect(stateBtn.classList.contains('selected')).toBe(true);
    expect(hiddenInput.value).toBe('observed');
    expect(timerBtn.classList.contains('active')).toBe(true);
    expect(timerBtn.querySelector('.row-timer-label')).not.toBeNull();
  });
});
