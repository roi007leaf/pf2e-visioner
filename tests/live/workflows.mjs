import assert from 'node:assert/strict';
import { regionAuditWorkflows } from './region-audit-workflows.mjs';
import * as ui from './ui-workflows.mjs';
import * as behavior from './behavior-workflows.mjs';
import * as features from './feature-workflows.mjs';
import { auditWorkflows } from './audit-workflows.mjs';
import { gapWorkflows } from './gap-workflows.mjs';
import { actionGapWorkflows } from './action-gap-workflows.mjs';
import { playerActionWorkflows } from './player-action-workflows.mjs';
import { performanceWorkflows } from './performance-workflows.mjs';
import { detectionGapWorkflows } from './detection-gap-workflows.mjs';
import { fpsWorkflows } from './fps-workflows.mjs';
import { performanceLifecycleWorkflows } from './performance-lifecycle-workflows.mjs';
import { scenePerformanceWorkflows } from './scene-performance-workflows.mjs';
import { deletionRaceWorkflows } from './deletion-race-workflows.mjs';

export const workflows = {
  ...regionAuditWorkflows,
  ...fpsWorkflows,
  ...performanceLifecycleWorkflows,
  ...scenePerformanceWorkflows,
  ...deletionRaceWorkflows,
  ...detectionGapWorkflows,
  ...performanceWorkflows,
  ...playerActionWorkflows,
  ...actionGapWorkflows,
  ...gapWorkflows,
  ...auditWorkflows,
  'manager-directions': ui.managerDirections,
  'drag-preview': ui.dragPreview,
  'indicator-transitions': async c => {
    await c.gm.evaluate(f => {
      const trace = globalThis.visionerQaSenseTrace = { events: [], hooks: [] };
      for (const name of ['deleteItem', 'createItem', 'applyTokenStatusEffect', 'pf2e-visioner.batchStart', 'pf2e-visioner.batchComplete']) {
        const id = Hooks.on(name, document => {
          if (canvas.scene?.id !== f.scene) return;
          if (name.endsWith('Item') && document.parent?.id !== canvas.tokens.get(f.observer)?.actor?.id) return;
          const token = canvas.tokens.get(f.observer);
          trace.events.push({ name, time: performance.now(), item: document?.slug, blinded: token?.actor?.hasCondition('blinded'),
            states: token?.document?.getFlag('pf2e-visioner', 'visibilityV2') });
        });
        trace.hooks.push({ name, id });
      }
    }, c.fixture);
    try {
    for (let cycle = 0; cycle < 3; cycle++) {
      await c.mutate('condition', 'blinded');
      await c.check({ state: 'hidden', filter: 'hearing', visible: true }, false);
      await c.indicator(true);
      await c.mutate('senses', [{ type: 'tremorsense', acuity: 'imprecise', range: 30 }]);
      await c.mutate('condition', 'deafened');
      await c.check({ state: 'hidden', filter: 'tremorsense', visible: true }, false);
      await c.indicator(false);
      await c.mutate('condition', 'deafened'); await c.mutate('senses', []);
      await c.check({ state: 'hidden', filter: 'hearing', visible: true }, false);
      await c.indicator(true);
      await c.mutate('condition', 'blinded');
      const conditions = await c.gm.evaluate(id => {
        const actor = canvas.tokens.get(id).actor;
        return { blinded: actor.hasCondition('blinded'), deafened: actor.hasCondition('deafened') };
      }, c.fixture.observer);
      c.equal(conditions, { blinded: false, deafened: false }, 'Native conditions removed');
      await c.check({ state: 'observed', filter: null }, true, 'vision-restored-cycle-' + cycle);
    }
    } finally {
      const events = await c.gm.evaluate(() => {
        const trace = globalThis.visionerQaSenseTrace;
        for (const hook of trace?.hooks ?? []) Hooks.off(hook.name, hook.id);
        delete globalThis.visionerQaSenseTrace;
        return trace?.events;
      });
      const failed = c.evidence.findLast(entry => entry.status === 'failed');
      if (failed) failed.sensoryEventTrace = events;
    }
  },
  'tile-presence-pixels': async c => {
    await c.mutate('tile', { x: 900, y: 800 }); await c.tileArt();
    await c.mutate('condition', 'deafened');
    await c.mutate('target-condition', 'invisible');
    await c.check({ state: 'hidden', sense: 'scent', tilesVisible: true }, false);
    // Scent uses a separate presence marker, so no wave assertion here.
    await c.tileArt();
    await c.player.evaluate(id => { const t = canvas.tokens.get(id); t.release(); t.control({ releaseOthers: true }); }, c.fixture.observer);
    await c.tileArt();
    await c.mutate('target-condition', 'invisible');
    await c.check({ state: 'observed', filter: null, tilesVisible: true }, true);
    await c.tileArt();
  },
  'levels-pillar': c => behavior.levelsPillar(c),
  'floor-occlusion': behavior.floorOcclusion,
  ...Object.fromEntries(['hide', 'sneak', 'seek'].map(action => [`action-${action}`, c => ui.applyRevert(c, action)])),
  'attack-consequences': ui.attackConsequences,
  ...Object.fromEntries(['hidden', 'undetected'].map(state => [`attack-consequences-${state}`, c => ui.attackConsequences(c, state)])),
  diversion: behavior.diversion,
  'point-out': behavior.pointOut,
  'take-cover': behavior.takeCover,
  'wall-cover': c => behavior.geometryCover(c, 'wall'),
  'tile-cover': c => behavior.geometryCover(c, 'tile'),
  'hazard-loot': ui.hazardLoot,
  'region-visibility': behavior.regionVisibility,
  'combat-wall-turn-movement': behavior.combatWallTurnMovement,
  'gm-observer-hidden-concealed-rendering': behavior.gmObserverHiddenConcealedRendering,
  'rule-elements': features.ruleLifecycle,
  'rule-strike': features.ruleStrike,
  'strike-off-guard': features.strikeOffGuard,
  'shared-vision': behavior.sharedVision,
  'sniping-duo-cover': async c => {
    await c.mutate('second-token', { x: 600, y: 500 });
    await c.check({ autoCover: 'lesser' });
    await c.mutate('feat-add', { slug: 'sniping-duo-dedication' });
    await c.mutate('link-spotter'); await c.check({ hasSpotter: true, autoCover: 'none' });
    await c.mutate('link-spotter', { clear: true }); await c.check({ hasSpotter: false, autoCover: 'lesser' });
    await c.mutate('link-spotter'); await c.mutate('feat-delete', { slug: 'sniping-duo-dedication' });
    await c.check({ autoCover: 'lesser' });
  },
  'search-exploration': behavior.searchExploration,
  'search-unnoticed': c => behavior.searchExploration(c, 'unnoticed'),
  'settings-macros': ui.settingsMacros,
  'stealth-initiative': features.stealthInitiative,
  'stealth-initiative-manual-states': features.stealthInitiativeManualStates,
  'combat-start-defend-shield': c => features.combatStartCharacterAction(c, 'defend'),
  'combat-start-quick-tempered-rage': c => features.combatStartCharacterAction(c, 'rage'),
  ...Object.fromEntries(['terrain-stalker', 'camouflage', 'vanish-into-the-land', 'distracting-shadows', 'keen-eyes', 'thats-odd', 'very-sneaky', 'sneaky', 'deny-advantage']
    .map(slug => [`feat-${slug}`, c => features.featContext(c, slug)])),
  compatibility: behavior.compatibility,
  'gm-handover': async c => {
    if (!c.gm2) throw Error('Prerequisite: second existing GM credentials required (VISIONER_GM2_USER)');
    const sessions = [c.gm, c.gm2];
    const ids = await Promise.all(sessions.map(p => p.evaluate(() => game.user.id)));
    const active = await c.gm.evaluate(() => game.users.filter(u => u.active && u.isGM).map(u => u.id));
    if (active.some(id => !ids.includes(id))) throw Error('Prerequisite: handover requires only the two QA GM accounts online');
    for (const offline of sessions) {
      const remaining = sessions.find(p => p !== offline);
      await offline.context().setOffline(true);
      try {
        await offline.reload({ timeout: 10000 }).catch(error => {
          if (!/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|NS_ERROR_OFFLINE/.test(error.message)) throw error;
        });
        const remainingId = await remaining.evaluate(() => game.user.id);
        await remaining.waitForFunction(id => game.users.activeGM?.id === id, remainingId, { timeout: 20000 });
        c.assert(true, 'Authority transferred to remaining GM');
        for (const state of ['hidden', 'observed']) {
          await c.rpc(remaining, 'mutate', { fixture: c.fixture, runId: c.runId, operation: 'state', value: state });
          await c.check({ state }, state === 'observed', `handover-${state}`);
        }
      } finally {
        await offline.context().setOffline(false);
        await offline.reload();
        await offline.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready, null, { timeout: 90000 });
        await c.rpc(offline, 'view', c.fixture);
      }
    }
    await c.check({ state: 'observed', filter: null }, true);
  },
};

export async function executeWorkflow(name, context) {
  if (!Object.hasOwn(workflows, name)) throw Error(`Unknown automated workflow: ${name}`);
  const evidence = context.evidence;
  context.assert = (value, label) => {
    const result = { label, actual: !!value, expected: true, status: 'failed' }; evidence.push(result);
    assert.ok(value, label); result.status = 'passed';
  };
  context.equal = (actual, expected, label) => {
    const result = { label, actual, expected, status: 'failed' }; evidence.push(result);
    assert.deepEqual(actual, expected, label); result.status = 'passed';
  };
  await workflows[name](context);
  if (!evidence.length) throw Error(`Workflow produced no assertions: ${name}`);
  if (evidence.some(item => item.status !== 'passed')) throw Error(`Workflow failed assertions: ${evidence.filter(item => item.status !== 'passed').map(item => item.label).join(', ')}`);
}
