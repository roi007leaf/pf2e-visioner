jest.mock('../../../scripts/chat/services/infra/shared-utils.js', () => ({
  filterOutcomesByAllies: jest.fn((outcomes) => outcomes),
  filterOutcomesByDetection: jest.fn(async (outcomes) =>
    outcomes.filter((outcome) => outcome?.target?.id !== 'out-of-view'),
  ),
  filterOutcomesByDefeated: jest.fn((outcomes, tokenProperty) =>
    outcomes.filter((outcome) => !outcome?.[tokenProperty]?.isDefeated),
  ),
}));

jest.mock('../../../scripts/chat/services/FeatsHandler.js', () => ({
  FeatsHandler: {
    hasCeaselessShadows: jest.fn(() => true),
  },
}));

import {
  getTakeCoverDisplayBaseline,
  normalizeTakeCoverDialogCover,
  prepareTakeCoverDialogContext,
} from '../../../scripts/chat/dialogs/TakeCover/take-cover-dialog-context.js';

describe('take cover dialog context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.game = {
      i18n: { localize: jest.fn((key) => key), format: jest.fn((key) => key) },
      settings: { get: jest.fn(() => false) },
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
    return {
      actorToken: buildToken('taker'),
      outcomes: [
        {
          target: buildToken('observer-1'),
          baselineCover: 'lesser',
          newCover: 'lesser',
        },
        {
          target: buildToken('out-of-view'),
          baselineCover: 'none',
          newCover: 'standard',
        },
      ],
      changes: [],
      ignoreAllies: true,
      hideFoundryHidden: false,
      showOnlyChanges: false,
      filterByDetection: true,
      encounterOnly: false,
      applyEncounterFilter: jest.fn((outcomes) => outcomes),
      coverConfig: jest.fn((state) => ({ label: state, icon: `icon-${state}`, cssClass: `cover-${state}` })),
      resolveTokenImage: jest.fn((token) => `${token.id}-resolved.webp`),
      buildCommonContext: jest.fn(() => ({ changesCount: 1, totalCount: 1 })),
    };
  }

  test('normalizes lesser cover display baseline but standard Take Cover result', () => {
    expect(normalizeTakeCoverDialogCover('lesser', { baseline: true })).toBe('lesser');
    expect(normalizeTakeCoverDialogCover('lesser', { result: true })).toBe('standard');
    expect(getTakeCoverDisplayBaseline({ baselineCover: 'lesser' })).toBe('lesser');
  });

  test('builds cover row context and feat badges', async () => {
    const app = buildApp();
    const context = await prepareTakeCoverDialogContext(app, {});

    expect(context.actorTokenImage).toBe('taker-resolved.webp');
    expect(context.outcomes).toHaveLength(1);
    expect(context.outcomes[0]).toMatchObject({
      target: { id: 'observer-1' },
      tokenImage: 'observer-1-resolved.webp',
      oldVisibility: 'lesser',
      newVisibility: 'standard',
      hasActionableChange: true,
    });
    expect(context.takeCoverBadges).toEqual([
      expect.objectContaining({ key: 'ceaseless-shadows', icon: 'fas fa-infinity' }),
    ]);
  });
});
