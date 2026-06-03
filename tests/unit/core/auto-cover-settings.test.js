import '../../setup.js';

describe('Auto-cover settings', () => {
  beforeEach(() => {
    jest.resetModules();
    game.settings.register.mockClear();
    game.settings.set.mockClear();
  });

  test('disabling global auto-cover disables hidden dependent boolean settings', async () => {
    const { registerSettings } = await import('../../../scripts/settings.js');
    registerSettings();
    const autoCoverRegistration = game.settings.register.mock.calls.find(
      ([moduleId, key]) => moduleId === 'pf2e-visioner' && key === 'autoCover',
    );

    expect(autoCoverRegistration).toBeDefined();
    await autoCoverRegistration[2].onChange(false);

    const disabledKeys = game.settings.set.mock.calls
      .filter(([moduleId]) => moduleId === 'pf2e-visioner')
      .map(([, key, value]) => [key, value]);
    expect(disabledKeys).toEqual(
      expect.arrayContaining([
        ['computeCoverAtCombatStart', false],
        ['autoCoverVisualizationOnlyInEncounter', false],
        ['autoCoverVisualizationRespectFogForGM', false],
        ['autoCoverIgnoreUndetected', false],
        ['autoCoverIgnoreDead', false],
        ['autoCoverAllowProneBlockers', false],
        ['autoCoverIgnoreAllies', false],
        ['autoCoverIgnoreSmallerTokens', false],
        ['autoCoverIgnoreSameSizeTokens', false],
        ['autoCoverIgnoreLargerTokens', false],
        ['wallCoverAllowGreater', false],
      ]),
    );
    expect(disabledKeys).not.toEqual(
      expect.arrayContaining([
        ['autoCoverTokenIntersectionMode', false],
        ['wallCoverStandardThreshold', false],
        ['wallCoverGreaterThreshold', false],
      ]),
    );
  });
});
