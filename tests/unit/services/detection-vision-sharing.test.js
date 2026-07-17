import '../../setup.js';

import { MODULE_ID } from '../../../scripts/constants.js';
import {
  wrapTokenDocumentPrepareBaseData,
  wrapTokenVisionSource,
} from '../../../scripts/services/Detection/detection-vision-sharing.js';
import { detectionFrameCache } from '../../../scripts/services/Detection/detection-visibility-context.js';

describe('detection vision sharing wrappers', () => {
  let originalCanvas;

  beforeEach(() => {
    originalCanvas = global.canvas;
    global.game.user.isGM = true;
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', true);
    global.game.settings.set('pf2e', 'gmVision', true);
    detectionFrameCache.clear();
  });

  afterEach(() => {
    global.game.settings.set('pf2e', 'gmVision', false);
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', false);
    detectionFrameCache.clear();
    global.canvas = originalCanvas;
  });

  test('GM Vision bypass leaves prepareBaseData sight state to core', () => {
    const tokenDocument = createMockToken({
      id: 'minion',
      flags: {
        [MODULE_ID]: {
          visionMasterTokenId: 'master',
          visionSharingMode: 'replace',
        },
      },
    }).document;
    tokenDocument.sight = { enabled: true };
    const wrapped = jest.fn();

    wrapTokenDocumentPrepareBaseData.call(tokenDocument, wrapped);

    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(tokenDocument.sight.enabled).toBe(true);
  });

  test('GM Vision bypass leaves token vision source result to core', () => {
    const master = createMockToken({ id: 'master' });
    const minion = createMockToken({
      id: 'minion',
      flags: {
        [MODULE_ID]: {
          visionMasterTokenId: 'master',
          visionSharingMode: 'replace',
        },
      },
    });
    global.canvas = {
      ...global.canvas,
      tokens: {
        controlled: [],
        placeables: [master, minion],
        get: jest.fn((id) => (id === 'master' ? master : id === 'minion' ? minion : null)),
      },
    };
    const wrapped = jest.fn(() => true);

    expect(wrapTokenVisionSource.call(minion, wrapped)).toBe(true);
    expect(wrapped).toHaveBeenCalledTimes(1);
  });

  test('AVS off + GM Vision on still leaves prepareBaseData sight state to core', () => {
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', false);
    const tokenDocument = createMockToken({
      id: 'minion',
      flags: {
        [MODULE_ID]: {
          visionMasterTokenId: 'master',
          visionSharingMode: 'replace',
        },
      },
    }).document;
    tokenDocument.sight = { enabled: true };
    const wrapped = jest.fn();

    wrapTokenDocumentPrepareBaseData.call(tokenDocument, wrapped);

    expect(tokenDocument.sight.enabled).toBe(true);
  });
});
