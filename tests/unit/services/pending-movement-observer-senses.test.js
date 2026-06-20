import '../../setup.js';

import {
  observerCanHearTarget,
  observerHasUsableSight,
} from '../../../scripts/services/PendingMovement/pending-movement-observer-senses.js';

describe('pending movement observer senses', () => {
  let previousCanvas;

  beforeEach(() => {
    previousCanvas = global.canvas;
    global.canvas = {
      ...previousCanvas,
      grid: { size: 50 },
      scene: {
        ...(previousCanvas?.scene || {}),
        id: 'active-scene',
        grid: { distance: 5 },
        flags: { pf2e: { hearingRange: 10 } },
      },
    };
  });

  afterEach(() => {
    global.canvas = previousCanvas;
  });

  test('limits implicit hearing by the active PF2e scene hearing range', () => {
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    observer.actor = {
      hasCondition: jest.fn(() => false),
      system: { perception: { senses: [] } },
    };
    const nearTarget = createMockToken({ id: 'near-target', x: 2, y: 0 });
    const farTarget = createMockToken({ id: 'far-target', x: 3, y: 0 });

    expect(observerCanHearTarget(observer, nearTarget)).toBe(true);
    expect(observerCanHearTarget(observer, farTarget)).toBe(false);
  });

  test('uses PF2e actor vision capabilities when token sight source is inactive', () => {
    global.canvas.effects = {
      ...(global.canvas.effects || {}),
      visionSources: new Map(),
    };
    const observer = createMockToken({
      id: 'observer-no-vision',
      vision: { enabled: true, range: 0, angle: 360 },
    });
    observer.document.sight = { enabled: true, range: 0 };
    observer.actor = createMockActor({
      system: {
        perception: {
          vision: true,
          senses: [],
        },
      },
    });

    expect(observerHasUsableSight(observer)).toBe(true);
  });

  test('does not create usable sight when PF2e actor vision is disabled', () => {
    global.canvas.effects = {
      ...(global.canvas.effects || {}),
      visionSources: new Map(),
    };
    const observer = createMockToken({
      id: 'observer',
      vision: { enabled: true, range: 0, angle: 360 },
    });
    observer.document.sight = { enabled: true, range: 0 };
    observer.actor = createMockActor({
      system: {
        perception: {
          vision: false,
          senses: [],
        },
      },
    });

    expect(observerHasUsableSight(observer)).toBe(false);
  });
});
