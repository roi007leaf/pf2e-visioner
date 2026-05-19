/**
 * @jest-environment jsdom
 */

jest.mock('../../../scripts/chat/services/infra/shared-utils.js', () => ({
  filterOutcomesByAllies: jest.fn((outcomes) => outcomes.filter((outcome) => !outcome.ally)),
  filterOutcomesByDefeated: jest.fn((outcomes) =>
    outcomes.filter((outcome) => !outcome.defeated),
  ),
  filterOutcomesByDetection: jest.fn(async (outcomes) =>
    outcomes.filter((outcome) => !outcome.offscreen),
  ),
  filterOutcomesBySeekDistance: jest.fn((outcomes) =>
    outcomes.filter((outcome) => !outcome.outOfRange),
  ),
  filterOutcomesByTemplate: jest.fn((outcomes) =>
    outcomes.filter((outcome) => !outcome.templateOut),
  ),
  hasActiveEncounter: jest.fn(() => false),
}));
jest.mock('../../../scripts/utils.js', () => ({
  getVisibilityBetween: jest.fn(() => null),
}));

import {
  applySeekVisualFilters,
  getSeekDialogFilteredOutcomes,
  isSeekRangeLimited,
  isSeekTemplateMode,
  preserveSeekOverrides,
} from '../../../scripts/chat/dialogs/Seek/seek-dialog-filtering.js';
import * as sharedUtils from '../../../scripts/chat/services/infra/shared-utils.js';

describe('seek dialog filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.game = {
      settings: {
        get: jest.fn((moduleId, key) => {
          if (key === 'limitSeekRangeInCombat') return true;
          if (key === 'limitSeekRangeOutOfCombat') return false;
          return false;
        }),
      },
    };
  });

  function buildDialog(overrides = {}) {
    return {
      _originalOutcomes: [
        { target: { id: 't1' } },
        { target: { id: 't2' }, ally: true },
        { target: { id: 't3' }, outOfRange: true },
        { target: { id: 't4' }, offscreen: true },
        { target: { id: 't5' }, defeated: true },
      ],
      outcomes: [{ target: { id: 't1' }, overrideState: 'hidden' }],
      actorToken: { id: 'actor' },
      ignoreAllies: true,
      ignoreWalls: false,
      filterByDetection: true,
      actionData: {},
      isSearchExplorationGroup: () => false,
      applyEncounterFilter: jest.fn((outcomes) => outcomes),
      getOutcomeTokenId: (outcome) => outcome?.target?.id ?? null,
      ...overrides,
    };
  }

  test('detects template mode from seek template fields', () => {
    expect(isSeekTemplateMode({ seekTemplateCenter: { x: 1, y: 2 }, seekTemplateRadiusFeet: 30 }))
      .toBe(true);
    expect(isSeekTemplateMode({ seekTemplateCenter: { x: 1, y: 2 } })).toBe(false);
  });

  test('reports range limit from encounter setting pair', () => {
    sharedUtils.hasActiveEncounter.mockReturnValueOnce(true);

    expect(isSeekRangeLimited()).toBe(true);
  });

  test('filters seek outcomes and preserves visible override selections', async () => {
    const result = await getSeekDialogFilteredOutcomes(buildDialog(), {
      includeDefeated: true,
      preserveOverrides: true,
    });

    expect(result).toEqual([{ target: { id: 't1' }, overrideState: 'hidden' }]);
    expect(sharedUtils.filterOutcomesByAllies).toHaveBeenCalled();
    expect(sharedUtils.filterOutcomesBySeekDistance).toHaveBeenCalled();
    expect(sharedUtils.filterOutcomesByDetection).toHaveBeenCalled();
    expect(sharedUtils.filterOutcomesByDefeated).toHaveBeenCalled();
  });

  test('skips detection filtering in template mode', async () => {
    const dialog = buildDialog({
      actionData: { seekTemplateCenter: { x: 1, y: 2 }, seekTemplateRadiusFeet: 30 },
    });

    await getSeekDialogFilteredOutcomes(dialog);

    expect(sharedUtils.filterOutcomesByTemplate).toHaveBeenCalled();
    expect(sharedUtils.filterOutcomesByDetection).not.toHaveBeenCalled();
  });

  test('preserves wall overrides by wall id', () => {
    const result = preserveSeekOverrides(
      [{ _isWall: true, wallId: 'w1' }],
      [{ _isWall: true, wallId: 'w1', overrideState: 'hidden' }],
      (outcome) => outcome?.target?.id ?? null,
    );

    expect(result).toEqual([{ _isWall: true, wallId: 'w1', overrideState: 'hidden' }]);
  });

  test('applies display-only visual filters', () => {
    const result = applySeekVisualFilters(
      [
        { target: { document: { hidden: true } }, hasActionableChange: true },
        { target: { document: { hidden: false } }, hasActionableChange: false },
        { _isWall: true, target: { document: { hidden: true } }, hasActionableChange: true },
      ],
      { hideFoundryHidden: true, showOnlyChanges: true },
    );

    expect(result).toEqual([
      { _isWall: true, target: { document: { hidden: true } }, hasActionableChange: true },
    ]);
  });
});
