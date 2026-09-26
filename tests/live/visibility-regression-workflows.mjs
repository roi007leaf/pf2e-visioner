// Real documents, item hooks, AVS batches, socket synchronization and player pixels.
// No explicit recalculation or movement is used to rescue stationary changes.
const names = ['wiki-blur-walls', 'wiki-faerie-fire-walls', 'conditional-stationary-refresh',
  'concealment-stationary-region-edits', 'visibility-stationary-region-edits',
  'smoke-immunity-region-lifecycle', 'smoke-immunity-rule-lifecycle', 'provide-cover-lifecycle'];
export const visibilityRegressionCases = names.map(name => ({
  name: `regression-${name}`, area: 'visibility-regressions', disposableWorld: true,
  senses: [], settings: ['core.scrollingStatusText'],
  camera: { x: 650, y: 550, scale: 1 }, steps: [{ workflow: `regression-${name}` }],
}));

const blur = { type: 'overrideVisibility', state: 'concealed', direction: 'from', observers: 'all', source: 'blur-spell' };
const fire = { type: 'conditionalState', condition: 'invisible', thenState: 'concealed', elseState: 'observed', stateType: 'visibility', direction: 'from', observers: 'all', source: 'faerie-fire' };
const immunity = tags => ({ type: 'ignoreVisibilitySources', sourceTags: tags, fromStates: ['concealed', 'hidden'] });
const add = (c, id, operations, subject = 'target') => c.mutate('effect-add', { id, operations, subject });
const del = (c, id, subject = 'target') => c.mutate('effect-delete', { id, subject });

async function positions(c) {
  return c.gm.evaluate(f => [f.observer, f.target].map(id => {
    const t = canvas.tokens.get(id).document;
    return { id, x: t.x, y: t.y, elevation: t.elevation };
  }), c.fixture);
}
async function stationary(c, change, state, label, art = state === 'observed' || state === 'concealed') {
  const before = await positions(c);
  const started = Date.now();
  await change();
  // Deadline starts with the actual native mutation, not after a manual refresh.
  for (const page of [c.gm, c.player]) await page.waitForFunction(async ({ f, state }) => {
    const { getVisibilityBetween } = await import('/modules/pf2e-visioner/scripts/stores/visibility-map.js');
    return canvas.scene?.id === f.scene && getVisibilityBetween(canvas.tokens.get(f.observer), canvas.tokens.get(f.target)) === state;
  }, { f: c.fixture, state }, { timeout: Math.max(1, 8000 - (Date.now() - started)) });
  c.equal(await positions(c), before, `${label}-no-token-movement`);
  c.assert(Date.now() - started < 8000, `${label}-automatic-update-within-8s`);
  await c.check({ state }, art, label);
}

async function region(c, type, system) {
  return c.gm.evaluate(async ({ f, runId, type, system }) => {
    if (!game.user.isGM || canvas.scene.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
    if (type === 'Visibility') system.events = [CONST.REGION_EVENTS.TOKEN_ENTER, CONST.REGION_EVENTS.TOKEN_EXIT, CONST.REGION_EVENTS.BEHAVIOR_ACTIVATED, CONST.REGION_EVENTS.BEHAVIOR_DEACTIVATED];
    return (await canvas.scene.createEmbeddedDocuments('Region', [{
      name: `QA regression ${type}`, flags: { 'pf2e-visioner': { liveTestRun: runId } },
      shapes: [{ type: 'rectangle', x: 700, y: 400, width: 300, height: 300, rotation: 0, hole: false }],
      behaviors: [{ type: `pf2e-visioner.Pf2eVisioner${type}`, system }],
    }]))[0].id;
  }, { f: c.fixture, runId: c.runId, type, system });
}
async function editRegion(c, id, changes, shapes = false) {
  await c.gm.evaluate(async ({ f, runId, id, changes, shapes }) => {
    const r = canvas.scene.regions.get(id);
    if (!game.user.isGM || canvas.scene.id !== f.scene || r?.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned region required');
    await (shapes ? r : r.behaviors.contents[0]).update(changes);
  }, { f: c.fixture, runId: c.runId, id, changes, shapes });
}
async function removeRegion(c, id) {
  await c.gm.evaluate(async ({ id, runId }) => {
    const r = canvas.scene.regions.get(id);
    if (!game.user.isGM || r?.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned region required');
    await r.delete();
  }, { id, runId: c.runId });
}

async function wallSpell(c, operation) {
  await c.mutate('condition', 'deafened');
  if (operation.condition) await c.mutate('target-condition', 'invisible');
  await c.mutate('wall-segment');
  await c.check({ state: 'undetected', visible: false }, false, 'closed-wall-baseline');
  // Observe every rendered frame through item creation, not only the settled map.
  await c.player.evaluate(async f => {
    const { getVisibilityBetween } = await import('/modules/pf2e-visioner/scripts/stores/visibility-map.js');
    const trace = globalThis.visionerQaSpellTrace = { samples: [], active: true };
    const sample = () => {
      if (!trace.active || canvas.scene?.id !== f.scene) return;
      const t = canvas.tokens.get(f.target);
      trace.samples.push({ state: getVisibilityBetween(canvas.tokens.get(f.observer), t), art: !!(t.mesh?.visible && t.mesh?.renderable && t.mesh?.alpha > 0) });
      trace.frame = requestAnimationFrame(sample);
    };
    sample();
  }, c.fixture);
  try {
    await stationary(c, () => add(c, 'spell', [operation]), 'undetected', 'spell-created-behind-wall', false);
    const samples = await c.player.evaluate(() => globalThis.visionerQaSpellTrace.samples);
    c.assert(samples.length > 2 && samples.every(s => s.state === 'undetected' && !s.art), 'spell-never-reveals-through-wall');
  } finally {
    await c.player.evaluate(() => { const t = globalThis.visionerQaSpellTrace; if (t) { t.active = false; cancelAnimationFrame(t.frame); } delete globalThis.visionerQaSpellTrace; });
  }
  await stationary(c, () => c.mutate('walls-delete'), operation.state ?? operation.thenState, 'wall-removed-spell-applies');
  await stationary(c, () => c.mutate('wall-segment'), 'undetected', 'wall-restored-spell-blocked', false);
  await stationary(c, () => c.mutate('state', 'observed'), 'observed', 'explicit-gm-override-preserved', false);
  await stationary(c, () => c.mutate('reset-override'), 'undetected', 'manual-override-cleared-wall-blocks', false);
  await stationary(c, () => del(c, 'spell'), 'undetected', 'spell-removal-behind-wall', false);
  if (operation.condition) await stationary(c, () => c.mutate('target-condition', 'invisible'), 'undetected', 'invisibility-removed-behind-wall', false);
  await stationary(c, () => c.mutate('walls-delete'), 'observed', 'wall-and-spell-removed');
}

async function conditional(c) {
  await c.check({ state: 'observed' }, true, 'baseline');
  await stationary(c, () => c.mutate('target-condition', 'invisible'), 'hidden', 'native-invisible', false);
  await stationary(c, () => add(c, 'fire', [fire]), 'concealed', 'faerie-fire-invisible-created');
  await stationary(c, () => c.mutate('target-condition', 'invisible'), 'observed', 'invisibility-removed');
  await stationary(c, () => c.mutate('effect-edit', { id: 'fire', operations: [{ ...fire, elseState: 'concealed' }] }), 'concealed', 'conditional-item-edited');
  await stationary(c, () => del(c, 'fire'), 'observed', 'conditional-item-deleted');
}

async function stationaryRegion(c, type) {
  await c.check({ state: 'observed' }, true, 'baseline');
  const active = type === 'Visibility' ? 'hidden' : 'concealed';
  let id;
  await stationary(c, async () => { id = await region(c, type, { enabled: true, visibilityState: 'hidden', applyToInsideTokens: false, twoWayRegion: false }); }, active, 'region-created-around-stationary-target', type !== 'Visibility');
  await stationary(c, () => editRegion(c, id, { disabled: true }), 'observed', 'region-disabled');
  await stationary(c, () => editRegion(c, id, { disabled: false }), active, 'region-reenabled', type !== 'Visibility');
  if (type === 'Visibility') {
    await stationary(c, () => editRegion(c, id, { 'system.visibilityState': 'concealed' }), 'concealed', 'visibility-state-edited');
  } else {
    await stationary(c, () => editRegion(c, id, { 'system.enabled': false }), 'observed', 'concealment-system-disabled');
    await stationary(c, () => editRegion(c, id, { 'system.enabled': true }), 'concealed', 'concealment-system-reenabled');
  }
  const outside = [{ type: 'rectangle', x: 1200, y: 900, width: 200, height: 200, rotation: 0, hole: false }];
  await stationary(c, () => editRegion(c, id, { shapes: outside }, true), 'observed', 'region-shape-moved-away');
  const inside = [{ ...outside[0], x: 700, y: 400, width: 300, height: 300 }];
  await stationary(c, () => editRegion(c, id, { shapes: inside }, true), 'concealed', 'region-shape-restored');
  await stationary(c, () => removeRegion(c, id), 'observed', 'region-deleted');
}

async function regionImmunity(c) {
  let smoke, mist;
  await stationary(c, async () => { smoke = await region(c, 'Concealment', { enabled: true, sourceTags: 'Smoke' }); }, 'concealed', 'smoke-region-created');
  await stationary(c, () => add(c, 'smoke-immunity', [immunity(['smoke'])], 'observer'), 'observed', 'smoke-immunity-created');
  await stationary(c, () => c.mutate('condition', 'deafened'), 'observed', 'deafened-observer-still-sees');
  await stationary(c, () => c.mutate('lighting', true), 'undetected', 'smoke-immunity-does-not-ignore-darkness', false);
  await stationary(c, () => c.mutate('lighting', false), 'observed', 'light-restored-smoke-ignored');
  await stationary(c, () => c.mutate('wall-segment'), 'undetected', 'smoke-immunity-does-not-ignore-wall', false);
  await stationary(c, () => c.mutate('walls-delete'), 'observed', 'wall-removed-smoke-ignored');
  await stationary(c, () => add(c, 'blur', [{ ...blur, sourceTags: ['blur'] }]), 'concealed', 'blur-still-conceals');
  await stationary(c, () => del(c, 'blur'), 'observed', 'blur-removed-smoke-still-ignored');
  await stationary(c, async () => { mist = await region(c, 'Concealment', { enabled: true, sourceTags: 'mist' }); }, 'concealed', 'independent-mist-not-ignored');
  await stationary(c, () => removeRegion(c, mist), 'observed', 'mist-removed-smoke-ignored');
  await stationary(c, () => editRegion(c, smoke, { 'system.sourceTags': '' }), 'concealed', 'untagged-region-not-ignored');
  await stationary(c, () => editRegion(c, smoke, { 'system.sourceTags': 'smoke' }), 'observed', 'region-retagged');
  await stationary(c, () => del(c, 'smoke-immunity', 'observer'), 'concealed', 'immunity-removal-restores-smoke');
  await stationary(c, () => removeRegion(c, smoke), 'observed', 'last-smoke-removed');
}

async function ruleImmunity(c) {
  const smoke = { ...blur, source: 'qa-smoke', sourceTags: ['smoke'], priority: 200 };
  await stationary(c, () => add(c, 'smoke', [smoke]), 'concealed', 'tagged-rule-created');
  await stationary(c, () => add(c, 'smoke-immunity', [immunity(['smoke'])], 'observer'), 'observed', 'tagged-rule-ignored');
  await stationary(c, () => c.mutate('effect-edit', { id: 'smoke-immunity', subject: 'observer', operations: [immunity(['mist'])] }), 'concealed', 'immunity-edited-to-other-source');
  await stationary(c, () => c.mutate('effect-edit', { id: 'smoke-immunity', subject: 'observer', operations: [immunity(['smoke'])] }), 'observed', 'immunity-edited-back');
  await stationary(c, () => add(c, 'blur', [{ ...blur, sourceTags: ['blur'] }]), 'concealed', 'independent-blur-survives');
  await stationary(c, () => add(c, 'blur-immunity', [immunity(['blur'])], 'observer'), 'observed', 'both-sources-ignored');
  await stationary(c, () => del(c, 'blur-immunity', 'observer'), 'concealed', 'one-immunity-removal-preserves-other');
  await stationary(c, () => del(c, 'blur'), 'observed', 'smoke-immunity-still-present');
  await stationary(c, () => c.mutate('effect-edit', { id: 'smoke', operations: [{ ...smoke, state: 'hidden' }] }), 'observed', 'tagged-hidden-ignored');
  await stationary(c, () => c.mutate('effect-edit', { id: 'smoke', operations: [{ ...smoke, sourceTags: [] }] }), 'concealed', 'untagged-rule-not-ignored');
  await stationary(c, () => del(c, 'smoke'), 'observed', 'tagged-source-deleted');
  await del(c, 'smoke-immunity', 'observer');
  for (const page of [c.gm, c.player]) await page.waitForFunction(f => {
    const entries = canvas.tokens.get(f.observer)?.document.getFlag('pf2e-visioner', 'ignoredVisibilitySources');
    return !entries || Object.keys(entries).length === 0;
  }, c.fixture, { timeout: 8000 });
  const remaining = await c.gm.evaluate(f => canvas.tokens.get(f.observer).document.getFlag('pf2e-visioner', 'ignoredVisibilitySources'), c.fixture);
  c.assert(!remaining || Object.keys(remaining).length === 0, 'last-immunity-flag-cleaned');
}

async function providedCover(c) {
  const operation = { type: 'provideCover', state: 'standard', source: 'qa-provided-cover', blockedEdges: ['west'], requiresTakeCover: false };
  const inspect = (page = c.gm) => page.evaluate(async ({ f, runId }) => {
    if (canvas.scene?.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
    const { CoverOverride } = await import('/modules/pf2e-visioner/scripts/rule-elements/operations/CoverOverride.js');
    const provider = canvas.tokens.get(f.target), attacker = canvas.tokens.get(f.observer);
    const flag = provider.document.getFlag('pf2e-visioner', 'providesCover');
    return { flag: flag?.state ?? null, cover: CoverOverride.getCoverFromToken(provider, attacker, attacker)?.state ?? null };
  }, { f: c.fixture, runId: c.runId });
  const check = async (expected, label) => {
    for (const [role, page] of [['gm', c.gm], ['player', c.player]]) {
      let result;
      const deadline = Date.now() + 8000;
      do {
        result = await inspect(page);
        if (JSON.stringify(result) === JSON.stringify(expected)) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      c.equal(result, expected, `${label}-${role}`);
    }
  };
  await check({ flag: null, cover: null }, 'provided-cover-baseline');
  await add(c, 'provider', [operation]);
  await check({ flag: 'standard', cover: 'standard' }, 'provider-native-item-created');
  await c.mutate('effect-edit', { id: 'provider', operations: [{ ...operation, state: 'greater' }] });
  await check({ flag: 'greater', cover: 'greater' }, 'provider-native-item-edited');
  await c.mutate('effect-edit', { id: 'provider', operations: [{ ...operation, blockedEdges: ['east'] }] });
  await check({ flag: 'standard', cover: null }, 'provider-unprotected-direction');
  await c.mutate('effect-edit', { id: 'provider', operations: [{ ...operation, requiresTakeCover: true }] });
  await check({ flag: 'standard', cover: null }, 'provider-requires-take-cover');
  await c.gm.evaluate(async ({ f, runId }) => {
    const t = canvas.tokens.get(f.observer);
    if (!game.user.isGM || t.document.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA token required');
    await t.document.setFlag('pf2e-visioner', 'hasTakenCover', true);
  }, { f: c.fixture, runId: c.runId });
  await check({ flag: 'standard', cover: 'standard' }, 'provider-receiver-took-cover');
  await del(c, 'provider');
  await check({ flag: null, cover: null }, 'provider-native-item-deleted');
  await c.check({ state: 'observed' }, true, 'provider-keeps-visible-art');
}

export const visibilityRegressionWorkflows = {
  'regression-provide-cover-lifecycle': providedCover,
  'regression-wiki-blur-walls': c => wallSpell(c, blur),
  'regression-wiki-faerie-fire-walls': c => wallSpell(c, fire),
  'regression-conditional-stationary-refresh': conditional,
  'regression-concealment-stationary-region-edits': c => stationaryRegion(c, 'Concealment'),
  'regression-visibility-stationary-region-edits': c => stationaryRegion(c, 'Visibility'),
  'regression-smoke-immunity-region-lifecycle': regionImmunity,
  'regression-smoke-immunity-rule-lifecycle': ruleImmunity,
};
for (const [name, workflow] of Object.entries(visibilityRegressionWorkflows)) {
  visibilityRegressionWorkflows[name] = async c => {
    await c.setting('core.scrollingStatusText', false);
    await workflow(c);
  };
}
