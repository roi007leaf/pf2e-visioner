import '../../setup.js';

import { TimerDurationDialog } from '../../../scripts/ui/TimerDurationDialog.js';

describe('TimerDurationDialog.prompt', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('resolves timer config on apply', async () => {
    jest.spyOn(TimerDurationDialog, 'show').mockImplementation(async (opts) => {
      opts?.onApply?.({ type: 'realtime', minutes: 1 });
      return null;
    });

    await expect(TimerDurationDialog.prompt()).resolves.toEqual({ type: 'realtime', minutes: 1 });
  });

  test('resolves null on cancel', async () => {
    jest.spyOn(TimerDurationDialog, 'show').mockImplementation(async (opts) => {
      opts?.onCancel?.();
      return null;
    });

    await expect(TimerDurationDialog.prompt()).resolves.toBeNull();
  });
});
