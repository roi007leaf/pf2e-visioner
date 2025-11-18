import '../../setup.js';

import {
  addTokenBorder,
  removeTokenBorder,
} from '../../../scripts/managers/token-manager/borders.js';

describe('Token Border Management', () => {
  let mockToken;
  let mockGraphics;
  let mockCanvasTokens;

  beforeEach(() => {
    mockGraphics = {
      clear: jest.fn(),
      lineStyle: jest.fn(),
      drawRoundedRect: jest.fn(),
      x: 0,
      y: 0,
      parent: null,
      destroy: jest.fn(),
    };

    global.PIXI = {
      Graphics: jest.fn(() => mockGraphics),
    };

    mockCanvasTokens = {
      children: [],
      addChild: jest.fn((child) => {
        mockCanvasTokens.children.push(child);
        child.parent = mockCanvasTokens;
      }),
      removeChild: jest.fn((child) => {
        const index = mockCanvasTokens.children.indexOf(child);
        if (index > -1) {
          mockCanvasTokens.children.splice(index, 1);
        }
        child.parent = null;
      }),
    };

    global.canvas = {
      grid: { size: 50 },
      tokens: mockCanvasTokens,
    };

    mockToken = {
      id: 'test-token-1',
      document: {
        id: 'test-token-1',
        x: 100,
        y: 100,
        width: 1,
        height: 1,
      },
    };
  });

  afterEach(() => {
    delete mockToken._highlightBorder;
    jest.clearAllMocks();
  });

  describe('addTokenBorder', () => {
    test('creates Graphics object on first call', () => {
      addTokenBorder(mockToken, false);

      expect(global.PIXI.Graphics).toHaveBeenCalledTimes(1);
      expect(mockCanvasTokens.addChild).toHaveBeenCalledTimes(1);
      expect(mockCanvasTokens.addChild).toHaveBeenCalledWith(mockGraphics);
      expect(mockToken._highlightBorder).toBe(mockGraphics);
    });

    test('reuses Graphics object on subsequent calls', () => {
      addTokenBorder(mockToken, false);
      const firstBorder = mockToken._highlightBorder;

      jest.clearAllMocks();
      global.PIXI.Graphics.mockClear();

      addTokenBorder(mockToken, true);

      expect(global.PIXI.Graphics).not.toHaveBeenCalled();
      expect(mockCanvasTokens.addChild).not.toHaveBeenCalled();
      expect(mockToken._highlightBorder).toBe(firstBorder);
      expect(mockGraphics.clear).toHaveBeenCalledTimes(1);
    });

    test('does not increase children count on repeated calls', () => {
      const initialChildCount = mockCanvasTokens.children.length;

      addTokenBorder(mockToken, false);
      const countAfterFirst = mockCanvasTokens.children.length;
      expect(countAfterFirst).toBe(initialChildCount + 1);

      addTokenBorder(mockToken, true);
      const countAfterSecond = mockCanvasTokens.children.length;
      expect(countAfterSecond).toBe(countAfterFirst);

      addTokenBorder(mockToken, false);
      const countAfterThird = mockCanvasTokens.children.length;
      expect(countAfterThird).toBe(countAfterFirst);
    });

    test('calls clear before redrawing on reuse', () => {
      addTokenBorder(mockToken, false);
      jest.clearAllMocks();

      addTokenBorder(mockToken, true);

      expect(mockGraphics.clear).toHaveBeenCalledTimes(1);
      expect(mockGraphics.lineStyle).toHaveBeenCalled();
      expect(mockGraphics.drawRoundedRect).toHaveBeenCalled();
    });

    test('updates position and style correctly', () => {
      addTokenBorder(mockToken, false);

      expect(mockGraphics.lineStyle).toHaveBeenCalledWith(2, 0xffa500, 0.7);
      expect(mockGraphics.drawRoundedRect).toHaveBeenCalledWith(-29, -29, 58, 58, 8);
      expect(mockGraphics.x).toBe(125);
      expect(mockGraphics.y).toBe(125);
    });

    test('uses strong border style when strong=true', () => {
      addTokenBorder(mockToken, true);

      expect(mockGraphics.lineStyle).toHaveBeenCalledWith(3, 0xffd700, 0.9);
    });

    test('handles null token gracefully', () => {
      expect(() => addTokenBorder(null, false)).not.toThrow();
      expect(global.PIXI.Graphics).not.toHaveBeenCalled();
    });
  });

  describe('removeTokenBorder', () => {
    test('removes and destroys Graphics object', () => {
      addTokenBorder(mockToken, false);
      const border = mockToken._highlightBorder;
      mockCanvasTokens.children = [border];

      removeTokenBorder(mockToken);

      expect(mockCanvasTokens.removeChild).toHaveBeenCalledWith(border);
      expect(border.destroy).toHaveBeenCalled();
      expect(mockToken._highlightBorder).toBeUndefined();
    });

    test('handles missing border gracefully', () => {
      expect(() => removeTokenBorder(mockToken)).not.toThrow();
    });

    test('handles null token gracefully', () => {
      expect(() => removeTokenBorder(null)).not.toThrow();
    });

    test('handles border without parent gracefully', () => {
      addTokenBorder(mockToken, false);
      const border = mockToken._highlightBorder;
      border.parent = null;

      expect(() => removeTokenBorder(mockToken)).not.toThrow();
      expect(border.destroy).toHaveBeenCalled();
    });
  });

  describe('Border reuse performance', () => {
    test('reuses Graphics across many add/remove cycles', () => {
      const graphicsCreated = [];

      global.PIXI.Graphics = jest.fn(() => {
        const g = {
          clear: jest.fn(),
          lineStyle: jest.fn(),
          drawRoundedRect: jest.fn(),
          x: 0,
          y: 0,
          parent: null,
          destroy: jest.fn(),
        };
        graphicsCreated.push(g);
        return g;
      });

      for (let i = 0; i < 10; i++) {
        addTokenBorder(mockToken, i % 2 === 0);
      }

      expect(graphicsCreated.length).toBe(1);
      expect(mockCanvasTokens.children.length).toBe(1);
    });

    test('creates new Graphics after remove then add', () => {
      const graphicsInstances = [];
      global.PIXI.Graphics = jest.fn(() => {
        const g = {
          clear: jest.fn(),
          lineStyle: jest.fn(),
          drawRoundedRect: jest.fn(),
          x: 0,
          y: 0,
          parent: null,
          destroy: jest.fn(),
        };
        graphicsInstances.push(g);
        return g;
      });

      addTokenBorder(mockToken, false);
      const firstBorder = mockToken._highlightBorder;
      removeTokenBorder(mockToken);

      jest.clearAllMocks();
      global.PIXI.Graphics.mockClear();

      addTokenBorder(mockToken, false);

      expect(global.PIXI.Graphics).toHaveBeenCalledTimes(1);
      expect(mockToken._highlightBorder).not.toBe(firstBorder);
      expect(graphicsInstances.length).toBe(2);
    });
  });
});
