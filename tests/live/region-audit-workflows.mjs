const flags = [false, true];
export const regionAuditCases = ['concealment', 'cover', 'suppression', 'visibility'].flatMap(type => [{
  name: `region-audit-${type}`, area: 'region-options', secondObserver: type === 'visibility',
  disposableWorld: true, settings: ['core.scrollingStatusText'],
  steps: [{ workflow: `region-audit-${type}` }],
}, {
  name: `region-multilevel-${type}`, area: 'region-options', disposableWorld: true,
  settings: ['core.scrollingStatusText'],
  ...(type === 'suppression' ? { darkness: true, senses: [{ type: 'scent', acuity: 'imprecise', range: 30 }] } : {}),
  steps: [{ workflow: `region-multilevel-${type}` }],
}] );
export const regionAuditWorkflows = Object.fromEntries(regionAuditCases.map(c => [c.name, async context => {
  await context.setting('core.scrollingStatusText', false);
  await context.mutate('walls-delete');
  if (c.name.startsWith('region-multilevel-')) await multilevel(context, c.name.replace('region-multilevel-', ''));
  else await ({ concealment, cover, suppression, visibility })[c.name.replace('region-audit-', '')](context);
}]));

async function levelToken(c, subject, elevation, position = {}) {
  const level = await c.gm.evaluate(elevation => canvas.scene.levels.find(l => elevation >= l.elevation.bottom && elevation < l.elevation.top)?.id, elevation);
  c.assert(Boolean(level), `${subject}-native-level-at-${elevation}`);
  await c.mutate(subject === 'observer' ? 'observer-move' : 'target-token', { ...position, elevation, level });
}

async function multilevel(c, type) {
  await c.player.waitForTimeout(2200);
  await c.mutate('native-levels');
  await c.rpc(c.player, 'view', c.fixture);
  const names = { concealment: 'Concealment', cover: 'Cover', suppression: 'SenseSuppression', visibility: 'Visibility' };
  const system = {
    concealment: { enabled: true }, cover: { enabled: true, mode: 'override', coverLevel: 'standard' },
    suppression: { enabled: true, senses: ['scent'], affectsObserver: false, affectsTarget: true },
    visibility: { visibilityState: 'hidden', applyToInsideTokens: false, twoWayRegion: false },
  }[type];
  if (type === 'visibility') system.events = await c.gm.evaluate(() => [CONST.REGION_EVENTS.TOKEN_ENTER, CONST.REGION_EVENTS.TOKEN_EXIT, CONST.REGION_EVENTS.BEHAVIOR_ACTIVATED, CONST.REGION_EVENTS.BEHAVIOR_DEACTIVATED]);
  if (type === 'suppression') await c.mutate('condition', 'deafened');
  const id = await region(c, names[type], system, { elevation: { bottom: 10, top: 20, topInclusive: false } });
  const expected = active => type === 'suppression' ? { presenceVisible: !active }
    : type === 'cover' ? { autoCover: active ? 'standard' : 'none', state: 'observed', visible: true }
      : { state: active ? (type === 'visibility' ? 'hidden' : 'concealed') : 'observed', visible: true };
  // Same horizontal footprint, real token level changes; repeat to expose stale membership/render state.
  for (let cycle = 0; cycle < 2; cycle++) for (const elevation of [0, 10, 0]) {
    await levelToken(c, 'target', elevation);
    await c.check(expected(elevation === 10), undefined, `${type}-target-floor-${elevation}-cycle-${cycle}`);
  }
  await levelToken(c, 'target', 10);
  await levelToken(c, 'observer', 10);
  await c.check(expected(true), undefined, `${type}-both-upper`);
  await levelToken(c, 'observer', 0);
  await c.check(expected(true), undefined, `${type}-observer-below-target-upper`);
  if (type === 'suppression') {
    // In the same footprint, elevation alone determines observer-side suppression.
    await edit(c, id, { 'system.affectsObserver': true, 'system.affectsTarget': false });
    await levelToken(c, 'observer', 0, { x: 700 });
    await c.check(expected(false), undefined, 'observer-below-suppression-volume');
    await levelToken(c, 'observer', 10);
    await c.check(expected(true), undefined, 'observer-inside-upper-suppression-volume');
    await levelToken(c, 'observer', 0);
    await c.check(expected(false), undefined, 'observer-leaves-upper-suppression-volume');
    await edit(c, id, { 'system.affectsObserver': false, 'system.affectsTarget': true });
  }
  await edit(c, id, { disabled: true }); await refresh(c);
  await c.check(expected(false), undefined, `${type}-disabled-upper-region`);
  await edit(c, id, { disabled: false }); await refresh(c);
  await c.check(expected(true), undefined, `${type}-reenabled-upper-region`);
  await remove(c, id); await refresh(c);
  await c.check(expected(false), undefined, `${type}-removed-upper-region`);
}

async function region(c, type, system = {}, extra = {}) {
  return c.gm.evaluate(async ({ f, runId, type, system, extra }) => {
    const scene = canvas.scene;
    if (!game.user.isGM || scene.id !== f.scene || scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
    return (await scene.createEmbeddedDocuments('Region', [{ name: `QA ${type} options`,
      flags: { 'pf2e-visioner': { liveTestRun: runId } },
      shapes: [{ type: 'rectangle', x: 700, y: 400, width: 300, height: 300, rotation: 0, hole: false }],
      behaviors: [{ type: `pf2e-visioner.Pf2eVisioner${type}`, system }], ...extra,
    }]))[0].id;
  }, { f: c.fixture, runId: c.runId, type, system, extra });
}
async function edit(c, id, changes, document = false) {
  await c.gm.evaluate(async ({ id, changes, runId, document }) => {
    const r = canvas.scene.regions.get(id);
    if (!game.user.isGM || r?.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned region required');
    await (document ? r : r.behaviors.contents[0]).update(changes);
  }, { id, changes, runId: c.runId, document });
}
async function remove(c, id) {
  await c.gm.evaluate(async ({ id, runId }) => {
    const r = canvas.scene.regions.get(id);
    if (!game.user.isGM || r?.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned region required');
    await r.delete();
  }, { id, runId: c.runId });
}
async function refresh(c) { await c.mutate('move', 801); await c.mutate('move', 800); }

async function checkboxForm(c, id, fields) {
  const original = await c.gm.evaluate(({ id, fields }) => {
    const b = canvas.scene.regions.get(id).behaviors.contents[0];
    return Object.fromEntries(fields.map(key => [key, foundry.utils.getProperty(b, key)]));
  }, { id, fields });
  try {
    for (const field of fields) for (const value of flags) {
      await c.gm.evaluate(async id => { await canvas.scene.regions.get(id).behaviors.contents[0].sheet.render(true); }, id);
      const input = c.gm.locator(`input[name="${field}"]`);
      await input.waitFor({ state: 'visible' });
      await input.setChecked(value);
      await input.evaluate(e => e.form.requestSubmit());
      await c.gm.waitForFunction(({ id, field, value }) =>
        foundry.utils.getProperty(canvas.scene.regions.get(id).behaviors.contents[0], field) === value, { id, field, value });
      c.assert(true, `native-region-form-${field}-${value}`);
      await c.gm.evaluate(async id => { await canvas.scene.regions.get(id).behaviors.contents[0].sheet.close(); }, id);
    }
  } finally {
    await c.gm.evaluate(async id => { await canvas.scene.regions.get(id)?.behaviors.contents[0]?.sheet.close(); }, id);
    await edit(c, id, original);
  }
}

async function concealment(c) {
  const id = await region(c, 'Concealment', { enabled: true });
  await checkboxForm(c, id, ['system.enabled', 'disabled']);
  for (const enabled of flags) for (const disabled of flags) {
    await edit(c, id, { 'system.enabled': enabled, disabled }); await refresh(c);
    await c.check({ state: enabled && !disabled ? 'concealed' : 'observed' }, undefined, `concealment-enabled-${enabled}-disabled-${disabled}`);
  }
  await edit(c, id, { 'system.enabled': true, disabled: false });
  await geometry(c, id, 'ConcealmentRegionBehavior', 'doesRayHaveConcealment', true, false);
  const second = await region(c, 'Concealment', { enabled: true });
  await remove(c, id); await refresh(c); await c.check({ state: 'concealed' }, undefined, 'overlap-survives-first-removal');
  await remove(c, second); await refresh(c); await c.check({ state: 'observed' }, true, 'last-concealment-removed');
}
async function cover(c) {
  const id = await region(c, 'Cover', { enabled: true });
  await checkboxForm(c, id, ['system.enabled', 'disabled']);
  for (const mode of ['override', 'oneWay', 'lineOfSight']) for (const grade of ['lesser', 'standard', 'greater']) {
    for (const enabled of flags) for (const disabled of flags) {
      await edit(c, id, { 'system.mode': mode, 'system.coverLevel': grade, 'system.enabled': enabled, disabled });
      await refresh(c);
      await c.check({ autoCover: enabled && !disabled ? grade : 'none' }, undefined, `${mode}-${grade}-enabled-${enabled}-disabled-${disabled}`);
    }
    await edit(c, id, { 'system.enabled': true, disabled: false });
    const actual = await c.gm.evaluate(async () => {
      const { CoverRegionBehavior: B } = await import('/modules/pf2e-visioner/scripts/regions/CoverRegionBehavior.js');
      const inside = { x: 850, y: 550, elevation: 0 }, outside = { x: 450, y: 550, elevation: 0 };
      return [B.getCoverBetween(inside, outside), B.getCoverBetween(inside, { ...inside, x: 900 }),
        B.getCoverBetween(outside, { ...outside, x: 1100 })];
    });
    c.equal(actual, [mode === 'lineOfSight' ? grade : null, mode === 'oneWay' ? null : grade, mode === 'lineOfSight' ? grade : null], `${mode}-${grade}-direction-and-crossing`);
  }
  await geometry(c, id, 'CoverRegionBehavior', 'getCoverBetween', 'greater', null);
  await edit(c, id, { 'system.mode': 'override', 'system.coverLevel': 'lesser' });
  const second = await region(c, 'Cover', { enabled: true, mode: 'override', coverLevel: 'greater' });
  await refresh(c); await c.check({ autoCover: 'greater' }, undefined, 'overlap-highest-cover');
  await remove(c, second); await refresh(c); await c.check({ autoCover: 'lesser' }, undefined, 'overlap-lower-cover-remains');
  await remove(c, id); await refresh(c); await c.check({ autoCover: 'none' }, undefined, 'cover-removed');
}

async function geometry(c, id, className, method, hit, miss) {
  await edit(c, id, { elevation: { bottom: 10, top: 20 } }, true);
  const results = await c.gm.evaluate(async ({ className, method }) => {
    const B = (await import(`/modules/pf2e-visioner/scripts/regions/${className}.js`))[className];
    return [-1, 0, 9, 10, 15, 21].map(elevation => B[method]({ x: 450, y: 550, elevation }, { x: 850, y: 550, elevation }));
  }, { className, method });
  c.equal(results, [miss, miss, miss, hit, hit, miss], `${className}-elevation-boundaries`);
  for (const topInclusive of flags) {
    await edit(c, id, { 'elevation.topInclusive': topInclusive }, true);
    const atTop = await c.gm.evaluate(async ({ className, method }) => {
      const B = (await import(`/modules/pf2e-visioner/scripts/regions/${className}.js`))[className];
      return B[method]({ x: 450, y: 550, elevation: 20 }, { x: 850, y: 550, elevation: 20 });
    }, { className, method });
    c.equal(atTop, topInclusive ? hit : miss, `${className}-top-inclusive-${topInclusive}`);
  }
  await edit(c, id, { elevation: { bottom: null, top: null } }, true);
  const rectangle = { type: 'rectangle', x: 700, y: 400, width: 300, height: 300, rotation: 0, hole: false };
  for (const [name, shapes, a, b, expected] of [
    ['hole', [rectangle, { ...rectangle, x: 800, y: 450, width: 100, height: 100, hole: true }], [825,500], [875,500], miss],
    ['hole-solid-edge', [rectangle, { ...rectangle, x: 800, y: 450, width: 100, height: 100, hole: true }], [650,500], [750,500], hit],
    ['concave-gap', [{ type: 'polygon', hole: false, points: [700,400,1000,400,1000,450,750,450,750,700,700,700] }], [800,600], [900,600], miss],
    ['rotated-gap', [{ ...rectangle, height: 100, rotation: 45 }], [705,405], [715,415], miss],
    ['separated-gap', [{ ...rectangle, width: 100 }, { ...rectangle, x: 1100, width: 100 }], [850,550], [950,550], miss],
    ['ellipse-hit', [{ type: 'ellipse', x: 850, y: 550, radiusX: 100, radiusY: 100, rotation: 0, hole: false }], [650,550], [850,550], hit],
  ]) {
    await edit(c, id, { shapes }, true);
    const actual = await c.gm.evaluate(async ({ className, method, a, b }) => {
      const B = (await import(`/modules/pf2e-visioner/scripts/regions/${className}.js`))[className];
      return B[method]({ x: a[0], y: a[1], elevation: 0 }, { x: b[0], y: b[1], elevation: 0 });
    }, { className, method, a, b });
    c.equal(actual, expected, `${className}-${name}`);
  }
  await edit(c, id, { shapes: [rectangle] }, true);
}

async function suppression(c) {
  const senses = await c.gm.evaluate(async () => Object.keys((await import('/modules/pf2e-visioner/scripts/constants.js')).SPECIAL_SENSES));
  const id = await region(c, 'SenseSuppression', { senses, enabled: true }, { elevation: { bottom: 10, top: 20 } });
  await checkboxForm(c, id, ['system.enabled', 'system.affectsObserver', 'system.affectsTarget', 'disabled']);
  for (const enabled of flags) for (const disabled of flags) for (const affectsObserver of flags) for (const affectsTarget of flags) {
    await edit(c, id, { disabled, 'system.enabled': enabled, 'system.affectsObserver': affectsObserver, 'system.affectsTarget': affectsTarget });
    const actual = await suppressionProbe(c);
    const active = enabled && !disabled;
    c.equal(actual, { observer: active && affectsObserver ? senses : [], target: active && affectsTarget ? senses : [], below: [], outside: [] },
      `suppression-enabled-${enabled}-disabled-${disabled}-observer-${affectsObserver}-target-${affectsTarget}`);
  }
  await edit(c, id, { disabled: false, 'system.enabled': true, 'system.affectsObserver': true, 'system.affectsTarget': true });
  for (const sense of senses) {
    await edit(c, id, { 'system.senses': [sense] });
    const actual = await suppressionProbe(c);
    c.equal(actual.observer, [sense], `${sense}-observer-checkbox`);
    c.equal(actual.target, [sense], `${sense}-target-checkbox`);
  }
  await edit(c, id, { 'system.senses': [] });
  c.equal((await suppressionProbe(c)).target, [], 'empty-sense-selection');
  await remove(c, id);
}
async function suppressionProbe(c) {
  return c.gm.evaluate(async () => {
    const { SenseSuppressionRegionBehavior: B } = await import('/modules/pf2e-visioner/scripts/regions/SenseSuppressionRegionBehavior.js');
    const p = { x: 850, y: 550, elevation: 10 };
    return { observer: [...B.getSuppressedSensesForObserver(p)], target: [...B.getSuppressedSensesForTarget(p)],
      below: [...B.getSuppressedSensesForTarget({ ...p, elevation: 9 })], outside: [...B.getSuppressedSensesForTarget({ ...p, x: 450 })] };
  });
}

async function visibility(c) {
  await c.mutate('second-token', { x: 900, y: 600 });
  const states = ['avs', 'observed', 'concealed', 'hidden', 'undetected'];
  for (const applyToInsideTokens of flags) for (const twoWayRegion of flags) for (const state of states) {
    await c.mutate('move', 1100);
    const id = await region(c, 'Visibility', { visibilityState: state, applyToInsideTokens, twoWayRegion,
      events: await c.gm.evaluate(() => ['BEHAVIOR_ACTIVATED','BEHAVIOR_DEACTIVATED','TOKEN_ENTER','TOKEN_EXIT','TOKEN_TURN_START','TOKEN_TURN_END','TOKEN_ROUND_START','TOKEN_ROUND_END'].map(k => CONST.REGION_EVENTS[k])) });
    if (state === 'avs' && !applyToInsideTokens && !twoWayRegion) await checkboxForm(c, id, ['system.applyToInsideTokens', 'system.twoWayRegion', 'disabled']);
    await c.mutate('move', 800);
    const expected = state === 'avs' ? 'observed' : state;
    await c.check({ state: expected, reverseState: twoWayRegion ? expected : 'observed', secondState: applyToInsideTokens ? expected : 'observed' }, undefined,
      `visibility-${state}-inside-${applyToInsideTokens}-two-way-${twoWayRegion}`);
    await edit(c, id, { disabled: true }); await refresh(c);
    await c.check({ state: 'observed' }, undefined, 'visibility-disabled');
    await remove(c, id);
  }
}
