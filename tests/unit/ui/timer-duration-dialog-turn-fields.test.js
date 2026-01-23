import '../../setup.js';

import { TimerDurationDialog } from '../../../scripts/ui/TimerDurationDialog.js';

describe('TimerDurationDialog turn timing fields', () => {
  test('hides turn timing section for non-round durations', () => {
    global.game.combat = { turns: [] };
    const dialog = new TimerDurationDialog({});
    dialog.element = document.createElement('div');
    const turnSection = document.createElement('div');
    turnSection.className = 'turn-timing-section';
    dialog.element.appendChild(turnSection);

    dialog.selectedDuration = '1min';
    dialog._updateTurnTimingVisibility();
    expect(turnSection.hidden).toBe(true);

    dialog.selectedDuration = 'forever';
    dialog._updateTurnTimingVisibility();
    expect(turnSection.hidden).toBe(true);

    dialog.selectedDuration = 'custom';
    dialog.customUnit = 'minutes';
    dialog._updateTurnTimingVisibility();
    expect(turnSection.hidden).toBe(true);
  });

  test('shows turn timing section for round durations', () => {
    global.game.combat = { turns: [] };
    const dialog = new TimerDurationDialog({});
    dialog.element = document.createElement('div');
    const turnSection = document.createElement('div');
    turnSection.className = 'turn-timing-section';
    dialog.element.appendChild(turnSection);

    dialog.selectedDuration = '1round';
    dialog._updateTurnTimingVisibility();
    expect(turnSection.hidden).toBe(false);

    dialog.selectedDuration = 'custom';
    dialog.customUnit = 'rounds';
    dialog._updateTurnTimingVisibility();
    expect(turnSection.hidden).toBe(false);
  });
});
