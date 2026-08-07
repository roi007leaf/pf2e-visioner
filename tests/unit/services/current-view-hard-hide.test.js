const controlled = [];
let draggedToken = null;

jest.mock('../../../scripts/services/gm-vision-bypass.js', () => ({
  shouldBypassAvsForGmVision: jest.fn(() => false),
}));
jest.mock('../../../scripts/services/Detection/select-all-token-visibility-bypass.js', () => ({
  isSelectAllTokenVisibilityBypassActive: jest.fn(() => false),
}));
jest.mock('../../../scripts/services/Detection/detection-visibility-context.js', () => ({
  getVisionerVisibilityBetweenTokens: () => 'observed',
  isAvsActiveGivenCombatGate: jest.fn(() => true),
}));
jest.mock('../../../scripts/services/Detection/detection-setting-cache.js', () => ({
  getDetectionSetting: jest.fn(() => true),
}));
jest.mock('../../../scripts/services/movement-tracking.js', () => ({
  hasActivePendingTokenMovement: jest.fn(() => false),
}));

import {
  currentViewObservers,
  currentViewVisionerObserversForTarget,
  targetIsHardHiddenFromCurrentView,
  applyCurrentViewHardHide,
  clearCurrentViewMovementRenderSettles,
  releaseCurrentViewHardHide,
  releaseCurrentViewHardHideIfMarked,
  releaseAllCurrentViewHardHide,
  __setStoredVisibilityForTest,
} from '../../../scripts/services/Detection/current-view-hard-hide.js';
import { shouldBypassAvsForGmVision } from '../../../scripts/services/gm-vision-bypass.js';
import { isSelectAllTokenVisibilityBypassActive } from '../../../scripts/services/Detection/select-all-token-visibility-bypass.js';
import { hasActivePendingTokenMovement } from '../../../scripts/services/movement-tracking.js';
import { isAvsActiveGivenCombatGate } from '../../../scripts/services/Detection/detection-visibility-context.js';
import { getDetectionSetting } from '../../../scripts/services/Detection/detection-setting-cache.js';

beforeEach(() => {
  clearCurrentViewMovementRenderSettles();
  controlled.length = 0;
  draggedToken = null;
  const tokens = {};
  Object.defineProperty(tokens, 'controlled', {
    get: () => controlled,
    set: () => {},
    configurable: true,
  });
  Object.defineProperty(tokens, '_draggedToken', {
    get: () => draggedToken,
    set: () => {},
    configurable: true,
  });
  globalThis.canvas = { tokens };
  shouldBypassAvsForGmVision.mockReturnValue(false);
  isSelectAllTokenVisibilityBypassActive.mockReturnValue(false);
  hasActivePendingTokenMovement.mockReturnValue(false);
  isAvsActiveGivenCombatGate.mockReturnValue(true);
  getDetectionSetting.mockReturnValue(true);
});

describe('currentViewObservers', () => {
  it('returns controlled tokens', () => {
    const a = { document: { id: 'a' } };
    controlled.push(a);
    expect(currentViewObservers().map((t) => t.document.id)).toEqual(['a']);
  });

  it('includes the dragged token and dedupes', () => {
    const a = { document: { id: 'a' } };
    draggedToken = a;
    controlled.push(a);
    expect(currentViewObservers().map((t) => t.document.id)).toEqual(['a']);
  });

  it('returns no Visioner observers when scene Token Vision is disabled', () => {
    const a = { document: { id: 'a' } };
    controlled.push(a);
    globalThis.canvas.scene = { tokenVision: false };

    expect(currentViewVisionerObserversForTarget({ document: { id: 'target' } })).toEqual([]);
  });
});

describe('targetIsHardHiddenFromCurrentView', () => {
  const observer = { document: { id: 'obs' }, controlled: true };
  function target(id, actorType = 'character', { hidden = false, invisible = false } = {}) {
    return {
      controlled: false,
      document: { id, hidden },
      actor: {
        type: actorType,
        itemTypes: { condition: invisible ? [{ slug: 'invisible' }] : [] },
      },
    };
  }
  beforeEach(() => {
    controlled.length = 0;
    controlled.push(observer);
    globalThis.game = { user: { isGM: false } };
    __setStoredVisibilityForTest(new Map());
  });

  it('undetected target is hard-hidden', () => {
    const t = target('t');
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(true);
  });
  it('unnoticed target is hard-hidden', () => {
    const t = target('t');
    __setStoredVisibilityForTest(new Map([['obs:t', 'unnoticed']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(true);
  });
  it('invisible + undetected is hard-hidden (covered by undetected branch)', () => {
    const t = target('t', 'character', { invisible: true });
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(true);
  });
  it('hidden NPC is NOT hard-hidden (shows soundwave)', () => {
    const t = target('t', 'npc');
    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(false);
  });
  it('invisible + hidden NPC is NOT hard-hidden (soundwave, not hidden)', () => {
    const t = target('t', 'npc', { invisible: true });
    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(false);
  });
  it('hidden LOOT is hard-hidden (treated as undetected)', () => {
    const t = target('t', 'loot');
    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(true);
  });
  it('hidden HAZARD is hard-hidden', () => {
    const t = target('t', 'hazard');
    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(true);
  });
  it('observed target is NOT hard-hidden', () => {
    const t = target('t');
    __setStoredVisibilityForTest(new Map([['obs:t', 'observed']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(false);
  });
  it('non-GM observer: foundry-hidden token is hard-hidden regardless of state', () => {
    const t = target('t', 'character', { hidden: true });
    __setStoredVisibilityForTest(new Map([['obs:t', 'observed']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(true);
  });
  it('GM observer: foundry-hidden token is NOT force-hidden by this rule', () => {
    globalThis.game = { user: { isGM: true } };
    const t = target('t', 'character', { hidden: true });
    __setStoredVisibilityForTest(new Map([['obs:t', 'observed']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(false);
  });
  it('the target itself when controlled is never hard-hidden', () => {
    const t = target('t');
    t.controlled = true;
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(false);
  });

  it('concealed target is NOT hard-hidden', () => {
    const t = target('t');
    __setStoredVisibilityForTest(new Map([['obs:t', 'concealed']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(false);
  });

  it('hidden character (non-loot/hazard) is NOT hard-hidden', () => {
    const t = target('t', 'character');
    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(false);
  });

  it('empty observer set → not hard-hidden (when not foundry-hidden)', () => {
    controlled.length = 0;
    draggedToken = null;
    const t = target('t');
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(false);
  });

  it('non-GM player deselect (no observers) freezes a previously hard-hidden token', () => {
    controlled.length = 0;
    draggedToken = null;
    const t = target('t');
    t._pvCurrentViewHardHidden = true;
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(true);
  });

  it('non-GM player with no observers does NOT hide a token it never hard-hid', () => {
    controlled.length = 0;
    draggedToken = null;
    const t = target('t');
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(false);
  });

  it('GM deselect (no observers) releases even a previously hard-hidden token', () => {
    globalThis.game = { user: { isGM: true } };
    controlled.length = 0;
    draggedToken = null;
    const t = target('t');
    t._pvCurrentViewHardHidden = true;
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(false);
  });

  it('multiple observers: hidden for ANY observer → hard-hidden', () => {
    const obs1 = { document: { id: 'obs1' }, controlled: true };
    const obs2 = { document: { id: 'obs2' }, controlled: true };
    controlled.length = 0;
    controlled.push(obs1, obs2);
    const t = target('t');
    __setStoredVisibilityForTest(
      new Map([
        ['obs1:t', 'observed'],
        ['obs2:t', 'undetected'],
      ]),
    );
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(true);
  });

  it('GM-vision bypass active → not hard-hidden', () => {
    shouldBypassAvsForGmVision.mockReturnValue(true);
    const t = target('t');
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(false);
  });

  it('GM-vision bypass ignores an explicit undetected pair state', () => {
    shouldBypassAvsForGmVision.mockReturnValue(true);
    const t = target('t');
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(false);
  });

  it('select-all bypass active → not hard-hidden', () => {
    isSelectAllTokenVisibilityBypassActive.mockReturnValue(true);
    const t = target('t');
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(false);
  });

  it('scene Token Vision off bypasses automatic Undetected hard-hide', () => {
    globalThis.canvas.scene = { tokenVision: false };
    const t = target('t');
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));

    expect(targetIsHardHiddenFromCurrentView(t)).toBe(false);
  });

  it('scene Token Vision off bypasses explicit manual Undetected hard-hide', () => {
    globalThis.canvas.scene = { tokenVision: false };
    const t = target('t');
    t.document.getFlag = jest.fn((_module, key) =>
      key === 'avs-override-from-obs' ? { state: 'undetected' } : null,
    );
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));

    expect(targetIsHardHiddenFromCurrentView(t)).toBe(false);
  });

  it('scene Token Vision off leaves Foundry-hidden rendering entirely to Core', () => {
    globalThis.canvas.scene = { tokenVision: false };
    const t = target('t', 'character', { hidden: true });

    expect(targetIsHardHiddenFromCurrentView(t)).toBe(false);
  });
});

describe('hard-hide decision cost (O(1), no LOS/wall work)', () => {
  const observer = { document: { id: 'obs' }, controlled: true };
  function target(id) {
    return {
      controlled: false,
      document: { id, hidden: false },
      actor: { type: 'character', itemTypes: { condition: [] } },
    };
  }
  beforeEach(() => {
    controlled.length = 0;
    controlled.push(observer);
    globalThis.game = { user: { isGM: false } };
  });

  it('reads the stored-visibility getter at most once per observer and runs no LOS testVisibility', () => {
    const backing = new Map([['obs:t', 'undetected']]);
    const getSpy = jest.fn((key) => backing.get(key));
    __setStoredVisibilityForTest({ get: getSpy });

    const testVisibility = jest.fn(() => {
      throw new Error('hard-hide decision must not run LOS testVisibility');
    });
    globalThis.canvas.visibility = { testVisibility };

    const t = target('t');
    expect(targetIsHardHiddenFromCurrentView(t)).toBe(true);

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).toHaveBeenCalledWith('obs:t');
    expect(testVisibility).not.toHaveBeenCalled();
  });

  it('source module imports no wall/LOS helpers', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../scripts/services/Detection/current-view-hard-hide.js'),
      'utf8',
    );
    expect(source).not.toContain('wall-sense-utils');
    expect(source).not.toContain('lineOfSightBlocked');
    expect(source).not.toContain('lineOfSoundBlocked');
    expect(source).not.toContain('testVisibility');
    expect(source).not.toContain('visionSources');
  });
});

describe('applyCurrentViewHardHide', () => {
  beforeEach(() => {
    controlled.length = 0;
    controlled.push({ document: { id: 'obs' }, controlled: true });
    globalThis.game = { user: { isGM: false } };
    __setStoredVisibilityForTest(new Map());
  });

  it('forces token + mesh invisible and clears the detection filter when hard-hidden', () => {
    const t = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      detectionFilter: {},
      document: { id: 't', hidden: false },
      actor: { type: 'loot', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));
    expect(applyCurrentViewHardHide(t)).toBe(true);
    expect(t.visible).toBe(false);
    expect(t.renderable).toBe(false);
    expect(t.mesh.visible).toBe(false);
    expect(t.mesh.renderable).toBe(false);
    expect(t.mesh.alpha).toBe(0);
    expect(t.detectionFilter).toBe(null);
  });

  it('preserves Core renderability while hard-hiding visuals in a multi-level scene', () => {
    globalThis.canvas.scene = {
      levels: { size: 3 },
      getSurfaces: jest.fn(),
      testSurfaceCollision: jest.fn(),
    };
    const hitArea = { contains: () => true };
    const t = {
      controlled: false,
      visible: true,
      renderable: true,
      eventMode: 'static',
      cursor: 'pointer',
      hitArea,
      interactiveChildren: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      detectionFilter: {},
      document: { id: 't', hidden: false },
      actor: { type: 'loot', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));

    expect(applyCurrentViewHardHide(t)).toBe(true);
    expect(t.visible).toBe(true);
    expect(t.renderable).toBe(true);
    expect(t.mesh.visible).toBe(false);
    expect(t.mesh.renderable).toBe(true);
    expect(t.mesh.alpha).toBe(1);
    expect(t.detectionFilter).toBe(null);
    expect(t.eventMode).toBe('none');
    expect(t.cursor).toBe('default');
    expect(t.hitArea).not.toBe(hitArea);
    expect(t.hitArea.contains(0, 0)).toBe(false);
    expect(t.interactiveChildren).toBe(false);
  });

  it('leaves a non-hidden token untouched', () => {
    const t = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: true },
      document: { id: 't', hidden: false },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'observed']]));
    expect(applyCurrentViewHardHide(t)).toBe(false);
    expect(t.visible).toBe(true);
  });

  it('defers to Core outside combat when AVS is combat-only, ignoring stale Undetected state', () => {
    globalThis.game = { user: { isGM: false } };
    isAvsActiveGivenCombatGate.mockReturnValue(false);
    const t = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      document: { id: 't', hidden: false },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));

    expect(applyCurrentViewHardHide(t)).toBe(false);
    expect(t.visible).toBe(true);
    expect(t.renderable).toBe(true);
    expect(t.mesh).toEqual({ visible: true, renderable: true, alpha: 1 });
  });

  it('defers to Core when AVS is off and no manual Undetected override exists', () => {
    globalThis.game = { user: { isGM: false } };
    getDetectionSetting.mockImplementation((key) => key !== 'autoVisibilityEnabled');
    const t = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      document: { id: 't', hidden: false, getFlag: jest.fn(() => null) },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));

    expect(applyCurrentViewHardHide(t)).toBe(false);
    expect(t.visible).toBe(true);
    expect(t.renderable).toBe(true);
    expect(t.mesh).toEqual({ visible: true, renderable: true, alpha: 1 });
  });

  it('defers to Core when AVS is disabled for the scene and no manual override exists', () => {
    globalThis.canvas.scene = {
      getFlag: jest.fn((_module, key) => key === 'disableAVS'),
    };
    const t = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      document: { id: 't', hidden: false, getFlag: jest.fn(() => null) },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));

    expect(applyCurrentViewHardHide(t)).toBe(false);
    expect(t.visible).toBe(true);
    expect(t.mesh.visible).toBe(true);
  });

  it('honors an explicit manual Undetected override while AVS is off', () => {
    getDetectionSetting.mockImplementation((key) => key !== 'autoVisibilityEnabled');
    const getFlag = (_module, key) =>
      key === 'avs-override-from-obs' ? { state: 'undetected', source: 'manual_action' } : null;
    const t = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      document: { id: 't', hidden: false, getFlag },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));

    expect(applyCurrentViewHardHide(t)).toBe(true);
    expect(t.visible).toBe(false);
    expect(t.mesh.visible).toBe(false);
  });

  it('releases a stale automatic hard-hide marker with no observer while AVS is off', () => {
    controlled.length = 0;
    getDetectionSetting.mockImplementation((key) => key !== 'autoVisibilityEnabled');
    const t = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      _pvCurrentViewHardHidden: true,
      document: { id: 't', hidden: false, getFlag: jest.fn(() => null) },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };

    expect(applyCurrentViewHardHide(t)).toBe(false);
    expect(t._pvCurrentViewHardHidden).toBe(false);
    expect(t.visible).toBe(true);
    expect(t.mesh.visible).toBe(true);
  });

  it('does not reveal a Core-invisible token while awaiting stale marker release with AVS off', () => {
    getDetectionSetting.mockImplementation((key) => key !== 'autoVisibilityEnabled');
    const t = {
      controlled: false,
      visible: false,
      renderable: false,
      mesh: { visible: false, renderable: false, alpha: 0 },
      _pvCurrentViewHardHidden: true,
      document: { id: 't', hidden: false, getFlag: jest.fn(() => null) },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));

    expect(applyCurrentViewHardHide(t)).toBe(false);
    expect(t._pvCurrentViewHardHidden).toBe(true);
    expect(t.visible).toBe(false);
    expect(t.renderable).toBe(false);
    expect(t.mesh).toEqual({ visible: false, renderable: false, alpha: 0 });
  });

  it('leaves a core-LOS-hidden observed NPC invisible for players when AVS is off', () => {
    globalThis.game = {
      user: { isGM: false },
      settings: { get: jest.fn((_module, key) => key !== 'autoVisibilityEnabled') },
    };
    const t = {
      controlled: false,
      visible: false,
      renderable: true,
      mesh: { visible: false, renderable: true, alpha: 1 },
      document: { id: 't', hidden: false },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'observed']]));

    expect(applyCurrentViewHardHide(t)).toBe(false);
    expect(t.visible).toBe(false);
    expect(t.mesh.visible).toBe(false);
  });

  it('restores a Foundry-hidden token that core itself left invisible, even with no hard-hide marker set', () => {
    globalThis.game = { user: { isGM: true } };
    const t = {
      controlled: false,
      visible: false,
      renderable: true,
      mesh: { visible: false, renderable: true, alpha: 0.5 },
      document: { id: 't', hidden: true },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'observed']]));
    expect(t._pvCurrentViewHardHidden).toBeUndefined();
    expect(applyCurrentViewHardHide(t)).toBe(false);
    expect(t.visible).toBe(true);
    expect(t.mesh.visible).toBe(true);
    expect(t.mesh.alpha).toBe(0.5);
    expect(t._pvCurrentViewHardHidden).toBe(false);
  });

  it('does not override Core-hidden token visibility in a GM selected-token view', () => {
    globalThis.game = { user: { isGM: true } };
    const t = {
      controlled: false,
      visible: false,
      renderable: true,
      mesh: { visible: false, renderable: true, alpha: 1 },
      document: { id: 't', hidden: false },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'observed']]));
    expect(t._pvCurrentViewHardHidden).toBeUndefined();
    expect(applyCurrentViewHardHide(t)).toBe(false);
    expect(t.visible).toBe(false);
    expect(t.mesh.visible).toBe(false);
    expect(t._pvCurrentViewHardHidden).toBeUndefined();
  });

  it('does not force-restore a plain token merely hidden (heard-not-seen) with no hard-hide marker set - presence-only stays untouched', () => {
    globalThis.game = { user: { isGM: true } };
    const t = {
      controlled: false,
      visible: false,
      renderable: false,
      mesh: { visible: false, renderable: false, alpha: 0 },
      document: { id: 't', hidden: false },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));
    expect(applyCurrentViewHardHide(t)).toBe(false);
    expect(t.visible).toBe(false);
    expect(t.mesh.visible).toBe(false);
  });

  it('hides token chrome surfaces (condition icons, nameplate, bars) when hard-hidden', () => {
    const t = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      detectionFilter: {},
      border: { visible: true },
      effects: { visible: true },
      nameplate: { visible: true },
      bars: { visible: true },
      document: { id: 't', hidden: false },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
    expect(applyCurrentViewHardHide(t)).toBe(true);
    expect(t.border.visible).toBe(false);
    expect(t.effects.visible).toBe(false);
    expect(t.nameplate.visible).toBe(false);
    expect(t.bars.visible).toBe(false);
  });

  it('hides a replacement effects container on every hard-hide refresh', () => {
    const firstEffects = { visible: true };
    const t = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      detectionFilter: {},
      effects: firstEffects,
      document: { id: 't', hidden: false },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
    applyCurrentViewHardHide(t);

    const replacementEffects = { visible: true };
    t.effects = replacementEffects;
    applyCurrentViewHardHide(t);

    expect(firstEffects.visible).toBe(false);
    expect(replacementEffects.visible).toBe(false);
  });

  it('restores chrome surfaces to their captured visibility on release', () => {
    const t = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      detectionFilter: {},
      effects: { visible: true },
      nameplate: { visible: false },
      bars: { visible: true },
      document: { id: 't', hidden: false },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
    applyCurrentViewHardHide(t);
    expect(t.effects.visible).toBe(false);

    releaseCurrentViewHardHide(t);
    expect(t.effects.visible).toBe(true);
    expect(t.nameplate.visible).toBe(false);
    expect(t.bars.visible).toBe(true);
  });

  it('restores the exact interaction mode and cursor on release', () => {
    const hitArea = { contains: () => true };
    const t = {
      controlled: false,
      visible: true,
      renderable: true,
      eventMode: 'static',
      cursor: 'pointer',
      hitArea,
      interactiveChildren: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      detectionFilter: {},
      document: { id: 't', hidden: false },
      actor: { type: 'hazard', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));

    applyCurrentViewHardHide(t);
    expect(t.eventMode).toBe('none');
    expect(t.cursor).toBe('default');

    releaseCurrentViewHardHide(t);
    expect(t.eventMode).toBe('static');
    expect(t.cursor).toBe('pointer');
    expect(t.hitArea).toBe(hitArea);
    expect(t.interactiveChildren).toBe(true);
  });

  it('preserves Core-restored interaction when a token hidden at scene load is first revealed', () => {
    globalThis.game = { user: { isGM: false } };
    const initialHitArea = { id: 'hidden-hit-area' };
    const revealedHitArea = { id: 'revealed-hit-area' };
    const t = {
      controlled: false,
      visible: false,
      renderable: false,
      eventMode: 'none',
      cursor: 'default',
      hitArea: initialHitArea,
      interactiveChildren: false,
      mesh: { visible: false, renderable: false, alpha: 0 },
      document: { id: 't', hidden: true },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
    applyCurrentViewHardHide(t);

    t.document.hidden = false;
    t.visible = true;
    t.renderable = true;
    t.mesh.visible = true;
    t.mesh.renderable = true;
    t.mesh.alpha = 1;
    t.eventMode = 'static';
    t.cursor = 'pointer';
    t.hitArea = revealedHitArea;
    t.interactiveChildren = true;
    __setStoredVisibilityForTest(new Map([['obs:t', 'observed']]));

    expect(applyCurrentViewHardHide(t)).toBe(false);
    expect(t.eventMode).toBe('static');
    expect(t.cursor).toBe('pointer');
    expect(t.hitArea).toBe(revealedHitArea);
    expect(t.interactiveChildren).toBe(true);
  });

  it('marks tokens it hard-hides', () => {
    const t = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      detectionFilter: {},
      document: { id: 't', hidden: false },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
    applyCurrentViewHardHide(t);
    expect(t._pvCurrentViewHardHidden).toBe(true);
  });

  it('releases a token it previously hard-hid once it is no longer hard-hidden (undetected -> hidden)', () => {
    const t = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      detectionFilter: {},
      document: { id: 't', hidden: false },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
    applyCurrentViewHardHide(t);
    expect(t.mesh.visible).toBe(false);
    expect(t.visible).toBe(false);

    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));
    expect(applyCurrentViewHardHide(t)).toBe(false);
    expect(t.visible).toBe(true);
    expect(t.mesh.visible).toBe(true);
    expect(t.renderable).toBe(true);
    expect(t._pvCurrentViewHardHidden).toBe(false);
  });

  it('does not restore a mesh it never hard-hid (presence-only meshes stay hidden)', () => {
    const presenceOnly = {
      controlled: false,
      renderable: false,
      mesh: { visible: false, renderable: false, alpha: 0 },
      document: { id: 'p', hidden: false },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };
    __setStoredVisibilityForTest(new Map([['obs:p', 'hidden']]));
    expect(applyCurrentViewHardHide(presenceOnly)).toBe(false);
    expect(presenceOnly.mesh.visible).toBe(false);
  });
});

describe('applyCurrentViewHardHide - defer to core during movement (undetected -> observed reveal)', () => {
  beforeEach(() => {
    controlled.length = 0;
    controlled.push({ document: { id: 'obs' }, controlled: true });
    globalThis.game = { user: { isGM: false } };
    hasActivePendingTokenMovement.mockReturnValue(true);
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
  });

  function undetectedToken({ visible, getFlag, actorType = 'npc', hidden = false } = {}) {
    return {
      controlled: false,
      visible,
      renderable: false,
      mesh: { visible: false, renderable: false, alpha: 0 },
      detectionFilter: null,
      _pvCurrentViewHardHidden: true,
      document: { id: 't', hidden, getFlag },
      actor: { type: actorType, itemTypes: { condition: [] } },
    };
  }

  it('reveals a non-sticky undetected token when core sees it mid-move (token.visible true)', () => {
    const t = undetectedToken({ visible: true });
    expect(applyCurrentViewHardHide(t)).toBe(false);
    expect(t.renderable).toBe(true);
    expect(t.mesh.visible).toBe(true);
    expect(t.mesh.alpha).toBe(1);
    expect(t._pvCurrentViewHardHidden).toBe(false);
  });

  it('does not trust temporary Core visibility through a legacy Levels floor', () => {
    const savedConfig = globalThis.CONFIG;
    globalThis.game = {
      user: { isGM: false },
      modules: new Map([['levels', { active: true }]]),
    };
    globalThis.CONFIG = {
      ...savedConfig,
      Levels: { API: { checkCollision: jest.fn(() => true) } },
    };
    const observer = {
      controlled: true,
      document: { id: 'obs' },
      losHeight: 5,
      vision: { los: { contains: () => true } },
    };
    controlled.splice(0, 1, observer);
    const t = undetectedToken({ visible: true });
    t.center = { x: 500, y: 500 };
    t.losHeight = 15;

    try {
      expect(applyCurrentViewHardHide(t)).toBe(true);
      expect(t).toMatchObject({
        visible: false,
        renderable: false,
        mesh: { visible: false, renderable: false },
        _pvCurrentViewHardHidden: true,
      });
    } finally {
      globalThis.CONFIG = savedConfig;
    }
  });

  it('still accepts a legitimate same-level Core reveal on a legacy Levels scene', () => {
    const savedConfig = globalThis.CONFIG;
    globalThis.game = {
      user: { isGM: false },
      modules: new Map([['levels', { active: true }]]),
    };
    const checkCollision = jest.fn(() => true);
    globalThis.CONFIG = {
      ...savedConfig,
      Levels: { API: { checkCollision } },
    };
    const observer = {
      controlled: true,
      document: { id: 'obs' },
      losHeight: 5,
      vision: { los: { contains: () => true } },
    };
    controlled.splice(0, 1, observer);
    const t = undetectedToken({ visible: true });
    t.center = { x: 500, y: 500 };
    t.losHeight = 5;

    try {
      expect(applyCurrentViewHardHide(t)).toBe(false);
      expect(t).toMatchObject({
        visible: true,
        renderable: true,
        mesh: { visible: true, renderable: true },
        _pvCurrentViewHardHidden: false,
      });
      expect(checkCollision).not.toHaveBeenCalled();
    } finally {
      globalThis.CONFIG = savedConfig;
    }
  });

  it('keeps a Core-visible reveal through the stale Undetected movement-settle gap', () => {
    const t = undetectedToken({ visible: true });
    expect(applyCurrentViewHardHide(t)).toBe(false);
    expect(t._pvCurrentViewHardHidden).toBe(false);

    hasActivePendingTokenMovement.mockReturnValue(false);
    t.visible = false;
    t.renderable = true;
    t.mesh = { visible: false, renderable: true, alpha: 1 };

    expect(applyCurrentViewHardHide(t)).toBe(false);
    expect(t).toMatchObject({
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      _pvCurrentViewHardHidden: false,
    });
  });

  it('hands rendering back to settled AVS state when the batch completes', () => {
    const t = undetectedToken({ visible: true });
    expect(applyCurrentViewHardHide(t)).toBe(false);

    hasActivePendingTokenMovement.mockReturnValue(false);
    clearCurrentViewMovementRenderSettles();
    t.visible = false;
    t.renderable = true;
    t.mesh = { visible: false, renderable: true, alpha: 1 };

    expect(applyCurrentViewHardHide(t)).toBe(true);
    expect(t).toMatchObject({
      visible: false,
      renderable: false,
      mesh: { visible: false, renderable: false, alpha: 0 },
      _pvCurrentViewHardHidden: true,
    });
  });

  it('defers during a live drag before pending position tracking starts', () => {
    hasActivePendingTokenMovement.mockReturnValue(false);
    draggedToken = controlled[0];
    const t = undetectedToken({ visible: true });
    t.renderable = true;
    t.mesh.visible = true;
    t.mesh.alpha = 1;
    delete t._pvCurrentViewHardHidden;

    expect(applyCurrentViewHardHide(t)).toBe(false);
    expect(t.visible).toBe(true);
    expect(t.renderable).toBe(true);
    expect(t.mesh.visible).toBe(true);
    expect(t.mesh.renderable).toBe(true);
    expect(t._pvCurrentViewHardHidden).toBe(false);
  });

  it('retains its marker until a Core-invisible token can restore stale surfaces', () => {
    const t = undetectedToken({ visible: false });
    expect(applyCurrentViewHardHide(t)).toBe(false);
    expect(t.renderable).toBe(false);
    expect(t.mesh.visible).toBe(false);
    expect(t._pvCurrentViewHardHidden).toBe(true);

    hasActivePendingTokenMovement.mockReturnValue(false);
    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));
    expect(applyCurrentViewHardHide(t)).toBe(false);
    expect(t.renderable).toBe(true);
    expect(t.mesh.visible).toBe(true);
    expect(t.mesh.renderable).toBe(true);
    expect(t._pvCurrentViewHardHidden).toBe(false);
  });

  it('keeps a sticky undetected (Sneak override) token hard-hidden mid-move even with core sight', () => {
    const getFlag = (_mod, key) =>
      key === 'avs-override-from-obs' ? { state: 'undetected' } : null;
    const t = undetectedToken({ visible: true, getFlag });
    expect(applyCurrentViewHardHide(t)).toBe(true);
    expect(t.visible).toBe(false);
    expect(t.renderable).toBe(false);
  });

  it('keeps undetected loot hard-hidden mid-move (loot never defers)', () => {
    const t = undetectedToken({ visible: true, actorType: 'loot' });
    expect(applyCurrentViewHardHide(t)).toBe(true);
    expect(t.visible).toBe(false);
    expect(t.renderable).toBe(false);
  });

  it('keeps a Foundry-hidden undetected token hard-hidden during a GM move', () => {
    globalThis.game = { user: { isGM: true } };
    const t = undetectedToken({ visible: true, hidden: true });
    expect(applyCurrentViewHardHide(t)).toBe(true);
    expect(t.visible).toBe(false);
    expect(t.renderable).toBe(false);
    expect(t.mesh.visible).toBe(false);
    expect(t.mesh.alpha).toBe(0);
  });

  it('hard-hides a non-sticky undetected token when no move is active', () => {
    hasActivePendingTokenMovement.mockReturnValue(false);
    const t = undetectedToken({ visible: true });
    expect(applyCurrentViewHardHide(t)).toBe(true);
    expect(t.visible).toBe(false);
    expect(t.renderable).toBe(false);
  });
});

describe('releaseCurrentViewHardHideIfMarked', () => {
  beforeEach(() => {
    controlled.length = 0;
    controlled.push({ document: { id: 'obs' }, controlled: true });
    globalThis.game = { user: { isGM: false } };
    __setStoredVisibilityForTest(new Map());
  });

  function markedHidden() {
    return {
      controlled: false,
      visible: false,
      renderable: false,
      _pvCurrentViewHardHidden: true,
      mesh: { visible: false, renderable: false, alpha: 0 },
      document: { id: 't', hidden: false },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };
  }

  it('releases a marked token that is no longer hard-hidden', () => {
    const t = markedHidden();
    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));
    expect(releaseCurrentViewHardHideIfMarked(t)).toBe(true);
    expect(t.visible).toBe(true);
    expect(t.mesh.visible).toBe(true);
    expect(t._pvCurrentViewHardHidden).toBe(false);
  });

  it('restores stale mesh renderability after Core makes a marked token visible', () => {
    const t = markedHidden();
    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));
    t.visible = true;
    t.renderable = true;
    t.mesh.visible = true;
    t.mesh.alpha = 1;

    expect(releaseCurrentViewHardHideIfMarked(t)).toBe(true);
    expect(t.mesh.renderable).toBe(true);
    expect(t._pvCurrentViewHardHidden).toBe(false);
  });

  it('does not flash primary art while an active detection filter owns the render surface', () => {
    const t = markedHidden();
    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));
    const detectionFilter = {};
    t.detectionFilter = detectionFilter;
    t.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };

    expect(releaseCurrentViewHardHideIfMarked(t)).toBe(true);

    expect(t.visible).toBe(true);
    expect(t.renderable).toBe(true);
    expect(t.mesh).toEqual({ visible: false, renderable: false, alpha: 1 });
    expect(t.detectionFilter).toBe(detectionFilter);
    expect(t.detectionFilterMesh).toEqual({ visible: true, renderable: true, alpha: 1 });
    expect(t._pvCurrentViewHardHidden).toBe(false);
  });

  it('keeps the marker when stale render state cannot yet be restored', () => {
    const t = markedHidden();
    t.controlled = true;
    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));

    expect(releaseCurrentViewHardHideIfMarked(t)).toBe(false);
    expect(t.mesh.renderable).toBe(false);
    expect(t._pvCurrentViewHardHidden).toBe(true);
  });

  it('keeps a marked token hidden while it is still hard-hidden', () => {
    const t = markedHidden();
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
    expect(releaseCurrentViewHardHideIfMarked(t)).toBe(false);
    expect(t.mesh.visible).toBe(false);
    expect(t._pvCurrentViewHardHidden).toBe(true);
  });

  it('no-ops for an unmarked token', () => {
    const t = markedHidden();
    delete t._pvCurrentViewHardHidden;
    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));
    expect(releaseCurrentViewHardHideIfMarked(t)).toBe(false);
    expect(t.mesh.visible).toBe(false);
  });
});

describe('releaseCurrentViewHardHide (restore on GM deselect / omniscience)', () => {
  function hardHidden() {
    return {
      controlled: false,
      visible: false,
      renderable: false,
      mesh: { visible: false, renderable: false, alpha: 0 },
      document: { id: 't', hidden: false },
    };
  }

  it('restores a hard-hidden token render state', () => {
    const t = hardHidden();
    expect(releaseCurrentViewHardHide(t)).toBe(true);
    expect(t.visible).toBe(true);
    expect(t.renderable).toBe(true);
    expect(t.mesh).toEqual({ visible: true, renderable: true, alpha: 1 });
  });

  it('uses GM-hidden alpha for foundry-hidden tokens', () => {
    const t = hardHidden();
    t.document.hidden = true;
    releaseCurrentViewHardHide(t);
    expect(t.mesh.alpha).toBe(0.5);
  });

  it('leaves an already-visible token untouched', () => {
    const t = {
      controlled: false,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      document: { id: 't', hidden: false },
    };
    expect(releaseCurrentViewHardHide(t)).toBe(false);
  });

  it('never restores a controlled token', () => {
    const t = hardHidden();
    t.controlled = true;
    expect(releaseCurrentViewHardHide(t)).toBe(false);
  });

  it('releaseAllCurrentViewHardHide restores every hard-hidden token and counts them', () => {
    const a = hardHidden();
    const b = hardHidden();
    const c = {
      controlled: false,
      renderable: true,
      mesh: { visible: true, alpha: 1 },
      document: { id: 'c', hidden: false },
    };
    const released = releaseAllCurrentViewHardHide([a, b, c]);
    expect(released).toBe(2);
    expect(a.visible).toBe(true);
    expect(a.renderable).toBe(true);
    expect(b.mesh.visible).toBe(true);
  });
});
