import '../../setup.js';

describe('visioner global exposure', () => {
  beforeEach(() => {
    global.window = global.window || global;
    global.window.pf2eVisioner = {
      _avsGmVisionWarning: { registered: true, dismissed: false },
    };
  });

  test('restores AVS and rule-element globals without clobbering existing state', async () => {
    const { exposeVisionerGlobals } = await import('../../../scripts/services/visioner-globals.js');
    const autoVisibilitySystem = { recalculateForTokens: jest.fn() };
    const AuraVisibility = class AuraVisibility {};

    exposeVisionerGlobals({ autoVisibilitySystem, AuraVisibility });

    expect(window.pf2eVisioner._avsGmVisionWarning).toEqual({
      registered: true,
      dismissed: false,
    });
    expect(window.pf2eVisioner.services.autoVisibilitySystem).toBe(autoVisibilitySystem);
    expect(window.pf2eVisioner.ruleElements.AuraVisibility).toBe(AuraVisibility);
  });

  test('can lazily resolve AVS when the startup reference is missing', async () => {
    const { exposeVisionerGlobalsAsync } = await import('../../../scripts/services/visioner-globals.js');
    const autoVisibilitySystem = { recalculateForTokens: jest.fn() };

    await exposeVisionerGlobalsAsync({
      loadAutoVisibilitySystem: async () => autoVisibilitySystem,
    });

    expect(window.pf2eVisioner.services.autoVisibilitySystem).toBe(autoVisibilitySystem);
  });
});
