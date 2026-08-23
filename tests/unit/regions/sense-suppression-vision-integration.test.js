import {
  applySenseSuppressionToPreparedTokenDocument,
  createSenseSuppressionDetectionModesWrapper,
} from '../../../scripts/regions/sense-suppression-vision-integration.js';

function createTokenDocument(senseTypes) {
  const prototype = {
    get hasDarkvision() {
      return this.actor.hasDarkvision;
    },
    get hasLowLightVision() {
      return this.actor.hasLowLightVision;
    },
  };
  const document = Object.create(prototype);
  const hasDarkvision = senseTypes.some((sense) =>
    ['darkvision', 'greater-darkvision'].includes(sense),
  );
  const hasLowLightVision = hasDarkvision || senseTypes.includes('low-light-vision');

  Object.assign(document, {
    actor: {
      hasDarkvision,
      hasLowLightVision,
      perception: {
        senses: new Map(senseTypes.map((sense) => [sense, { type: sense }])),
      },
    },
    sight: {
      visionMode: hasDarkvision ? 'darkvision' : 'basic',
      range: hasDarkvision ? Infinity : 0,
      brightness: 0,
      saturation: hasDarkvision ? -1 : 0,
    },
    detectionModes: {
      basicSight: {
        enabled: true,
        range: hasDarkvision ? Infinity : 0,
      },
    },
  });

  return document;
}

describe('sense suppression core vision integration', () => {
  beforeEach(() => {
    global.CONFIG = {
      Canvas: {
        visionModes: {
          basic: {
            vision: {
              defaults: { brightness: 0, saturation: 0 },
            },
          },
        },
      },
    };
  });

  test('darkvision suppression downgrades PF2e prepared core vision', () => {
    const document = createTokenDocument(['darkvision']);

    applySenseSuppressionToPreparedTokenDocument(document, new Set(['darkvision']));

    expect(document.sight.visionMode).toBe('basic');
    expect(document.sight.range).toBe(0);
    expect(document.sight.saturation).toBe(0);
    expect(document.detectionModes.basicSight.range).toBe(0);
    expect(document.hasDarkvision).toBe(false);
    expect(document.hasLowLightVision).toBe(false);
  });

  test('darkvision suppression keeps an explicit unsuppressed low-light sense', () => {
    const document = createTokenDocument(['darkvision', 'low-light-vision']);

    applySenseSuppressionToPreparedTokenDocument(document, new Set(['darkvision']));

    expect(document.sight.visionMode).toBe('basic');
    expect(document.hasDarkvision).toBe(false);
    expect(document.hasLowLightVision).toBe(true);
  });

  test('darkvision suppression does not suppress greater darkvision', () => {
    const document = createTokenDocument(['greater-darkvision']);

    applySenseSuppressionToPreparedTokenDocument(document, new Set(['darkvision']));

    expect(document.sight.visionMode).toBe('darkvision');
    expect(document.hasDarkvision).toBe(true);
    expect(document.hasLowLightVision).toBe(true);
  });

  test('greater darkvision suppression downgrades a greater-darkvision-only actor', () => {
    const document = createTokenDocument(['greater-darkvision']);

    applySenseSuppressionToPreparedTokenDocument(document, new Set(['greater-darkvision']));

    expect(document.sight.visionMode).toBe('basic');
    expect(document.detectionModes.basicSight.range).toBe(0);
    expect(document.hasDarkvision).toBe(false);
    expect(document.hasLowLightVision).toBe(false);
  });

  test('low-light suppression updates PF2e canvas capability without disabling basic sight', () => {
    const document = createTokenDocument(['low-light-vision']);

    applySenseSuppressionToPreparedTokenDocument(document, new Set(['low-light-vision']));

    expect(document.sight.visionMode).toBe('basic');
    expect(document.hasDarkvision).toBe(false);
    expect(document.hasLowLightVision).toBe(false);
    expect(document.detectionModes.basicSight.enabled).toBe(true);
  });

  test('clears transient getter overrides when suppression no longer applies', () => {
    const document = createTokenDocument(['darkvision']);
    applySenseSuppressionToPreparedTokenDocument(document, new Set(['darkvision']));
    expect(document.hasDarkvision).toBe(false);

    document.sight.visionMode = 'darkvision';
    document.sight.range = Infinity;
    document.detectionModes.basicSight.range = Infinity;
    applySenseSuppressionToPreparedTokenDocument(document, new Set());

    expect(document.hasDarkvision).toBe(true);
    expect(document.hasLowLightVision).toBe(true);
    expect(Object.hasOwn(document, 'hasDarkvision')).toBe(false);
    expect(Object.hasOwn(document, 'hasLowLightVision')).toBe(false);
  });

  test('wrapper restores native getters before PF2e prepares the next vision state', () => {
    const document = createTokenDocument(['darkvision']);
    Object.assign(document, { x: 0, y: 0, width: 1, height: 1, elevation: 0 });
    const suppressionBehavior = {
      getSuppressedSensesForObserver: jest
        .fn()
        .mockReturnValueOnce(new Set(['darkvision']))
        .mockReturnValueOnce(new Set()),
    };
    const wrapper = createSenseSuppressionDetectionModesWrapper(suppressionBehavior);
    const wrapped = jest.fn(function prepareNativeVision() {
      expect(this.hasDarkvision).toBe(true);
      this.sight.visionMode = 'darkvision';
      this.sight.range = Infinity;
      this.detectionModes.basicSight.range = Infinity;
    });

    wrapper.call(document, wrapped);
    expect(document.hasDarkvision).toBe(false);
    wrapper.call(document, wrapped);

    expect(document.hasDarkvision).toBe(true);
    expect(document.sight.visionMode).toBe('darkvision');
    expect(suppressionBehavior.getSuppressedSensesForObserver).toHaveBeenCalledWith({
      x: 25,
      y: 25,
      elevation: 0,
    });
  });

  test('uses updated document coordinates instead of a stale rendered center', () => {
    const document = createTokenDocument(['darkvision']);
    Object.assign(document, {
      x: 100,
      y: 200,
      width: 2,
      height: 1,
      elevation: 10,
      object: { center: { x: 25, y: 25, elevation: 0 } },
    });
    const suppressionBehavior = {
      getSuppressedSensesForObserver: jest.fn(() => new Set()),
    };
    const wrapper = createSenseSuppressionDetectionModesWrapper(suppressionBehavior);

    wrapper.call(document, jest.fn());

    expect(suppressionBehavior.getSuppressedSensesForObserver).toHaveBeenCalledWith({
      x: 150,
      y: 225,
      elevation: 10,
    });
  });
});
