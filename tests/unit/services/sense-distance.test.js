import '../../setup.js';

import {
  createDefaultHearingSense,
  effectiveHearingRange,
  hearingSenseForVisibility,
  observerCanHearTarget,
} from '../../../scripts/services/sense-distance.js';

describe('sense distance', () => {
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

  test('caps default hearing by active scene hearing range', () => {
    const hearing = createDefaultHearingSense(
      { isDeafened: false },
      { precise: [], imprecise: [] },
    );

    expect(hearing).toEqual({ acuity: 'imprecise', range: 10 });
    expect(effectiveHearingRange(null)).toBe(10);
  });

  test('does not add default hearing when hearing already exists or observer is deafened', () => {
    expect(
      createDefaultHearingSense(
        { isDeafened: false },
        { imprecise: [{ type: 'hearing', range: 30 }] },
      ),
    ).toBeNull();
    expect(createDefaultHearingSense({ isDeafened: true }, {})).toBeNull();
  });

  test('filters visibility hearing by real hearing distance and scene cap', () => {
    const capabilities = {
      isDeafened: false,
      sensingSummary: {
        precise: [],
        imprecise: [],
        hearing: { acuity: 'imprecise', range: Infinity },
      },
    };

    expect(hearingSenseForVisibility(capabilities, 10)).toEqual({ range: 10 });
    expect(hearingSenseForVisibility(capabilities, 15)).toBeNull();
  });

  test('checks pending movement hearing with explicit actor range and scene cap', () => {
    const observer = createMockToken({ id: 'observer', x: 0, y: 0 });
    observer.actor = {
      hasCondition: jest.fn(() => false),
      system: { perception: { senses: [{ type: 'hearing', range: 60 }] } },
    };
    const nearTarget = createMockToken({ id: 'near-target', x: 2, y: 0 });
    const farTarget = createMockToken({ id: 'far-target', x: 3, y: 0 });

    expect(observerCanHearTarget(observer, nearTarget)).toBe(true);
    expect(observerCanHearTarget(observer, farTarget)).toBe(false);
  });
});
