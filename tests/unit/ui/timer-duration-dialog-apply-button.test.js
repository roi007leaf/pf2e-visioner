import '../../setup.js';

import { TimerDurationDialog } from '../../../scripts/ui/TimerDurationDialog.js';

describe('TimerDurationDialog apply button', () => {
  test('disables apply button when no duration selected', () => {
    const dialog = new TimerDurationDialog({});
    dialog.element = document.createElement('div');
    const applyBtn = document.createElement('button');
    applyBtn.className = 'apply-btn';
    dialog.element.appendChild(applyBtn);

    dialog.selectedDuration = null;
    dialog._updateApplyButtonState();
    expect(applyBtn.disabled).toBe(true);

    dialog.selectedDuration = '1min';
    dialog._updateApplyButtonState();
    expect(applyBtn.disabled).toBe(false);
  });

  test('onApplyTimer warns and does not apply when no duration selected', async () => {
    const dialog = new TimerDurationDialog({});
    dialog.selectedDuration = null;
    dialog.onApplyCallback = jest.fn();
    dialog.close = jest.fn();

    await TimerDurationDialog._onApplyTimer.call(dialog, {}, {});

    expect(global.ui.notifications.warn).toHaveBeenCalledWith(
      'PF2E_VISIONER.TIMED_OVERRIDE.NO_DURATION_SELECTED',
    );
    expect(dialog.onApplyCallback).not.toHaveBeenCalled();
    expect(dialog.close).not.toHaveBeenCalled();
  });

  test('_buildTimerConfig returns null when no duration selected', () => {
    const dialog = new TimerDurationDialog({});
    dialog.selectedDuration = null;
    expect(dialog._buildTimerConfig()).toBeNull();
  });
});
