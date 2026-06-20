jest.mock('../../../scripts/chat/services/infra/shared-utils.js', () => ({
  filterOutcomesByAllies: jest.fn((outcomes) => outcomes),
  filterOutcomesByDetection: jest.fn(async (outcomes) =>
    outcomes.filter((outcome) => outcome?.target?.id !== 'out-of-view'),
  ),
  filterOutcomesByDefeated: jest.fn((outcomes, tokenProperty) =>
    outcomes.filter((outcome) => !outcome?.[tokenProperty]?.isDefeated),
  ),
}));

import {
  getDefaultConsequencesVisibility,
  prepareConsequencesDialogContext,
} from '../../../scripts/chat/dialogs/Consequences/consequences-dialog-context.js';

describe('consequences dialog context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.game = {
      i18n: { localize: jest.fn((key) => key), format: jest.fn((key) => key) },
      settings: {
        get: jest.fn((moduleId, key) => key === 'autoVisibilityEnabled'),
      },
    };
  });

  function buildToken(id, overrides = {}) {
    return {
      id,
      name: id,
      document: {
        id,
        hidden: false,
        texture: { src: `${id}.webp` },
        getFlag: jest.fn(() => null),
      },
      ...overrides,
    };
  }

  function buildApp() {
    const attacker = buildToken('attacker', {
      document: {
        id: 'attacker',
        hidden: false,
        texture: { src: 'attacker.webp' },
        getFlag: jest.fn(() => null),
      },
    });
    const visibleTarget = buildToken('observer-1', {
      document: {
        id: 'observer-1',
        hidden: false,
        texture: { src: 'observer.webp' },
        getFlag: jest.fn((moduleId, flagKey) =>
          flagKey === 'avs-override-from-attacker' ? { state: 'hidden' } : null,
        ),
      },
    });
    const hiddenTarget = buildToken('hidden-target', {
      document: {
        id: 'hidden-target',
        hidden: true,
        texture: { src: 'hidden.webp' },
        getFlag: jest.fn(() => null),
      },
    });

    return {
      attackingToken: attacker,
      outcomes: [
        {
          target: visibleTarget,
          currentVisibility: 'hidden',
          changed: true,
        },
        {
          target: hiddenTarget,
          currentVisibility: 'observed',
          newVisibility: 'hidden',
        },
        {
          target: buildToken('out-of-view'),
          currentVisibility: 'observed',
          newVisibility: 'hidden',
        },
        {
          target: buildToken('defeated-target', { isDefeated: true }),
          currentVisibility: 'observed',
          newVisibility: 'hidden',
        },
      ],
      ignoreAllies: true,
      hideFoundryHidden: true,
      filterByDetection: true,
      applyEncounterFilter: jest.fn((outcomes) => outcomes),
      buildOverrideStates: jest.fn(() => [
        {
          value: 'avs',
          icon: 'fas fa-bolt-auto',
          label: 'AVS',
          selected: true,
          calculatedOutcome: true,
        },
      ]),
      calculateHasActionableChange: jest.fn(() => true),
      isOldStateAvsControlled: jest.fn(() => true),
      resolveTokenImage: jest.fn((token) => `${token.id}-resolved.webp`),
      buildCommonContext: jest.fn(() => ({ changesCount: 1, totalCount: 1 })),
    };
  }

  test('defaults consequence rows to AVS when AVS is enabled', () => {
    expect(getDefaultConsequencesVisibility()).toBe('avs');
  });

  test('filters display outcomes, syncs source outcomes, and flags existing overrides', async () => {
    const app = buildApp();
    const context = await prepareConsequencesDialogContext(app, {});

    expect(app.applyEncounterFilter).toHaveBeenCalledWith(
      app.outcomes,
      'target',
      'No encounter targets found, showing all',
    );
    expect(context.attackingToken).toMatchObject({
      id: 'attacker',
      image: 'attacker-resolved.webp',
    });
    expect(context.outcomes).toHaveLength(1);
    expect(context.outcomes[0]).toMatchObject({
      target: { id: 'observer-1' },
      newVisibility: 'avs',
      hasActionableChange: true,
      overrideState: null,
      tokenImage: 'observer-1-resolved.webp',
      isOldStateAvsControlled: true,
    });
    expect(context.outcomes[0].availableStates).toEqual([
      expect.objectContaining({ value: 'avs', calculatedOutcome: true }),
    ]);
    expect(context.avsEnabled).toBe(true);
    expect(context.hasExistingOverrides).toBe(true);
    expect(app.outcomes[0]).toMatchObject({
      hasActionableChange: true,
      newVisibility: 'avs',
    });
  });
});
