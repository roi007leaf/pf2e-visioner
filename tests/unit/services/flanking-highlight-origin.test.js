import '../../setup.js';

import { MODULE_ID } from '../../../scripts/constants.js';
import {
  drawForTargetWithRule,
  ensureFlankingHighlightPatched,
} from '../../../scripts/services/flanking/flanking-highlight-origin.js';

const GRID = 100;
const rect = (x, y, w, h) => ({ x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h });

function graphicsMock() {
  const calls = [];
  const g = {};
  for (const m of ['lineStyle', 'moveTo', 'lineTo', 'beginFill', 'drawCircle', 'addChild']) {
    g[m] = jest.fn((...args) => {
      calls.push([m, ...args]);
      return g;
    });
  }
  return { g, calls };
}

function token(bounds) {
  return {
    mechanicalBounds: bounds,
    center: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
  };
}

function rendererFor(flanker, buddies) {
  const { g, calls } = graphicsMock();
  flanker.buddiesFlanking = jest.fn(() => buddies);
  return {
    renderer: { token: flanker, layer: g, labelText: 'Flanking', lineColor: 0xff00ff },
    calls,
  };
}

describe('drawForTargetWithRule', () => {
  const target = token(rect(100, 200, 100, 100));
  const largeAlly = token(rect(0, 0, 200, 200));
  const flanker = token(rect(200, 300, 100, 100));

  beforeEach(() => {
    global.canvas = { grid: { size: GRID, isGridless: false }, dimensions: { size: GRID } };
    global.CONFIG = {
      ...(global.CONFIG ?? {}),
      Canvas: { objectBorderThickness: 4 },
      canvasTextStyle: { clone: () => ({}) },
    };
    global.foundry = global.foundry ?? {};
    global.foundry.canvas = {
      containers: {
        PreciseText: class {
          constructor(text) {
            this.text = text;
            this.anchor = { set: jest.fn() };
            this.position = { set: jest.fn() };
          }
        },
      },
    };
  });

  afterEach(() => {
    global.game.settings.set(MODULE_ID, 'flankingSizeRule', undefined);
  });

  test('raw rule delegates to original renderer', () => {
    global.game.settings.set(MODULE_ID, 'flankingSizeRule', 'raw');
    const original = jest.fn();
    const { renderer } = rendererFor(flanker, [largeAlly]);
    drawForTargetWithRule(original, renderer, target);
    expect(original).toHaveBeenCalledWith(target);
  });

  test('anySquare draws line from the square pair that flanks', () => {
    global.game.settings.set(MODULE_ID, 'flankingSizeRule', 'anySquare');
    const original = jest.fn();
    const { renderer, calls } = rendererFor(flanker, [largeAlly]);
    drawForTargetWithRule(original, renderer, target);
    expect(original).not.toHaveBeenCalled();
    const lineTos = calls.filter(([m]) => m === 'lineTo');
    expect(lineTos.length).toBeGreaterThan(0);
    expect(lineTos.every(([, x, y]) => !(x === 100 && y === 100))).toBe(true);
    expect(calls.some(([m, x, y]) => m === 'moveTo' && x === 250 && y === 350)).toBe(true);
  });

  test('falls back to centers when buddy has no pair', () => {
    global.game.settings.set(MODULE_ID, 'flankingSizeRule', 'anySquare');
    const original = jest.fn();
    const sameSide = token(rect(200, 0, 100, 100));
    const { renderer, calls } = rendererFor(sameSide, [largeAlly]);
    drawForTargetWithRule(original, renderer, target);
    expect(calls.some(([m, x, y]) => m === 'lineTo' && x === 100 && y === 100)).toBe(true);
  });
});

describe('ensureFlankingHighlightPatched', () => {
  test('patches prototype once and routes drawForTarget through the rule', () => {
    const drawForTarget = jest.fn();
    class Renderer {}
    Renderer.prototype.drawForTarget = drawForTarget;
    const tokenObj = { flankingHighlight: new Renderer() };
    expect(ensureFlankingHighlightPatched(tokenObj)).toBe(true);
    expect(ensureFlankingHighlightPatched(tokenObj)).toBe(false);
    expect(Renderer.prototype.drawForTarget).not.toBe(drawForTarget);
    global.game.settings.set(MODULE_ID, 'flankingSizeRule', 'raw');
    tokenObj.flankingHighlight.drawForTarget('t');
    expect(drawForTarget).toHaveBeenCalledWith('t');
    global.game.settings.set(MODULE_ID, 'flankingSizeRule', undefined);
  });

  test('returns false without a renderer', () => {
    expect(ensureFlankingHighlightPatched({})).toBe(false);
  });
});
