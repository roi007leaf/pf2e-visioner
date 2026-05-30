import '../../../setup.js';
import { PeekVisionSourceController } from '../../../../scripts/services/Peek/PeekVisionSourceController.js';

describe('PeekVisionSourceController contract', () => {
  test('apply requests vision re-init and never updates token document', () => {
    const refresh = jest.fn();
    const ctrl = new PeekVisionSourceController({ refreshPerception: refresh });
    const update = jest.fn();
    const token = {
      document: { id: 't', update, x: 0, y: 0, width: 1, height: 1, elevation: 0 },
      initializeVisionSource: jest.fn(),
    };
    ctrl.apply(token, { origin: { x: 10, y: 20 }, direction: 0, fov: 90, ignoredWallIds: [] });
    expect(token.initializeVisionSource).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  test('clear is idempotent and never updates token document', () => {
    const refresh = jest.fn();
    const ctrl = new PeekVisionSourceController({ refreshPerception: refresh });
    const update = jest.fn();
    const token = { document: { id: 't', update }, initializeVisionSource: jest.fn() };
    ctrl.clear(token);
    ctrl.clear(token);
    expect(update).not.toHaveBeenCalled();
  });

  test('apply then repeated clear re-inits exactly twice and never updates token document', () => {
    const refresh = jest.fn();
    const ctrl = new PeekVisionSourceController({ refreshPerception: refresh });
    const update = jest.fn();
    const token = {
      document: { id: 't', update },
      initializeVisionSource: jest.fn(),
    };
    ctrl.apply(token, { origin: { x: 10, y: 20 }, direction: 0, fov: 90, ignoredWallIds: [] });
    ctrl.clear(token);
    ctrl.clear(token);
    expect(token.initializeVisionSource).toHaveBeenCalledTimes(2);
    expect(update).not.toHaveBeenCalled();
  });
});
