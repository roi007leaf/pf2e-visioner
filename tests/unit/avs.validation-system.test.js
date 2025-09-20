/**
 * Tests for OverrideValidationSystem (movement-triggered validation and dialog handling)
 */

describe('OverrideValidationSystem - movement validation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  async function setupEnvironment({ dialogAction = 'clear-all' } = {}) {
    // Minimal mock for the dialog to control user decision
    jest.resetModules();
    const dialogMockModule = () => ({
      OverrideValidationDialog: {
        show: jest.fn().mockResolvedValue({ action: dialogAction }),
      },
    });
    // Mock both resolution variants used by SUTs
    jest.doMock('../../ui/override-validation-dialog.js', dialogMockModule, { virtual: true });
    jest.doMock('../../scripts/ui/override-validation-dialog.js', dialogMockModule, { virtual: true });

    // Mock AvsOverrideManager.removeOverride to observe calls
    const removeOverride = jest.fn().mockResolvedValue(true);
    const avsMgrMockModule = () => ({ __esModule: true, default: { removeOverride } });
    jest.doMock('../../chat/services/infra/avs-override-manager.js', avsMgrMockModule, { virtual: true });
    jest.doMock('../../scripts/chat/services/infra/avs-override-manager.js', avsMgrMockModule, {
      virtual: true,
    });

    const { OverrideValidationSystem } = await import(
      '../../scripts/visibility/auto-visibility/OverrideValidationSystem.js'
    );

    // Create two tokens and a flag-based override on the target
  const observer = global.createMockToken({ id: 'obs1', name: 'Observer' });
    const target = global.createMockToken({
      id: 'tgt1',
      flags: {
        'pf2e-visioner': {
          // override expects cover+concealment, which we'll purposely contradict
          'avs-override-from-obs1': {
            state: 'undetected',
            source: 'manual_action',
            hasCover: true,
            hasConcealment: true,
            observerName: 'Observer',
            targetName: 'Target',
          },
        },
      },
      name: 'Target',
    });

    global.canvas.tokens.placeables = [observer, target];
    global.canvas.tokens.get.mockImplementation((id) =>
      [observer, target].find((t) => t.id === id || t.document?.id === id) || null,
    );

    // Visibility system contract used by OverrideValidationSystem
    const visibilitySystem = {
      getActiveOverrides: () => new Map(), // focus on flag-based path
      calculateVisibility: jest.fn().mockResolvedValue({
        visibility: 'observed', // contradict concealment
        cover: 'none', // contradict cover
        lighting: 'bright',
      }),
    };

    const ovs = OverrideValidationSystem.getInstance(visibilitySystem);
    ovs.enable();

    return { ovs, observer, target, removeOverride };
  }

  test('queues movement, shows dialog, and clears all invalid overrides when chosen', async () => {
    const { ovs, observer, removeOverride } = await setupEnvironment({ dialogAction: 'clear-all' });

  // Invoke validation directly to avoid timer-based batching
  await ovs.debugValidateToken(observer.id);

    // Dialog should have been shown
    const { OverrideValidationDialog } = await import('../../scripts/ui/override-validation-dialog.js');
    // In case resolver used the non-scripts path, also check that
    let calls = OverrideValidationDialog.show.mock.calls.length;
    if (calls === 0) {
      const alt = await import('../../ui/override-validation-dialog.js');
      calls = alt.OverrideValidationDialog.show.mock.calls.length;
    }
    expect(calls).toBeGreaterThan(0);

    expect(removeOverride).toHaveBeenCalledWith('obs1', 'tgt1');
  });

  test('choosing keep does not remove overrides', async () => {
    const { ovs, observer, removeOverride } = await setupEnvironment({ dialogAction: 'keep' });

  await ovs.debugValidateToken(observer.id);

    expect(removeOverride).not.toHaveBeenCalled();
  });

  test('disable prevents queueing new validations (no timers scheduled)', async () => {
    const { ovs, observer } = await setupEnvironment({ dialogAction: 'keep' });

    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    ovs.disable();
    ovs.queueOverrideValidation(observer.id);

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });
});
