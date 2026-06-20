import '../../setup.js';

import { SensePrecomputer } from '../../../scripts/services/SensePrecomputer.js';
import { VisionAnalyzer } from '../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';

function createHearingToken(id) {
  return {
    id,
    actor: {
      hasCondition: jest.fn(() => false),
      system: {
        perception: {
          senses: [],
        },
      },
    },
    document: {
      id,
      detectionModes: [],
    },
  };
}

describe('SensePrecomputer', () => {
  let previousCanvas;

  beforeEach(() => {
    previousCanvas = global.canvas;
    SensePrecomputer.clear();
  });

  afterEach(() => {
    SensePrecomputer.clear();
    global.canvas = previousCanvas;
  });

  test('does not reuse precomputed senses across active scene hearing range changes', () => {
    global.canvas = {
      ...previousCanvas,
      scene: {
        id: 'active-scene',
        grid: { distance: 5 },
        flags: { pf2e: { hearingRange: 20 } },
      },
    };
    const visionAnalyzer = new VisionAnalyzer();
    const token = createHearingToken('observer');

    const first = SensePrecomputer.precompute([token], visionAnalyzer).get('observer');
    global.canvas.scene.flags.pf2e.hearingRange = 40;
    const second = SensePrecomputer.precompute([token], visionAnalyzer).get('observer');

    expect(first.sensingSummary.hearing).toEqual({ acuity: 'imprecise', range: 20 });
    expect(second.sensingSummary.hearing).toEqual({ acuity: 'imprecise', range: 40 });
  });
});
