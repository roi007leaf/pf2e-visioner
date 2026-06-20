import '../../../setup.js';
import { PeekGmOverlay } from '../../../../scripts/services/Peek/peek-gm-overlay.js';

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
});
