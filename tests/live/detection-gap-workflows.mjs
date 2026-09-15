import { PNG } from 'pngjs';
const borderSenses = ['scent', 'lifesense', 'thoughtsense'];
const specialSenses = ['scent', 'tremorsense', 'lifesense', 'thoughtsense', 'echolocation'];
const special = (type, acuity = 'imprecise', range = 30) => ({ type, acuity, range });
const observed = { state: 'observed', visible: true, filter: null };
export const detectionGapCases = [
  { name: 'detection-movement-soundwave-handoff', area: 'performance', senses: [], darkness: true,
    disposableWorld: true, steps: [{ workflow: 'detection-movement-soundwave-handoff' }] },
  ...borderSenses.map(sense => ({ name: `detection-${sense}-upper-level-suppression`, area: 'detection-transitions',
    senses: [special(sense)], darkness: true,
    disposableWorld: true, settings: ['core.scrollingStatusText'],
    steps: [{ workflow: `detection-${sense}-upper-level-suppression` }] })),
  ...specialSenses.map(sense => ({
    name: `detection-boundary-${sense}`, area: 'detection-boundaries', senses: [special(sense, sense === 'echolocation' ? 'precise' : 'imprecise')],
    steps: [{ workflow: `detection-boundary-${sense}` }],
  })),
  ...['sense-fallback', 'tremor-elevation', 'overlapping-lights', 'overlapping-suppression',
    'rapid-lighting', 'rapid-observers', 'scene-switch-animation', 'door-animation-reveal', 'door-animation-hide'].map(mode => ({
    name: `detection-${mode}`, area: 'detection-transitions', senses: [],
    secondObserver: mode === 'rapid-observers', darkness: ['overlapping-lights', 'rapid-lighting', 'overlapping-suppression'].includes(mode),
    disposableWorld: true, settings: ['enableCameraVisionAggregation'],
    steps: [{ workflow: `detection-${mode}` }],
  })),
];
export const detectionGapWorkflows = Object.fromEntries([
  ['detection-movement-soundwave-handoff', movementSoundwaveHandoff],
  ...borderSenses.map(sense => [`detection-${sense}-upper-level-suppression`, c => borderUpperLevelSuppression(c, sense)]),
  ...specialSenses.map(sense => [`detection-boundary-${sense}`, c => rangeBoundary(c, sense)]),
  ['detection-sense-fallback', senseFallback], ['detection-tremor-elevation', tremorElevation],
  ['detection-overlapping-lights', overlappingLights], ['detection-overlapping-suppression', overlappingSuppression],
  ['detection-rapid-lighting', rapidLighting], ['detection-rapid-observers', rapidObservers],
  ['detection-scene-switch-animation', sceneSwitchAnimation],
  ['detection-door-animation-reveal', c => doorAnimation(c, true)],
  ['detection-door-animation-hide', c => doorAnimation(c, false)],
]);

async function movementSoundwaveHandoff(c) {
  await c.mutate('hearing-range', 30);
  const workload = await c.gm.evaluate(async ({ f, runId }) => {
    const scene = canvas.scene;
    if (!game.user.isGM || scene.id !== f.scene || scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
    const observer = canvas.tokens.get(f.observer), target = canvas.tokens.get(f.target);
    await observer.document.update({ x: 700 }, { animate: false });
    const base = target.document.toObject();
    const tokens = Array.from({ length: 28 }, (_, index) => {
      const data = foundry.utils.deepClone(base); delete data._id;
      data.name = `QA Soundwave Load ${index}`;
      data.x = 100 + index % 14 * 100; data.y = 900 + Math.floor(index / 14) * 100;
      return data;
    });
    await scene.createEmbeddedDocuments('Token', tokens);
    const [wall] = await scene.createEmbeddedDocuments('Wall', [{
      c: [650, 0, 650, 800], sight: 20, light: 20, move: 0, sound: 20,
      flags: { 'pf2e-visioner': { liveTestRun: runId } },
    }]);
    return { tokens: scene.tokens.size, wall: wall.id };
  }, { f: c.fixture, runId: c.runId });
  c.equal(workload.tokens, 30, 'Soundwave performance workload has 30 tokens');
  await c.player.waitForFunction(({ f, count }) =>
    canvas.scene?.id === f.scene && canvas.tokens.placeables.length === count && canvas.tokens.get(f.observer)?.document.x === 700,
  { f: c.fixture, count: workload.tokens });
  await c.check({ state: 'hidden', filter: 'hearing', visible: true }, false, 'audible-side-baseline');
  await c.indicator(true);

  // Same four-direction transition that exposed Rootfall's stale primary mesh.
  for (const [index, x] of [500, 700, 500, 700].entries()) {
    await measureSoundwaveMove(c, x, x < 650 ? 'undetected' : 'hidden', `wall-cycle-${index + 1}`);
  }

  await c.gm.evaluate(async ({ f, runId, wall }) => {
    const scene = canvas.scene;
    if (scene.id !== f.scene || scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
    await scene.deleteEmbeddedDocuments('Wall', [wall]);
  }, { f: c.fixture, runId: c.runId, wall: workload.wall });
  await measureSoundwaveMove(c, 100, 'undetected', 'hearing-range-exit');
  await measureSoundwaveMove(c, 700, 'hidden', 'hearing-range-return');
  await c.indicator(true);
}

async function measureSoundwaveMove(c, x, expectedState, label) {
  await c.player.bringToFront();
  await c.player.evaluate(f => {
    const observer = canvas.tokens.get(f.observer), target = canvas.tokens.get(f.target);
    const trace = window.visionerQaSoundwaveMove = {
      frames: [], positions: [], last: performance.now(), active: true, handle: null, timer: null,
    };
    const tick = now => {
      trace.timer = setTimeout(() => {
        if (!trace.active) return;
        const state = game.modules.get('pf2e-visioner').api.getVisibility(f.observer, f.target);
        trace.frames.push({
          gap: now - trace.last, state, coreVisible: target.isVisible,
          visible: target.visible, renderable: target.renderable, filter: !!target.detectionFilter,
          wave: !!(target.detectionFilterMesh?.visible && target.detectionFilterMesh?.renderable && Number(target.detectionFilterMesh?.alpha) > 0),
          primary: !!(target.mesh?.visible && target.mesh?.renderable),
        });
        trace.last = now; trace.positions.push(observer.x);
        trace.handle = requestAnimationFrame(tick);
      }, 0);
    };
    trace.handle = requestAnimationFrame(tick);
  }, c.fixture);
  let data;
  try {
    await c.gm.evaluate(async ({ f, x, runId }) => {
      const token = canvas.tokens.get(f.observer);
      if (canvas.scene?.id !== f.scene || token.document.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA observer required');
      await token.document.update({ x }, { animate: true, animation: { duration: 800 } });
    }, { f: c.fixture, x, runId: c.runId });
    await c.player.waitForTimeout(1700);
  } finally {
    data = await c.player.evaluate(() => {
      const trace = window.visionerQaSoundwaveMove;
      if (!trace) return null;
      trace.active = false; cancelAnimationFrame(trace.handle); clearTimeout(trace.timer);
      delete window.visionerQaSoundwaveMove;
      return { frames: trace.frames, positions: trace.positions };
    });
  }
  c.assert(data && data.frames.length > 0 && data.positions.length > 0,
    `${label} captured player render samples`);
  const gaps = data.frames.slice(2).map(frame => frame.gap).sort((a, b) => a - b);
  const p95 = gaps[Math.floor(gaps.length * 0.95)], max = gaps.at(-1);
  const intermediatePositions = new Set(data.positions.filter(position =>
    position !== data.positions[0] && Math.abs(position - x) > 1)).size;
  const fullArtLeaks = data.frames.filter(frame =>
    frame.state === 'undetected' && frame.visible && frame.renderable && !frame.filter && frame.primary).length;
  const rippleLeaks = data.frames.filter(frame =>
    frame.state === 'undetected' && frame.visible && (frame.filter || frame.wave)).length;
  const movement = { samples: gaps.length, intermediatePositions,
    firstX: data.positions[0], finalX: data.positions.at(-1), distinctPositions: new Set(data.positions).size };
  c.assert(gaps.length >= 10 && intermediatePositions >= 2 && Math.abs(data.positions.at(-1) - x) < 1,
    `${label} used native animated movement: ${JSON.stringify(movement)}`);
  c.equal(fullArtLeaks, 0, `${label} never painted full art while Undetected`);
  c.equal(rippleLeaks, 0, `${label} never painted soundwaves while Undetected`);
  c.assert(p95 <= 100 && max <= 750,
    `${label} frame budget: ${JSON.stringify({ samples: gaps.length, p95, max, limits: { p95: 100, max: 750 } })}`);
  await c.check(expectedState === 'hidden'
    ? { state: 'hidden', filter: 'hearing', visible: true }
    : { state: 'undetected', visible: false, filter: null }, false, `${label}-settled`);
}

async function borderUpperLevelSuppression(c, sense) {
  // Journaled world setting: restored after success, failure, or recovery.
  // Native level redraws must not destroy active scrolling status text.
  await c.setting('core.scrollingStatusText', false);
  await c.player.waitForTimeout(2200);
  await runBorderUpperLevelSuppression(c, sense);
}

async function runBorderUpperLevelSuppression(c, sense) {
  // All documents belong to the runner's disposable scene; its journal removes
  // that scene and actors even when an assertion or browser operation fails.
  await c.mutate('native-levels');
  await c.mutate('floor');
  await c.rpc(c.player, 'view', c.fixture);
  await c.mutate('condition', 'deafened');
  const present = { presenceMode: sense, presenceVisible: true };
  const absent = { presenceVisible: false, visible: false };
  await c.check(present, false, 'upper-target-in-range-without-suppression');
  const regionId = await c.gm.evaluate(async ({ f, runId, sense }) => {
    const scene = canvas.scene;
    if (!game.user.isGM || scene.id !== f.scene || scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
    const [region] = await scene.createEmbeddedDocuments('Region', [{
      name: `QA Upper Level ${sense} suppression`,
      flags: { 'pf2e-visioner': { liveTestRun: runId } },
      elevation: { bottom: 10, top: 20 },
      shapes: [{ type: 'rectangle', x: 700, y: 400, width: 300, height: 300, rotation: 0, hole: false }],
      behaviors: [{ type: 'pf2e-visioner.Pf2eVisionerSenseSuppression',
        system: { enabled: true, senses: [sense], affectsObserver: false, affectsTarget: true } }],
    }]);
    return region.id;
  }, { f: c.fixture, runId: c.runId, sense });
  const selection = await c.gm.evaluate(() => canvas.tokens.controlled.map(t => t.id));
  try {
    // First and second observer positions are both within scent range. Neither
    // stored detection nor the separate presence overlay may leak.
    for (const x of [400, 500, 400]) {
      await c.mutate('observer-move', { x });
      await c.check(absent, false, `suppressed-from-zone-${x}`);
      await clickObserver(c, true);
      await c.check(absent, false, `suppressed-with-gm-selected-${x}`);
      await clickObserver(c, false);
      await c.check(absent, false, `suppressed-after-gm-release-${x}`);
    }
    await ownedScene(c, 'region-delete', regionId);
    await c.mutate('observer-move', { x: 401 });
    await c.check(present, false, 'removing-suppression-restores-marker');
    // Compare independent clients under all GM vision modes. Real clicks also
    // exercise Core's selection hooks and user activity broadcasts.
    for (const mode of ['normal', 'observer', 'gm-vision']) {
      await c.gm.evaluate(value => game.settings.set('pf2e', 'gmVision', value), mode === 'gm-vision');
      await c.mutate('gm-observer-view', mode === 'observer');
      for (let cycle = 0; cycle < 3; cycle++) {
        await clickObserver(c, true);
        await c.check(present, false, `${sense}-${mode}-gm-selected-${cycle}`);
        await assertBorderPixels(c, sense, `${mode}-selected-${cycle}`);
        await clickObserver(c, false);
        await c.check(present, false, `${sense}-${mode}-gm-released-${cycle}`);
        await assertBorderPixels(c, sense, `${mode}-released-${cycle}`);
      }
    }
    await c.mutate('move', 1200);
    await c.check(absent, false, 'upper-target-outside-scent-range');
    await c.mutate('move', 800);
    await c.check(present, false, 'returning-in-range-restores-marker');
  } finally {
    await c.gm.evaluate(ids => {
      canvas.tokens.releaseAll();
      for (const id of ids) canvas.tokens.get(id)?.control({ releaseOthers: false });
    }, selection);
  }
}

async function clickObserver(c, selected) {
  await c.gm.bringToFront();
  // Observer View can recenter the camera while the GM tab is backgrounded.
  // Join that animation before converting token coordinates into a click.
  await c.gm.evaluate(async () => {
    await foundry.canvas.animation.CanvasAnimation.getAnimation('canvas.animatePan')?.promise;
  });
  const point = await c.gm.evaluate(f => {
    const token = canvas.tokens.get(f.observer);
    const p = canvas.stage.toGlobal(token.center);
    return { x: p.x, y: p.y, selected: token.controlled };
  }, c.fixture);
  if (point.selected !== selected) {
    if (!selected) await c.gm.keyboard.down('Shift');
    try { await c.gm.mouse.click(point.x, point.y, { delay: 100 }); }
    finally { if (!selected) await c.gm.keyboard.up('Shift'); }
  }
  await c.gm.waitForFunction(({ id, selected }) => canvas.tokens.get(id)?.controlled === selected,
    { id: c.fixture.observer, selected });
  await c.gm.mouse.move(10, 10);
  await c.player.bringToFront();
  await c.player.waitForTimeout(1000);
  c.equal(await c.player.evaluate(() => canvas.tokens.controlled.map(t => t.id)),
    [c.fixture.observer], 'GM click preserves player observer selection');
}

async function assertBorderPixels(c, sense, label) {
  await c.player.bringToFront();
  await c.player.mouse.move(10, 10);
  const { rect } = await c.rpc(c.player, 'snapshot', c.fixture);
  const png = PNG.sync.read(await c.player.screenshot());
  let pixels = 0;
  for (let y = Math.max(0, rect.y - 8); y < Math.min(png.height, rect.y + rect.height + 8); y++) {
    for (let x = Math.max(0, rect.x - 8); x < Math.min(png.width, rect.x + rect.width + 8); x++) {
      const i = (y * png.width + x) * 4;
      const [r, g, b] = png.data.subarray(i, i + 3);
      const match = sense === 'scent' ? r > 35 && r > g * 1.25 && g > b * 1.35 && b < 90
        : sense === 'lifesense' ? g > 60 && b > 70 && r < g * 0.6
          : r > 45 && b > 60 && g < r * 0.5;
      if (match) pixels++;
    }
  }
  c.assert(pixels > 30, `${sense} ${label}: player border rendered (${pixels} pixels)`);
}

async function rangeBoundary(c, sense) {
  await c.mutate('condition', 'blinded');
  if (sense !== 'echolocation') await c.mutate('condition', 'deafened');
  // Fixture grid is 100 pixels per 5 feet; observer starts at x=400.
  // Use whole squares so PF2e grid rounding cannot turn an outside point inside.
  for (const [x, detected] of [[900, true], [1000, true], [1100, false], [1000, true], [900, true]]) {
    await c.mutate('move', x);
    const presence = ['scent', 'lifesense', 'thoughtsense'].includes(sense);
    await c.check(detected ? { ...(sense === 'echolocation' ? observed : { state: 'hidden' }), sense,
      ...(presence ? { presenceMode: sense, presenceVisible: true } : { visible: true }) }
      : sense === 'echolocation' ? { state: 'hidden', sense: 'hearing', filter: 'hearing', visible: true }
        : { visible: false, presenceVisible: false }, detected && sense === 'echolocation' ? 'dim' : false, `${sense}-${(x - 400) / 20}-feet`);
  }
  await c.mutate('senses', []);
  if (sense === 'echolocation') await c.mutate('condition', 'deafened');
  await c.check({ visible: false }, false, 'removing-last-sense');
}

async function senseFallback(c) {
  await c.mutate('senses', [special('echolocation', 'precise'), special('tremorsense')]);
  await c.mutate('condition', 'blinded');
  await c.check(observed, 'dim', 'precise-echo-wins');
  for (let cycle = 0; cycle < 3; cycle++) {
    await c.mutate('condition', 'deafened');
    await c.check({ state: 'hidden', sense: 'tremorsense', filter: 'tremorsense', visible: true }, false, 'deafness-falls-back-to-tremor');
    await c.indicator(false);
    await c.mutate('elevation', 50);
    await c.check({ visible: false }, false, 'airborne-target-removes-fallback');
    await c.mutate('elevation', 0);
    await c.check({ state: 'hidden', filter: 'tremorsense', visible: true }, false, 'landing-restores-fallback');
    await c.mutate('condition', 'deafened');
    await c.check(observed, 'dim', 'hearing-restores-precise-echo');
  }
  await c.mutate('condition', 'blinded');
  await c.check(observed, true, 'sight-restored');
}

async function tremorElevation(c) {
  await c.mutate('senses', [special('tremorsense')]);
  await c.mutate('condition', 'blinded'); await c.mutate('condition', 'deafened');
  for (const elevation of [0, 5, 0, 10, 0]) {
    await c.mutate('elevation', elevation);
    await c.check(elevation === 0 ? { state: 'hidden', filter: 'tremorsense', visible: true } : { visible: false }, false, `target-elevation-${elevation}`);
  }
}

async function ownedScene(c, operation, value) {
  return c.gm.evaluate(async ({ f, runId, operation, value }) => {
    const scene = canvas.scene;
    if (!game.user.isGM || scene.id !== f.scene || scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
    const flags = { 'pf2e-visioner': { liveTestRun: runId } };
    if (operation === 'light-add') return (await scene.createEmbeddedDocuments('AmbientLight', [{
      x: 850, y: 550, config: { bright: value.bright, dim: value.dim, angle: 360 }, flags,
    }]))[0].id;
    if (operation === 'light-delete' || operation === 'region-delete') {
      const type = operation === 'light-delete' ? 'AmbientLight' : 'Region';
      const doc = scene.getEmbeddedDocument(type, value);
      if (doc?.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned document required');
      await doc.delete();
    }
    if (operation === 'region-id') return scene.regions.contents.at(-1).id;
  }, { f: c.fixture, runId: c.runId, operation, value });
}

async function overlappingLights(c) {
  await c.check({ state: 'hidden', filter: 'hearing' }, false, 'dark-baseline');
  const dim = await ownedScene(c, 'light-add', { bright: 0, dim: 30 });
  await c.check({ state: 'concealed', visible: true, filter: null }, 'dim', 'dim-only');
  const bright = await ownedScene(c, 'light-add', { bright: 30, dim: 30 });
  await c.check(observed, true, 'bright-overlaps-dim');
  await ownedScene(c, 'light-delete', bright);
  await c.check({ state: 'concealed', visible: true, filter: null }, 'dim', 'removing-bright-preserves-dim');
  await c.mutate('senses', [special('low-light-vision', 'precise')]);
  await c.check(observed, 'dim', 'low-light-vision-in-dim');
  await ownedScene(c, 'light-delete', dim);
  await c.check({ state: 'hidden', filter: 'hearing' }, false, 'removing-last-light');
}

async function overlappingSuppression(c) {
  await c.mutate('senses', [special('darkvision', 'precise')]);
  await c.check(observed, true, 'darkvision-baseline');
  const regions = [];
  for (let n = 0; n < 2; n++) {
    await c.mutate('region', { type: 'SenseSuppression', x: 350, system: { senses: ['darkvision'], affectsObserver: true } });
    regions.push(await ownedScene(c, 'region-id'));
  }
  await c.mutate('observer-move', { x: 401 });
  await c.check({ state: 'hidden', filter: 'hearing' }, false, 'both-regions-suppress');
  await ownedScene(c, 'region-delete', regions[0]);
  await c.mutate('observer-move', { x: 400 });
  await c.check({ state: 'hidden', filter: 'hearing' }, false, 'one-source-remains');
  await ownedScene(c, 'region-delete', regions[1]);
  await c.mutate('observer-move', { x: 401 });
  await c.check(observed, true, 'last-source-removal-restores-sight');
}

async function rapidLighting(c) {
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const dark of [false, true, false, true]) await c.mutate('lighting', dark);
    await c.check({ state: 'hidden', filter: 'hearing' }, false, 'last-dark-update-wins');
    for (const dark of [false, true, false]) await c.mutate('lighting', dark);
    await c.check(observed, true, 'last-bright-update-wins');
  }
}

async function rapidObservers(c) {
  await c.setting('enableCameraVisionAggregation', true);
  await c.mutate('condition', 'blinded'); await c.mutate('condition', 'deafened');
  for (let cycle = 0; cycle < 5; cycle++) {
    await c.player.evaluate(f => {
      for (let i = 0; i < 12; i++) canvas.tokens.get(i % 2 ? f.observer : f.secondObserver).control({ releaseOthers: true });
    }, c.fixture);
    await c.check({ state: 'undetected', secondState: 'observed', visible: false }, false, 'blind-observer-wins-last-selection');
    await c.player.evaluate(f => {
      for (let i = 0; i < 12; i++) canvas.tokens.get(i % 2 ? f.secondObserver : f.observer).control({ releaseOthers: true });
    }, c.fixture);
    await c.check({ visible: true, filter: null }, true, 'sighted-observer-wins-last-selection');
  }
  await c.rpc(c.player, 'view', c.fixture);
  await c.check({ visible: false }, false, 'original-observer-restored');
}

async function sceneSwitchAnimation(c) {
  let other;
  try {
    other = await c.gm.evaluate(async ({ f, runId }) => {
      const scene = canvas.scene;
      if (!game.user.isGM || scene.id !== f.scene || scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('QA scene required');
      return (await globalThis.Scene.create({ name: 'Visioner QA transition', width: 1800, height: 1400,
        flags: { 'pf2e-visioner': { liveTestRun: runId } }, ownership: { default: 3 } })).id;
    }, { f: c.fixture, runId: c.runId });
    for (const x of [1000, 800, 1000]) {
      await c.gm.evaluate(async ({ f, x }) => {
        const token = canvas.tokens.get(f.target);
        if (canvas.scene.id !== f.scene || !token.document.getFlag('pf2e-visioner', 'liveTestRun')) throw Error('QA token required');
        await token.document.update({ x }, { animate: true, animation: { duration: 1500 } });
      }, { f: c.fixture, x });
      await c.player.waitForFunction(f => {
        const t = canvas.tokens.get(f.target); return !!t?.animationContexts?.size || (t && Math.abs(t.x - t.document.x) > 1);
      }, c.fixture);
      await c.player.evaluate(id => game.scenes.get(id).view(), other);
      await c.rpc(c.player, 'view', c.fixture);
      await c.check({ ...observed, targetX: x, clones: 0 }, true, 'scene-return-restores-current-art');
    }
  } finally {
    await c.rpc(c.player, 'view', c.fixture);
    if (other) await c.gm.evaluate(async ({ id, runId }) => {
      const scene = game.scenes.get(id);
      if (scene?.getFlag('pf2e-visioner', 'liveTestRun') === runId) await scene.delete();
    }, { id: other, runId: c.runId });
  }
}

async function doorAnimation(c, open) {
  await c.mutate('door', open ? 0 : 1);
  await c.check(open ? { visible: false } : observed, !open, 'door-before-animation');
  for (const x of [1000]) {
    await c.gm.evaluate(async ({ f, x, runId }) => {
      const token = canvas.tokens.get(f.target);
      if (!game.user.isGM || canvas.scene.id !== f.scene || token.document.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('QA token required');
      await token.document.update({ x }, { animate: true, animation: { duration: 3000 } });
    }, { f: c.fixture, x, runId: c.runId });
    await c.player.waitForFunction(({ f, x }) => {
      const t = canvas.tokens.get(f.target); return t && t.x > 805 && t.x < 995 && Math.abs(t.x - x) > 5;
    }, { f: c.fixture, x });
    await c.mutate('door', open ? 1 : 0);
    const transition = await c.player.evaluate(async ({ f, x, open }) => {
      const samples = [], start = performance.now();
      return new Promise(resolve => {
        const tick = () => {
          const t = canvas.tokens.get(f.target);
          const visible = !!(t?.visible && t.mesh?.visible && t.mesh?.renderable && !t.detectionFilter);
          const sample = { ms: Math.round(performance.now() - start), x: t?.x, visible,
            state: game.modules.get('pf2e-visioner').api.getVisibility(f.observer, f.target) };
          if (!samples.length || sample.visible !== samples.at(-1).visible || sample.ms - samples.at(-1).ms > 200) samples.push(sample);
          const passed = !!t && Math.abs(t.x - x) > 5 && visible === open;
          if (passed || sample.ms > 3500) return resolve({ passed, samples });
          requestAnimationFrame(tick);
        }; requestAnimationFrame(tick);
      });
    }, { f: c.fixture, x, open });
    c.assert(transition.passed, `${open ? 'reveal' : 'hide'} before movement ends: ${JSON.stringify(transition.samples)}`);
    await c.check(open ? { ...observed, targetX: x } : { visible: false, targetX: x }, open, 'final-door-state');
  }
  await c.mutate('door', 1);
  await c.check(observed, true, 'door-reopened');
}
