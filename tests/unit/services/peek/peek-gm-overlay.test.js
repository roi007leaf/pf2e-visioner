import '../../../setup.js';
import { PeekGmOverlay } from '../../../../scripts/services/Peek/peek-gm-overlay.js';
import { peekRegistry } from '../../../../scripts/services/Peek/PeekRegistry.js';

describe('PeekGmOverlay', () => {
  let prevCanvas;
  beforeEach(() => { prevCanvas = global.canvas; });
  afterEach(() => { global.canvas = prevCanvas; });

  test('render does not throw with no canvas', () => {
    global.canvas = undefined;
    const o = new PeekGmOverlay();
    expect(() => o.render()).not.toThrow();
  });

  test('render does not throw with no canvas.interface', () => {
    global.canvas = { scene: { id: 's' } };
    const o = new PeekGmOverlay();
    expect(() => o.render()).not.toThrow();
  });

  test('clearAll is safe on an empty overlay', () => {
    const o = new PeekGmOverlay();
    expect(() => o.clearAll()).not.toThrow();
  });

  test('GM markers follow current seen IDs and disappear on end or role change', () => {
    const previousPIXI = global.PIXI;
    const previousUser = game.user;
    const graphics = {
      clear: jest.fn(), lineStyle: jest.fn(), beginFill: jest.fn(), endFill: jest.fn(),
      drawPolygon: jest.fn(), drawEllipse: jest.fn(), drawCircle: jest.fn(), destroy: jest.fn(),
    };
    const layer = { addChild: jest.fn(), removeChild: jest.fn() };
    graphics.parent = layer;
    try {
      global.PIXI = { Graphics: jest.fn(() => graphics) };
      game.user = { id: 'gm', isGM: true };
      global.canvas = { interface: layer, tokens: { get: (id) => id === 'seen' ? { actor: { type: 'npc' }, document: { disposition: -1 }, center: { x: 100, y: 200 }, w: 100, h: 100 } : null } };
      const peek = { origin: { x: 0, y: 0 }, userId: 'player', userColor: 0xff9800, seenTokenIds: ['seen', 'missing'] };
      peekRegistry.set('observer', peek, 0);
      const overlay = new PeekGmOverlay();
      overlay.render();
      expect(graphics.drawCircle).toHaveBeenCalledWith(100, 200, 56);
      expect(graphics.drawEllipse).toHaveBeenCalledWith(100, 130, 15, 9);
      graphics.drawCircle.mockClear();
      peekRegistry.set('observer', { ...peek, seenTokenIds: [] }, 1);
      overlay.render();
      expect(graphics.drawCircle).not.toHaveBeenCalledWith(100, 200, 56);
      game.user.isGM = false;
      overlay.render();
      expect(graphics.destroy).toHaveBeenCalledTimes(1);
      game.user.isGM = true;
      overlay.render();
      peekRegistry.clear('observer');
      overlay.render();
      expect(graphics.destroy).toHaveBeenCalledTimes(2);
    } finally {
      peekRegistry.clearAll();
      global.PIXI = previousPIXI;
      game.user = previousUser;
    }
  });

  test.each([
    ['enemy', 'npc', -1, null, false, true],
    ['neutral NPC', 'npc', 0, null, false, true],
    ['friendly NPC', 'npc', 1, null, false, false],
    ['party NPC', 'npc', 0, 'party', false, false],
    ['PF2e ally', 'npc', -1, null, true, false],
    ['PC', 'character', 0, null, false, false],
    ['loot', 'loot', 0, null, false, false],
    ['hazard', 'hazard', -1, null, false, false],
  ])('marker eligibility: %s', (_label, type, disposition, alliance, ally, expected) => {
    const overlay = new PeekGmOverlay();
    const observer = { actor: { isAllyOf: () => ally } };
    const target = { actor: { type, alliance }, document: { disposition } };
    expect(overlay._isTargetEligible(observer, target)).toBe(expected);
  });

  test('players never draw seen-token markers, including their own peek', () => {
    const overlay = new PeekGmOverlay();
    const previousUser = game.user;
    try {
      game.user = { id: 'player', isGM: false };
      global.canvas = { interface: {}, tokens: { get: jest.fn() } };
      peekRegistry.set('observer', { origin: { x: 0, y: 0 }, userId: 'player', seenTokenIds: ['seen'] }, 0);
      const draw = jest.spyOn(overlay, '_draw').mockImplementation(() => {});
      overlay.render();
      expect(draw).toHaveBeenCalledWith({}, 'observer', expect.any(Object), false);
    } finally {
      peekRegistry.clearAll();
      game.user = previousUser;
    }
  });
});
