/**
 * @jest-environment jsdom
 */

jest.mock('../../../scripts/utils.js', () => ({
  getVisibilityBetween: jest.fn(() => null),
  setVisibilityBetween: jest.fn(async () => undefined),
}));

jest.mock('../../../scripts/chat/services/data/action-state-config.js', () => ({
  getDesiredOverrideStatesForAction: jest.fn(() => ['observed', 'hidden', 'avs']),
}));

jest.mock('../../../scripts/visibility/auto-visibility/VisionAnalyzer.js', () => ({
  VisionAnalyzer: {
    getInstance: jest.fn(() => ({
      hasLineOfSight: jest.fn(() => false),
    })),
  },
}));

import {
  calculateSeekOutcomeActionability,
  prepareSeekOutcomeContext,
  prepareSeekOutcomeContexts,
} from '../../../scripts/chat/dialogs/Seek/seek-outcome-context.js';
import { getVisibilityBetween, setVisibilityBetween } from '../../../scripts/utils.js';
import { VisionAnalyzer } from '../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';
import { getDesiredOverrideStatesForAction } from '../../../scripts/chat/services/data/action-state-config.js';

describe('seek outcome context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.game = { user: { isGM: false } };
    global.canvas = { tokens: { placeables: [] } };
  });

  function buildApp(overrides = {}) {
    return {
      actorToken: { id: 'observer' },
      buildOverrideStates: jest.fn((states) => states),
      getOutcomeTokenId: (outcome) => outcome?.target?.id ?? null,
      getOutcomeClass: jest.fn(() => 'success'),
      getOutcomeLabel: jest.fn(() => 'Success'),
      visibilityConfig: jest.fn((state) => ({ state })),
      formatMargin: jest.fn((margin) => `${margin}`),
      resolveTokenImage: jest.fn(() => 'token.webp'),
      isOldStateAvsControlled: jest.fn(() => false),
      isCurrentStateAvsControlled: jest.fn(() => false),
      ...overrides,
    };
  }

  test('builds display context without VisionAnalyzer when result is not observed', async () => {
    const app = buildApp();
    const result = await prepareSeekOutcomeContext(app, {
      target: { id: 'target' },
      oldVisibility: 'observed',
      newVisibility: 'hidden',
      outcome: 'success',
      margin: 2,
    });

    expect(result).toEqual(expect.objectContaining({
      rowId: 'target',
      newVisibilityState: { state: 'hidden' },
      deferred: false,
    }));
    expect(VisionAnalyzer.getInstance).not.toHaveBeenCalled();
  });

  test('checks LOS once for observed results and marks blocked rows deferred', async () => {
    const app = buildApp();
    const result = await prepareSeekOutcomeContext(app, {
      target: { id: 'target' },
      observerToken: { id: 'observer' },
      oldVisibility: 'hidden',
      newVisibility: 'observed',
    });

    expect(result.deferred).toBe(true);
    expect(VisionAnalyzer.getInstance).toHaveBeenCalledTimes(1);
  });

  test('syncs PF2e hidden condition into Visioner mapping for GM display', async () => {
    const deleteCondition = jest.fn(async () => undefined);
    const pcToken = { id: 'pc', actor: { type: 'character', hasPlayerOwner: true } };
    const target = {
      id: 'target',
      actor: {
        conditions: { get: jest.fn(() => true) },
        itemTypes: { condition: [{ slug: 'hidden', delete: deleteCondition }] },
      },
    };
    global.game.user.isGM = true;
    global.canvas.tokens.placeables = [pcToken];
    getVisibilityBetween.mockReturnValue('observed');

    const result = await prepareSeekOutcomeContext(buildApp(), {
      target,
      observerToken: { id: 'observer' },
      currentVisibility: 'observed',
      newVisibility: 'observed',
    });

    expect(setVisibilityBetween).toHaveBeenCalledWith(pcToken, target, 'hidden', {
      direction: 'observer_to_target',
    });
    expect(setVisibilityBetween).toHaveBeenCalledWith({ id: 'observer' }, target, 'hidden', {
      direction: 'observer_to_target',
    });
    expect(deleteCondition).toHaveBeenCalled();
    expect(result.oldVisibilityState).toEqual({ state: 'hidden' });
  });

  test('reuses seek context prep resources for multi-row GM condition sync', async () => {
    const pcToken = { id: 'pc', actor: { type: 'character', hasPlayerOwner: true } };
    const targetA = {
      id: 'target-a',
      actor: {
        conditions: { get: jest.fn(() => true) },
        itemTypes: { condition: [{ slug: 'hidden', delete: jest.fn(async () => undefined) }] },
      },
    };
    const targetB = {
      id: 'target-b',
      actor: {
        conditions: { get: jest.fn(() => true) },
        itemTypes: { condition: [{ slug: 'hidden', delete: jest.fn(async () => undefined) }] },
      },
    };
    const placeables = {
      filter: jest.fn((predicate) => [pcToken].filter(predicate)),
    };
    global.game.user.isGM = true;
    global.canvas.tokens.placeables = placeables;
    getVisibilityBetween.mockReturnValue('observed');

    const app = buildApp();
    const results = await prepareSeekOutcomeContexts(app, [
      {
        target: targetA,
        observerToken: { id: 'observer' },
        currentVisibility: 'observed',
        newVisibility: 'observed',
      },
      {
        target: targetB,
        observerToken: { id: 'observer' },
        currentVisibility: 'observed',
        newVisibility: 'observed',
      },
    ]);

    expect(results).toHaveLength(2);
    expect(placeables.filter).toHaveBeenCalledTimes(1);
    expect(getDesiredOverrideStatesForAction).toHaveBeenCalledTimes(1);
    expect(setVisibilityBetween).toHaveBeenCalledWith(pcToken, targetA, 'hidden', {
      direction: 'observer_to_target',
    });
    expect(setVisibilityBetween).toHaveBeenCalledWith(pcToken, targetB, 'hidden', {
      direction: 'observer_to_target',
    });
  });

  test('treats explicit AVS selection as non-actionable when current state is AVS-controlled', () => {
    const app = buildApp({ isCurrentStateAvsControlled: jest.fn(() => true) });

    expect(
      calculateSeekOutcomeActionability(
        app,
        { overrideState: 'avs' },
        { effectiveNewState: 'avs', baseOldState: 'hidden', isOldStateAvsControlled: true },
      ),
    ).toBe(false);
  });
});
