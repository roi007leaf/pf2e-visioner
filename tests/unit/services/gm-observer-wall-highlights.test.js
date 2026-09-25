import {
  clearGmObserverWallHighlights,
  syncGmObserverWallHighlights,
} from '../../../scripts/services/GmObserverView/gm-observer-wall-highlights.js';

class FakeGraphics {
  constructor() {
    this.calls = [];
    this.destroyed = false;
  }

  lineStyle(...args) {
    this.calls.push(['lineStyle', ...args]);
  }
  moveTo(...args) {
    this.calls.push(['moveTo', ...args]);
  }
  lineTo(...args) {
    this.calls.push(['lineTo', ...args]);
  }
  clear() {
    this.calls = [];
  }
  destroy() {
    this.destroyed = true;
  }
}

function wall(c, color) {
  return { document: { c }, _getWallColor: () => color };
}

function makeCanvas(walls) {
  const layer = {
    placeables: walls,
    children: [],
    addChild(child) {
      child.parent = this;
      this.children.push(child);
    },
    removeChild(child) {
      this.children = this.children.filter((item) => item !== child);
      child.parent = null;
    },
  };
  return { ready: true, scene: {}, walls: layer };
}

describe('GM Observer wall highlights', () => {
  beforeEach(() => {
    globalThis.PIXI = { Graphics: FakeGraphics };
    globalThis.canvas = makeCanvas([wall([1, 2, 3, 4], '#ffffbb'), wall([5, 6, 7, 8], 0x66cc66)]);
  });

  afterEach(() => {
    clearGmObserverWallHighlights();
  });

  it('uses one static, noninteractive graphic with Core wall and door colors', () => {
    const graphic = syncGmObserverWallHighlights({ active: true, enabled: true });

    expect(canvas.walls.children).toEqual([graphic]);
    expect(graphic.eventMode).toBe('none');
    expect(graphic.calls.filter((call) => call[0] === 'lineStyle')).toEqual([
      ['lineStyle', 6, 0x000000, 0.55],
      ['lineStyle', 3, 0xffffbb, 0.95],
      ['lineStyle', 6, 0x000000, 0.55],
      ['lineStyle', 3, 0x66cc66, 0.95],
    ]);
    expect(syncGmObserverWallHighlights({ active: true, enabled: true })).toBe(graphic);
    expect(canvas.walls.children).toHaveLength(1);
  });

  it('redraws changed walls on demand and removes highlights when disabled', () => {
    const graphic = syncGmObserverWallHighlights({ active: true, enabled: true });
    canvas.walls.placeables = [wall([9, 10, 11, 12], '#ee4444')];

    expect(syncGmObserverWallHighlights({ active: true, enabled: true, redraw: true })).toBe(
      graphic,
    );
    expect(graphic.calls).toContainEqual(['lineStyle', 3, 0xee4444, 0.95]);
    expect(graphic.calls.filter((call) => call[0] === 'moveTo')).toHaveLength(2);

    expect(syncGmObserverWallHighlights({ active: true, enabled: false })).toBeNull();
    expect(canvas.walls.children).toHaveLength(0);
    expect(graphic.destroyed).toBe(true);
  });

  it('uses Core category and door-state colors before a wall display initializes', () => {
    const previousConst = globalThis.CONST;
    globalThis.CONST = { WALL_DOOR_STATES: { CLOSED: 0, OPEN: 1, LOCKED: 2 } };
    canvas.walls.placeables = [
      {
        document: {
          c: [1, 2, 3, 4],
          ds: 1,
          getWallCategory: () => 'door',
          constructor: { CATEGORY_COLORS: { door: '#ff9900' } },
        },
        _getWallColor: () => undefined,
      },
    ];

    const graphic = syncGmObserverWallHighlights({ active: true, enabled: true });
    expect(graphic.calls).toContainEqual(['lineStyle', 3, 0x66cc66, 0.95]);
    globalThis.CONST = previousConst;
  });

  it('skips invalid wall geometry and clears when scene changes', () => {
    canvas.walls.placeables.push(wall([0, 1, null, 3], '#ffffbb'));
    const first = syncGmObserverWallHighlights({ active: true, enabled: true });
    expect(first.calls.filter((call) => call[0] === 'moveTo')).toHaveLength(4);

    globalThis.canvas = makeCanvas([]);
    const second = syncGmObserverWallHighlights({ active: true, enabled: true });
    expect(first.destroyed).toBe(true);
    expect(second).not.toBe(first);
    expect(canvas.walls.children).toEqual([second]);

    syncGmObserverWallHighlights({ active: false, enabled: true });
    expect(canvas.walls.children).toHaveLength(0);
  });
});
