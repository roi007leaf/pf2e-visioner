import { jest } from '@jest/globals';

const MODE_VISIBILITY_PATH = '../../../scripts/services/Detection/detection-mode-visibility.js';
const CACHE_PATH = '../../../scripts/services/Detection/during-move-hearing-cache.js';

async function loadTestDetectionModeVisibility({ hasActivePendingTokenMovement, visibility }) {
  const movement = { active: hasActivePendingTokenMovement };
  let testDetectionModeVisibility;
  let cache;
  await jest.isolateModulesAsync(async () => {
    jest.doMock('../../../scripts/services/gm-vision-bypass.js', () => ({
      shouldBypassAvsForGmVision: jest.fn(() => false),
    }));
    jest.doMock(
      '../../../scripts/services/Detection/select-all-token-visibility-bypass.js',
      () => ({
        isSelectAllTokenVisibilityBypassActive: jest.fn(() => false),
      }),
    );
    jest.doMock('../../../scripts/services/movement-tracking.js', () => ({
      hasActivePendingTokenMovement: jest.fn(() => movement.active),
    }));
    jest.doMock('../../../scripts/services/Detection/detection-visibility-context.js', () => ({
      getVisionerVisibilityBetweenTokens: jest.fn(() => visibility),
      isAvsActiveGivenCombatGate: jest.fn(() => true),
      NON_VISUAL_DETECTION_MODE_IDS: new Set(['hearing', 'feelTremor']),
    }));
    jest.doMock('../../../scripts/constants.js', () => ({
      MODULE_ID: 'pf2e-visioner',
    }));
    cache = await import(CACHE_PATH);
    const mod = await import(MODE_VISIBILITY_PATH);
    testDetectionModeVisibility = mod.testDetectionModeVisibility;
  });
  return { testDetectionModeVisibility, cache, movement };
}

function makeTarget() {
  return {
    actor: { type: 'npc' },
    center: { x: 50, y: 50 },
    document: { id: 'target', getFlag: jest.fn(() => null) },
  };
}

function makeMode(modeId, pointResult) {
  return {
    id: modeId,
    _canDetect: jest.fn(() => true),
    _testPoint: jest.fn(() => pointResult),
  };
}

function callMode(testDetectionModeVisibility, detectionMode) {
  const observer = { document: { id: 'observer' } };
  return testDetectionModeVisibility.call(
    detectionMode,
    { object: observer },
    { id: detectionMode.id, enabled: true },
    { object: makeTarget(), tests: [{ point: { x: 0, y: 0 } }, { point: { x: 50, y: 50 } }] },
  );
}

describe('detection-mode hearing point tests during an active token movement', () => {
  let nowSpy;

  beforeEach(() => {
    nowSpy = jest.spyOn(globalThis.performance, 'now').mockReturnValue(1000);
  });

  afterEach(() => {
    nowSpy.mockRestore();
    jest.resetModules();
  });

  test.each([['observed'], ['concealed']])(
    'hearing + %s mid-move: first call raycasts only the center-most point, immediate repeat reuses the answer',
    async (visibility) => {
      const { testDetectionModeVisibility } = await loadTestDetectionModeVisibility({
        hasActivePendingTokenMovement: true,
        visibility,
      });
      const first = makeMode('hearing', false);
      expect(callMode(testDetectionModeVisibility, first)).toBe(false);
      expect(first._testPoint).toHaveBeenCalledTimes(1);
      expect(first._testPoint.mock.calls[0][3]).toEqual({ point: { x: 50, y: 50 } });

      const second = makeMode('hearing', true);
      expect(callMode(testDetectionModeVisibility, second)).toBe(false);
      expect(second._testPoint).not.toHaveBeenCalled();
    },
  );

  test('hearing + observed mid-move: cached answer expires within one recheck interval (staggered per pair)', async () => {
    const { testDetectionModeVisibility, cache } = await loadTestDetectionModeVisibility({
      hasActivePendingTokenMovement: true,
      visibility: 'observed',
    });
    expect(callMode(testDetectionModeVisibility, makeMode('hearing', false))).toBe(false);

    nowSpy.mockReturnValue(1000 + cache.HEARING_RECHECK_INTERVAL_MS);
    const later = makeMode('hearing', true);
    expect(callMode(testDetectionModeVisibility, later)).toBe(true);
    expect(later._testPoint).toHaveBeenCalled();

    nowSpy.mockReturnValue(1000 + cache.HEARING_RECHECK_INTERVAL_MS + 1);
    const soonAfter = makeMode('hearing', false);
    expect(callMode(testDetectionModeVisibility, soonAfter)).toBe(true);
    expect(soonAfter._testPoint).not.toHaveBeenCalled();
  });

  test('centerMostTest picks the test point nearest the target center', async () => {
    const { cache } = await loadTestDetectionModeVisibility({
      hasActivePendingTokenMovement: true,
      visibility: 'observed',
    });
    const tests = [{ point: { x: 0, y: 0 } }, { point: { x: 48, y: 52 } }, { point: { x: 100, y: 100 } }];
    expect(cache.centerMostTest(tests, { center: { x: 50, y: 50 } })).toEqual([tests[1]]);
    expect(cache.centerMostTest(tests, {})).toEqual([tests[0]]);
    expect(cache.centerMostTest([tests[0]], { center: { x: 50, y: 50 } })).toEqual([tests[0]]);
  });

  test('hearing + observed while stationary: every call runs Foundry point tests', async () => {
    const { testDetectionModeVisibility } = await loadTestDetectionModeVisibility({
      hasActivePendingTokenMovement: false,
      visibility: 'observed',
    });
    expect(callMode(testDetectionModeVisibility, makeMode('hearing', false))).toBe(false);
    const second = makeMode('hearing', true);
    expect(callMode(testDetectionModeVisibility, second)).toBe(true);
    expect(second._testPoint).toHaveBeenCalled();
  });

  test('stationary call clears a stale mid-move answer so the next move re-tests', async () => {
    const { testDetectionModeVisibility, movement } = await loadTestDetectionModeVisibility({
      hasActivePendingTokenMovement: true,
      visibility: 'observed',
    });
    expect(callMode(testDetectionModeVisibility, makeMode('hearing', false))).toBe(false);

    movement.active = false;
    expect(callMode(testDetectionModeVisibility, makeMode('hearing', true))).toBe(true);

    movement.active = true;
    const nextMove = makeMode('hearing', true);
    expect(callMode(testDetectionModeVisibility, nextMove)).toBe(true);
    expect(nextMove._testPoint).toHaveBeenCalled();
  });

  test('feelTremor + observed mid-move: never cached (no wall raycast in tremor)', async () => {
    const { testDetectionModeVisibility } = await loadTestDetectionModeVisibility({
      hasActivePendingTokenMovement: true,
      visibility: 'observed',
    });
    expect(callMode(testDetectionModeVisibility, makeMode('feelTremor', false))).toBe(false);
    const second = makeMode('feelTremor', true);
    expect(callMode(testDetectionModeVisibility, second)).toBe(true);
    expect(second._testPoint).toHaveBeenCalled();
  });

  test('hearing + hidden mid-move: forced detected, no point tests, nothing cached', async () => {
    const { testDetectionModeVisibility } = await loadTestDetectionModeVisibility({
      hasActivePendingTokenMovement: true,
      visibility: 'hidden',
    });
    const mode = makeMode('hearing', false);
    expect(callMode(testDetectionModeVisibility, mode)).toBe(true);
    expect(mode._testPoint).not.toHaveBeenCalled();
  });
});
