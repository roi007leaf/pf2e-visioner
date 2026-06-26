import { jest } from '@jest/globals';

const CAN_DETECT_PATH = '../../../scripts/services/Detection/detection-can-detect.js';

async function loadWrapper({
  hasActivePendingTokenMovement,
  visibility,
  coreResult,
  threshold = 'hidden',
  reachesThreshold = false,
}) {
  let wrapper;
  await jest.isolateModulesAsync(async () => {
    jest.doMock('../../../scripts/services/gm-vision-bypass.js', () => ({
      shouldBypassAvsForGmVision: jest.fn(() => false),
    }));
    jest.doMock('../../../scripts/services/Detection/select-all-token-visibility-bypass.js', () => ({
      isSelectAllTokenVisibilityBypassActive: jest.fn(() => false),
    }));
    jest.doMock('../../../scripts/services/ExplicitVisibilityPairs.js', () => ({
      isExplicitVisiblePair: jest.fn(() => false),
    }));
    jest.doMock('../../../scripts/services/movement-tracking.js', () => ({
      hasActivePendingTokenMovement: jest.fn(() => hasActivePendingTokenMovement),
    }));
    jest.doMock('../../../scripts/services/Detection/detection-visibility-context.js', () => ({
      getVisionerVisibilityBetweenTokens: jest.fn(() => visibility),
      NON_VISUAL_DETECTION_MODE_IDS: new Set(['hearing', 'tremorsense']),
      reachesVisibilityThreshold: jest.fn(() => reachesThreshold),
      VISIBILITY_DETECTION_THRESHOLDS: { hidden: 'hidden', undetected: 'undetected' },
      detectionFrameCache: { getPerceptionProfile: () => null },
    }));
    jest.doMock('../../../scripts/stores/visibility-map.js', () => ({
      AVS_EXPLICIT_VISIBLE_DETECTION_SENSE: 'avs-explicit',
    }));
    jest.doMock('../../../scripts/constants.js', () => ({
      MODULE_ID: 'pf2e-visioner',
    }));

    const mod = await import(CAN_DETECT_PATH);
    wrapper = mod.createCanDetectVisibilityWrapper(threshold);
  });
  return wrapper;
}

function callWrapper(wrapper, modeId, coreResult, target = {}) {
  const wrapped = jest.fn(() => coreResult);
  const visionSource = { object: { document: { id: 'observer', getFlag: jest.fn() } } };
  const result = wrapper.call({ id: modeId }, wrapped, visionSource, target);
  return { result, wrapped };
}

function npcTarget() {
  return { actor: { type: 'npc' }, document: { id: 'target' } };
}

function lootTarget() {
  return { actor: { type: 'loot' }, document: { id: 'target' } };
}

function overrideHiddenTarget() {
  return {
    actor: { type: 'npc' },
    document: {
      id: 'target',
      getFlag: (_mod, key) => (key === 'avs-override-from-observer' ? { state: 'hidden' } : null),
    },
  };
}

describe('move-aware _canDetect (createCanDetectVisibilityWrapper)', () => {
  afterEach(() => {
    jest.resetModules();
  });

  describe('during an active pending token movement', () => {
    test("undetected + hearing + core true -> false (hidden completely)", async () => {
      const wrapper = await loadWrapper({
        hasActivePendingTokenMovement: true,
        visibility: 'undetected',
        threshold: 'hidden',
      });
      const { result } = callWrapper(wrapper, 'hearing', true, npcTarget());
      expect(result).toBe(false);
    });

    test("unnoticed + basicSight + core true -> false", async () => {
      const wrapper = await loadWrapper({
        hasActivePendingTokenMovement: true,
        visibility: 'unnoticed',
        threshold: 'hidden',
      });
      const { result } = callWrapper(wrapper, 'basicSight', true, npcTarget());
      expect(result).toBe(false);
    });

    test("hidden npc (AVS-computed, no override) + basicSight + core true -> true (reveals when sight LOS opens mid-move)", async () => {
      const wrapper = await loadWrapper({
        hasActivePendingTokenMovement: true,
        visibility: 'hidden',
        threshold: 'hidden',
      });
      const { result } = callWrapper(wrapper, 'basicSight', true, npcTarget());
      expect(result).toBe(true);
    });

    test("hidden npc (AVS-computed) + basicSight + core false -> false (no LOS yet, stays sensed)", async () => {
      const wrapper = await loadWrapper({
        hasActivePendingTokenMovement: true,
        visibility: 'hidden',
        threshold: 'hidden',
      });
      const { result } = callWrapper(wrapper, 'basicSight', false, npcTarget());
      expect(result).toBe(false);
    });

    test("hidden npc WITH sticky hidden override + basicSight + core true -> false (deliberately hidden stays sensed-only)", async () => {
      const wrapper = await loadWrapper({
        hasActivePendingTokenMovement: true,
        visibility: 'hidden',
        threshold: 'hidden',
      });
      const { result } = callWrapper(wrapper, 'basicSight', true, overrideHiddenTarget());
      expect(result).toBe(false);
    });

    test("hidden npc WITH sticky hidden override + hearing + core true -> true (soundwave stays through the move)", async () => {
      const wrapper = await loadWrapper({
        hasActivePendingTokenMovement: true,
        visibility: 'hidden',
        threshold: 'undetected',
      });
      const { result } = callWrapper(wrapper, 'hearing', true, overrideHiddenTarget());
      expect(result).toBe(true);
    });

    test("hidden npc + non-visual mode hearing + core true -> true (core drives soundwave)", async () => {
      const wrapper = await loadWrapper({
        hasActivePendingTokenMovement: true,
        visibility: 'hidden',
        threshold: 'undetected',
      });
      const { result } = callWrapper(wrapper, 'hearing', true, npcTarget());
      expect(result).toBe(true);
    });

    test("hidden npc + non-visual mode hearing + core false -> false", async () => {
      const wrapper = await loadWrapper({
        hasActivePendingTokenMovement: true,
        visibility: 'hidden',
        threshold: 'undetected',
      });
      const { result } = callWrapper(wrapper, 'hearing', false, npcTarget());
      expect(result).toBe(false);
    });

    test("hidden loot + hearing + core true -> false (loot treated as undetected)", async () => {
      const wrapper = await loadWrapper({
        hasActivePendingTokenMovement: true,
        visibility: 'hidden',
        threshold: 'undetected',
      });
      const { result } = callWrapper(wrapper, 'hearing', true, lootTarget());
      expect(result).toBe(false);
    });

    test("observed defers to core: core true -> true, core false -> false", async () => {
      const wrapperTrue = await loadWrapper({
        hasActivePendingTokenMovement: true,
        visibility: 'observed',
        threshold: 'hidden',
      });
      expect(callWrapper(wrapperTrue, 'basicSight', true, npcTarget()).result).toBe(true);

      const wrapperFalse = await loadWrapper({
        hasActivePendingTokenMovement: true,
        visibility: 'observed',
        threshold: 'hidden',
      });
      expect(callWrapper(wrapperFalse, 'basicSight', false, npcTarget()).result).toBe(false);
    });

    test("concealed + core true -> true (defers to core)", async () => {
      const wrapper = await loadWrapper({
        hasActivePendingTokenMovement: true,
        visibility: 'concealed',
        threshold: 'hidden',
      });
      const { result } = callWrapper(wrapper, 'basicSight', true, npcTarget());
      expect(result).toBe(true);
    });
  });

  describe('with no active pending token movement', () => {
    test("stationary path runs: hidden + undetected threshold + hearing -> true (visioner hidden detection)", async () => {
      const wrapper = await loadWrapper({
        hasActivePendingTokenMovement: false,
        visibility: 'hidden',
        threshold: 'undetected',
      });
      const { result } = callWrapper(wrapper, 'hearing', true, npcTarget());
      expect(result).toBe(true);
    });
  });
});
