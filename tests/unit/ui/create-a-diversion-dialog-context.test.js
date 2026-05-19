jest.mock('../../../scripts/chat/services/infra/shared-utils.js', () => ({
  filterOutcomesByAllies: jest.fn((outcomes) => outcomes),
  filterOutcomesByDetection: jest.fn(async (outcomes) =>
    outcomes.filter((outcome) => outcome?.observer?.id !== 'out-of-view'),
  ),
  filterOutcomesByDefeated: jest.fn((outcomes, tokenProperty) =>
    outcomes.filter((outcome) => !outcome?.[tokenProperty]?.isDefeated),
  ),
}));

import { prepareCreateADiversionDialogContext } from '../../../scripts/chat/dialogs/CreateADiversion/create-a-diversion-dialog-context.js';

describe('create a diversion dialog context', () => {
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
      },
      ...overrides,
    };
  }

  function buildApp() {
    const divertingToken = buildToken('diverter');
    const observer = buildToken('observer-1');
    const hiddenObserver = buildToken('hidden-observer', {
      document: { id: 'hidden-observer', hidden: true, texture: { src: 'hidden.webp' } },
    });

    return {
      divertingToken,
      outcomes: [
        {
          observer,
          currentVisibility: 'observed',
          newVisibility: 'hidden',
          outcome: 'success',
          margin: 2,
        },
        { observer: divertingToken, currentVisibility: 'observed', newVisibility: 'hidden' },
        { observer: hiddenObserver, currentVisibility: 'observed', newVisibility: 'hidden' },
        {
          observer: buildToken('out-of-view'),
          currentVisibility: 'observed',
          newVisibility: 'hidden',
        },
        {
          observer: buildToken('defeated-observer', { isDefeated: true }),
          currentVisibility: 'observed',
          newVisibility: 'hidden',
        },
      ],
      ignoreAllies: true,
      hideFoundryHidden: true,
      showOnlyChanges: false,
      filterByDetection: true,
      applyEncounterFilter: jest.fn((outcomes) => outcomes),
      buildOverrideStates: jest.fn(() => [
        {
          value: 'hidden',
          icon: 'fas fa-eye-slash',
          label: 'Hidden',
          selected: true,
          calculatedOutcome: true,
        },
      ]),
      calculateHasActionableChange: jest.fn(() => true),
      resolveTokenImage: jest.fn((token) => `${token.id}-resolved.webp`),
      getMarginText: jest.fn((outcome) => `+${outcome.margin}`),
      getOutcomeClass: jest.fn(() => 'success'),
      getOutcomeLabel: jest.fn(() => 'Success'),
      buildCommonContext: jest.fn(() => ({ changesCount: 1, totalCount: 1 })),
    };
  }

  test('filters display outcomes and builds row context', async () => {
    const app = buildApp();
    const context = await prepareCreateADiversionDialogContext(app, {});

    expect(app.applyEncounterFilter).toHaveBeenCalledWith(
      app.outcomes,
      'observer',
      'No encounter observers found, showing all',
    );
    expect(context.divertingToken).toMatchObject({ id: 'diverter', image: 'diverter-resolved.webp' });
    expect(context.outcomes).toHaveLength(1);
    expect(context.outcomes[0]).toMatchObject({
      observer: { id: 'observer-1' },
      hasActionableChange: true,
      overrideState: null,
      tokenImage: 'observer-1.webp',
      outcomeClass: 'success',
      outcomeLabel: 'Success',
    });
    expect(context.outcomes[0].availableStates).toEqual([
      expect.objectContaining({ key: 'hidden', calculatedOutcome: true }),
    ]);
    expect(context.ignoreAllies).toBe(true);
    expect(context.hideFoundryHidden).toBe(true);
    expect(app.processedOutcomes).toHaveLength(1);
  });
});
