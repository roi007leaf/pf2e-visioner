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
}));

import {
  applySneakVisualFilters,
  getSneakDialogFilteredOutcomes,
  preserveSneakOverrides,
} from '../../../scripts/chat/dialogs/Sneak/sneak-dialog-filtering.js';
import * as sharedUtils from '../../../scripts/chat/services/infra/shared-utils.js';

describe('sneak dialog filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildDialog(overrides = {}) {
    return {
      _originalOutcomes: [
        { token: { id: 't1' } },
        { token: { id: 't2' }, ally: true },
        { token: { id: 't3' }, offscreen: true },
        { token: { id: 't4' }, defeated: true },
      ],
      outcomes: [{ token: { id: 't1' }, overrideState: 'hidden' }],
      sneakingToken: { id: 'sneak' },
      ignoreAllies: true,
      filterByDetection: true,
      applyEncounterFilter: jest.fn((outcomes) => outcomes),
      ...overrides,
    };
  }

  test('filters sneak outcomes and preserves visible override selections', async () => {
    const result = await getSneakDialogFilteredOutcomes(buildDialog(), {
      includeDefeated: true,
      preserveOverrides: true,
    });

    expect(result).toEqual([{ token: { id: 't1' }, overrideState: 'hidden' }]);
    expect(sharedUtils.filterOutcomesByAllies).toHaveBeenCalled();
    expect(sharedUtils.filterOutcomesByDetection).toHaveBeenCalled();
    expect(sharedUtils.filterOutcomesByDefeated).toHaveBeenCalled();
  });

  test('skips detection filtering without active sneaking token', async () => {
    const dialog = buildDialog({ sneakingToken: null });

    await getSneakDialogFilteredOutcomes(dialog);

    expect(sharedUtils.filterOutcomesByAllies).toHaveBeenCalled();
    expect(sharedUtils.filterOutcomesByDetection).not.toHaveBeenCalled();
  });

  test('preserves overrides by observer token id', () => {
    const result = preserveSneakOverrides(
      [{ token: { id: 't1' } }],
      [{ token: { id: 't1' }, overrideState: 'concealed' }],
    );

    expect(result).toEqual([{ token: { id: 't1' }, overrideState: 'concealed' }]);
  });

  test('applies display-only visual filters', () => {
    const result = applySneakVisualFilters(
      [
        { token: { document: { hidden: true } }, hasActionableChange: true },
        { token: { document: { hidden: false } }, hasActionableChange: false },
        { token: { document: { hidden: false } }, hasActionableChange: true },
      ],
      { hideFoundryHidden: true, showChangesOnly: true },
    );

    expect(result).toEqual([
      { token: { document: { hidden: false } }, hasActionableChange: true },
    ]);
  });
});
