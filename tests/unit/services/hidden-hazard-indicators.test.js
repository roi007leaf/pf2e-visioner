import '../../setup.js';

import {
  createHiddenHazardIndicator,
  drawHiddenHazardIndicator,
  getHiddenHazardObservers,
  isHazardOrLootHiddenFromAnyObserver,
  removeHiddenHazardIndicator,
  shouldShowHiddenHazardIndicator,
  syncHiddenHazardIndicator,
} from '../../../scripts/services/hidden-hazard-indicators.js';

function token(id, type, defaultVisibility = 'observed') {
  const value = {
    id,
    actor: { type },
    document: {
      id,
      width: 1,
      height: 1,
      getFlag: jest.fn(() => defaultVisibility),
    },
    addChild: jest.fn((child) => {
      child.parent = value;
    }),
    removeChild: jest.fn((child) => {
      child.parent = null;
    }),
  };
  return value;
}

function graphics() {
  return {
    clear: jest.fn(),
    lineStyle: jest.fn(),
    drawRect: jest.fn(),
    beginFill: jest.fn(),
    drawCircle: jest.fn(),
    drawEllipse: jest.fn(),
    endFill: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    destroy: jest.fn(),
  };
}

describe('hidden hazard indicators', () => {
  const gm = { isGM: true };
  const scene = { tokenVision: true };

  test('uses selected tokens as observers and all scene tokens when selection is empty', () => {
    const pc = token('pc', 'character');
    const npc = token('npc', 'npc');
    const otherHazard = token('other-hazard', 'hazard');
    const tokens = [pc, npc, otherHazard];

    expect(getHiddenHazardObservers(tokens, [npc])).toEqual([npc]);
    expect(getHiddenHazardObservers(tokens, [])).toEqual(tokens);
  });

  test('treats hazard as hidden when any relevant observer has Hidden state', () => {
    const hazard = token('hazard', 'hazard');
    const observers = [token('pc-1', 'character'), token('pc-2', 'character')];

    expect(
      isHazardOrLootHiddenFromAnyObserver(hazard, observers, {
        getVisibility: () => 'hidden',
      }),
    ).toBe(true);
    expect(
      isHazardOrLootHiddenFromAnyObserver(hazard, observers, {
        getVisibility: (observer) => (observer.id === 'pc-1' ? 'hidden' : 'observed'),
      }),
    ).toBe(true);
  });

  test('supports hidden loot targets', () => {
    const loot = token('loot', 'loot');
    const observer = token('pc', 'character');

    expect(
      isHazardOrLootHiddenFromAnyObserver(loot, [observer], {
        getVisibility: () => 'hidden',
      }),
    ).toBe(true);
  });

  test('uses default player visibility when scene has no player-character tokens', () => {
    const hazard = token('hazard', 'hazard');

    expect(
      isHazardOrLootHiddenFromAnyObserver(hazard, [], {
        getDefaultVisibility: () => 'hidden',
      }),
    ).toBe(true);
  });

  test('shows marker only to GMs with Token Vision enabled', () => {
    const hazard = token('hazard', 'hazard');
    const options = {
      scene,
      observers: [],
      getDefaultVisibility: () => 'hidden',
    };

    expect(shouldShowHiddenHazardIndicator(hazard, { ...options, user: gm })).toBe(true);
    expect(
      shouldShowHiddenHazardIndicator(hazard, { ...options, user: { isGM: false } }),
    ).toBe(false);
    expect(
      shouldShowHiddenHazardIndicator(hazard, {
        ...options,
        user: gm,
        scene: { tokenVision: false },
      }),
    ).toBe(false);
    expect(shouldShowHiddenHazardIndicator(token('loot', 'loot'), { ...options, user: gm })).toBe(
      true,
    );
  });

  test('draws orange frame and the module hidden eye-slash badge', () => {
    const indicator = graphics();

    drawHiddenHazardIndicator(indicator, { width: 100, height: 80 });

    expect(indicator.lineStyle).toHaveBeenNthCalledWith(1, 3, 0xff9800, 0.9);
    expect(indicator.drawRect).toHaveBeenCalledWith(3, 3, 94, 74);
    expect(indicator.drawEllipse).toHaveBeenCalledTimes(1);
    expect(indicator.drawCircle).toHaveBeenCalledTimes(2);
    expect(indicator.moveTo).toHaveBeenCalledTimes(1);
    expect(indicator.lineTo).toHaveBeenCalledTimes(1);
  });

  test('attaches marker to hazard token so Core visibility and Levels culling apply together', () => {
    const hazard = token('hazard', 'hazard');
    const indicator = graphics();
    const pixi = {
      Graphics: jest.fn(function Graphics() {
        return indicator;
      }),
    };

    expect(
      createHiddenHazardIndicator(hazard, {
        canvasLayer: { grid: { size: 100 } },
        pixi,
      }),
    ).toBe(indicator);
    expect(hazard.addChild).toHaveBeenCalledWith(indicator);
    expect(hazard._pvHiddenHazardIndicator).toBe(indicator);
    expect(indicator.eventMode).toBe('none');
  });

  test('removes existing marker when hazard is no longer hidden', () => {
    const hazard = token('hazard', 'hazard');
    const indicator = graphics();
    indicator.parent = hazard;
    hazard._pvHiddenHazardIndicator = indicator;

    expect(
      syncHiddenHazardIndicator(hazard, {
        user: gm,
        scene,
        observers: [],
        getDefaultVisibility: () => 'observed',
      }),
    ).toBe(false);
    expect(hazard.removeChild).toHaveBeenCalledWith(indicator);
    expect(indicator.destroy).toHaveBeenCalledWith({ children: true });
    expect(hazard._pvHiddenHazardIndicator).toBeNull();
    expect(removeHiddenHazardIndicator(hazard)).toBe(false);
  });

  test('recreates a stale marker reference after token redraw', () => {
    const hazard = token('hazard', 'hazard');
    const stale = graphics();
    stale.destroyed = true;
    stale.parent = null;
    hazard._pvHiddenHazardIndicator = stale;
    const replacement = graphics();
    const pixi = {
      Graphics: jest.fn(function Graphics() {
        return replacement;
      }),
    };

    expect(
      syncHiddenHazardIndicator(hazard, {
        user: gm,
        scene,
        observers: [],
        getDefaultVisibility: () => 'hidden',
        canvasLayer: { grid: { size: 100 } },
        pixi,
      }),
    ).toBe(true);
    expect(hazard._pvHiddenHazardIndicator).toBe(replacement);
    expect(pixi.Graphics).toHaveBeenCalledTimes(1);
  });
});
