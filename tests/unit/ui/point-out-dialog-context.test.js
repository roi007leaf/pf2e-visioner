jest.mock('../../../scripts/chat/services/infra/shared-utils.js', () => ({
  filterOutcomesByEncounter: jest.fn((outcomes) => outcomes),
  filterOutcomesByAllies: jest.fn((outcomes) => outcomes),
  filterOutcomesByDetection: jest.fn(async (outcomes) =>
    outcomes.filter((outcome) => outcome?.target?.id !== 'out-of-view'),
  ),
  filterOutcomesByDefeated: jest.fn((outcomes, tokenProperty) =>
    outcomes.filter((outcome) => !outcome?.[tokenProperty]?.isDefeated),
  ),
}));

import {
  getPointOutDialogFilteredOutcomes,
  preparePointOutDialogContext,
} from '../../../scripts/chat/dialogs/PointOut/point-out-dialog-context.js';

describe('point out dialog context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.game = {
      i18n: { localize: jest.fn((key) => key), format: jest.fn((key) => key) },
      settings: { get: jest.fn(() => true) },
    };
  });

  function buildToken(id, overrides = {}) {
    return {
      id,
      name: id,
      document: { id, hidden: false, texture: { src: `${id}.webp` } },
      ...overrides,
    };
  }

  function buildApp() {
    const targetToken = buildToken('pointed-target');
    const visible = buildToken('ally-1');
    const hidden = buildToken('hidden-ally', {
      document: { id: 'hidden-ally', hidden: true, texture: { src: 'hidden.webp' } },
    });

    return {
      actorToken: buildToken('actor'),
      outcomes: [
        {
          target: visible,
          targetToken,
          currentVisibility: 'observed',
          newVisibility: 'hidden',
          changed: true,
          dc: 20,
        },
        {
          target: hidden,
          targetToken,
          currentVisibility: 'observed',
          newVisibility: 'hidden',
          changed: true,
          dc: 20,
        },
        {
          target: buildToken('out-of-view'),
          targetToken,
          currentVisibility: 'observed',
          newVisibility: 'hidden',
          changed: true,
          dc: 20,
        },
        {
          target: buildToken('defeated-ally', { isDefeated: true }),
          targetToken,
          currentVisibility: 'observed',
          newVisibility: 'hidden',
          changed: true,
          dc: 20,
        },
      ],
      changes: [{ target: visible }],
      ignoreAllies: false,
      hideFoundryHidden: true,
      showOnlyChanges: false,
      filterByDetection: true,
      applyEncounterFilter: jest.fn((outcomes) => outcomes),
      buildOverrideStates: jest.fn(() => [
        { value: 'hidden', icon: 'fas fa-eye-slash', label: 'Hidden' },
      ]),
      isOldStateAvsControlled: jest.fn(() => false),
      isCurrentStateAvsControlled: jest.fn(() => false),
      visibilityConfig: jest.fn((state) => ({ state })),
      resolveTokenImage: jest.fn((token) => `${token.id}-resolved.webp`),
      buildCommonContext: jest.fn(() => ({ changesCount: 1, totalCount: 4 })),
    };
  }

  test('builds point out row context and target summary', async () => {
    const app = buildApp();
    const context = await preparePointOutDialogContext(app, {});

    expect(context.actorName).toBe('actor');
    expect(context.actorImage).toBe('actor-resolved.webp');
    expect(context.outcomes).toHaveLength(1);
    expect(context.outcomes[0]).toMatchObject({
      target: { id: 'ally-1' },
      tokenImage: 'ally-1-resolved.webp',
      overrideState: 'hidden',
      hasActionableChange: true,
    });
    expect(context.targetName).toBe('pointed-target');
    expect(context.targetDC).toBe(20);
    expect(app.outcomes[0].hasActionableChange).toBe(true);
    expect(app.outcomes[1].hasActionableChange).toBeUndefined();
  });

  test('filtered outcomes respects show-only-changes state diff', async () => {
    const app = buildApp();
    app.hideFoundryHidden = false;
    app.filterByDetection = false;
    app.outcomes[0].newVisibility = 'observed';
    app.showOnlyChanges = true;

    const filtered = await getPointOutDialogFilteredOutcomes(app);

    expect(filtered.map((outcome) => outcome.target.id)).not.toContain('ally-1');
  });
});
