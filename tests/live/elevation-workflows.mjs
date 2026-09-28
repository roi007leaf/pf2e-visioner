export const elevationCases = [{
  name: 'avs-v14-kingmaker-tree-elevation-rendering', area: 'levels',
  environment: { core: 14 },
  requireSettings: { autoVisibilityEnabled: true },
  settings: ['avsOnlyInCombat'],
  steps: [{ workflow: 'avs-v14-kingmaker-tree-elevation-rendering' }],
}, {
  name: 'avs-v14-combat-bounded-single-level-elevations', area: 'levels',
  environment: { core: 14 },
  requireSettings: { autoVisibilityEnabled: true },
  settings: ['avsOnlyInCombat'],
  steps: [{ workflow: 'avs-v14-combat-bounded-single-level-elevations' }],
}, {
  name: 'avs-v14-combat-single-level-elevations', area: 'levels',
  environment: { core: 14 },
  requireSettings: { autoVisibilityEnabled: true },
  settings: ['avsOnlyInCombat'],
  steps: [{ workflow: 'avs-v14-combat-single-level-elevations' }],
}, {
  name: 'avs-v14-single-level-elevation-refresh', area: 'levels',
  environment: { core: 14 },
  requireSettings: { autoVisibilityEnabled: true, avsOnlyInCombat: false },
  steps: [{ workflow: 'avs-v14-single-level-elevation-refresh' }],
}, {
  name: 'avs-v14-elevated-mutual-observed', area: 'levels',
  environment: { core: 14 },
  requireSettings: { autoVisibilityEnabled: true, avsOnlyInCombat: false },
  steps: [{ workflow: 'avs-v14-elevated-mutual-observed' }],
}, {
  name: 'avs-v14-descent-reveals-undetected', area: 'levels',
  environment: { core: 14 },
  requireSettings: { autoVisibilityEnabled: true, avsOnlyInCombat: false },
  steps: [{ workflow: 'avs-v14-descent-reveals-undetected' }],
}, {
  name: 'avs-v14-hidden-elevation-indicator', area: 'levels',
  environment: { core: 14 },
  requireSettings: { autoVisibilityEnabled: true, avsOnlyInCombat: false },
  steps: [{ workflow: 'avs-v14-hidden-elevation-indicator' }],
}];

async function elevatedMutualObserved(c) {
  const expected = { state: 'observed', reverseState: 'observed', visible: true, filter: null };
  const positions = () => c.gm.evaluate(f => [f.observer, f.target].map(id => {
    const d = canvas.tokens.get(id).document;
    return { id, x: d.x, y: d.y, level: d.level };
  }), c.fixture);
  const before = await positions();
  c.assert(before[0].level === before[1].level, 'same-native-level');
  await c.check(expected, true, 'ground-baseline');

  for (const elevation of [20, 0, 20]) {
    // Native document hooks must update AVS while x/y stay unchanged. Use RPC
    // directly: the convenience observer-move wrapper re-views the scene.
    for (const [subject, operation, value] of [
      ['target', 'elevation', elevation],
      ['observer', 'observer-move', { elevation }],
    ]) {
      await c.rpc(c.gm, 'mutate', { fixture: c.fixture, runId: c.runId, operation, value });
      for (const [role, page] of [['gm', c.gm], ['player', c.player]]) {
        await page.waitForFunction(async ({ f, elevation, subject }) => {
          const a = canvas.tokens.get(f.observer), b = canvas.tokens.get(f.target);
          return a && b && (subject === 'observer' ? a : b).document.elevation === elevation;
        }, { f: c.fixture, elevation, subject }, { timeout: 8000 });
        await c.check(expected, true, `${role}-${subject}-${elevation}-automatic-mutual-observed`, { session: role });
      }
      c.equal(await positions(), before, `${subject}-${elevation}-no-horizontal-or-level-change`);
    }
  }

  // Selecting either observer must retain artwork and the directional AVS map.
  const reverse = { ...c.fixture, observer: c.fixture.target, target: c.fixture.observer };
  await c.rpc(c.gm, 'view', reverse);
  // The artwork pixel matcher recognizes the target fixture texture only;
  // reversing the pair uses the observer texture, so inspect its mesh instead.
  await c.check({ ...expected, meshVisible: true }, undefined, 'elevated-reverse-gm-view', { ...reverse, session: 'gm' });
  await c.rpc(c.gm, 'view', c.fixture);
  await c.check(expected, true, 'elevated-original-gm-view', { session: 'gm' });
  await c.check(expected, true, 'elevated-player-after-gm-switch');
}

async function hiddenElevationIndicator(c) {
  const nativeElevation = (subject, elevation) => c.gm.evaluate(async ({ f, runId, subject, elevation }) => {
    if (!game.user.isGM || canvas.scene.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
    const token = canvas.tokens.get(subject === 'observer' ? f.observer : f.target);
    // Match normal document/HUD updates: preserve native animation defaults.
    // Do not re-view the scene or manually refresh perception afterward.
    await token.document.update({ elevation });
  }, { f: c.fixture, runId: c.runId, subject, elevation });
  const observed = { state: 'observed', reverseState: 'observed', visible: true, filter: null };
  await nativeElevation('target', 25);
  await c.check(observed, true, 'target-25-first');
  await nativeElevation('observer', 20);
  await c.check(observed, true, 'observer-20-second');
  // Reproduce Celdar (+20) knowing Silva's location (+25). Hidden is already
  // correct; success requires actual soundwave pixels, not merely a stored map.
  await c.rpc(c.gm, 'mutate', {
    fixture: c.fixture, runId: c.runId, operation: 'observer-move', value: { elevation: 20 },
  });
  await c.mutate('elevation', 20);
  await c.mutate('state', 'hidden');
  const expected = { state: 'hidden', visible: true, filter: 'hearing' };
  await c.check(expected, false, 'same-elevation-hidden-baseline');
  await c.indicator(true);

  for (const elevation of [25, 20, 25]) {
    await c.mutate('elevation', elevation);
    await c.check(expected, false, `hidden-target-at-${elevation}`);
    await c.indicator(true);
    await c.check({ state: 'hidden' }, undefined, `gm-hidden-map-at-${elevation}`, { session: 'gm' });
  }

  // Native Invisible supplies an automatic Hidden relationship after removing
  // the explicit override. Keep the exact 20/25 geometry for that path too.
  await c.mutate('reset-override');
  await c.check({ state: 'observed', visible: true, filter: null }, true, 'automatic-path-observed-baseline');
  await c.mutate('target-condition', 'invisible');
  await c.check(expected, false, 'automatic-invisible-hidden-at-20-25');
  await c.indicator(true);

  for (const [index, [subject, elevation]] of [
    ['observer', 25], ['observer', 30], ['observer', 20],
    ['target', 20], ['target', 25], ['observer', 0],
    ['observer', 20], ['target', 30], ['target', 25],
    ['observer', 60], ['observer', 25], ['target', 60],
    ['observer', 60], ['observer', 25], ['target', 25],
  ].entries()) {
    await nativeElevation(subject, elevation);
    for (const [role, page] of [['gm', c.gm], ['player', c.player]]) {
      await page.waitForFunction(({ f, subject, elevation }) =>
        canvas.tokens.get(subject === 'observer' ? f.observer : f.target)?.document.elevation === elevation,
      { f: c.fixture, subject, elevation }, { timeout: 8000 });
      await c.check(role === 'player' ? expected : { state: 'hidden' }, role === 'player' ? false : undefined,
        `${index}-${role}-native-${subject}-elevation-${elevation}`, { session: role });
    }
    await c.indicator(true);
  }

  const reverse = { ...c.fixture, observer: c.fixture.target, target: c.fixture.observer };
  await c.rpc(c.gm, 'view', reverse);
  await c.check({ reverseState: 'hidden' }, undefined, 'reverse-view-keeps-hidden-pair', { ...reverse, session: 'gm' });
  await c.rpc(c.gm, 'view', c.fixture);
  await c.check(expected, false, 'original-player-hidden-after-observer-switch');
  await c.indicator(true);

  await c.mutate('target-condition', 'invisible');
  await c.check({ state: 'observed', visible: true, filter: null }, true, 'invisibility-removed-at-20-25');
}

export const elevationWorkflows = {
  'avs-v14-kingmaker-tree-elevation-rendering': async c => {
    await c.gm.evaluate(async ({ f, runId }) => {
      if (!game.user.isGM || canvas.scene.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
      await canvas.scene.levels.contents[0].update({ 'elevation.bottom': 0, 'elevation.top': 20 });
      await canvas.scene.tokens.get(f.observer).update({ elevation: 20 });
      await canvas.scene.tokens.get(f.target).update({ y: 900, elevation: 25 });
      // Kingmaker tree texture and footprint, scaled 140px grid -> 100px.
      // Celdar/Silva positions translate to (400,500)/(800,900).
      await canvas.scene.createEmbeddedDocuments('Tile', [{
        texture: { src: 'modules/mad-wilderwoods/images/maps/01BeastLair/Assets/MAD_XX_YY_Print_Trees_Day.webp', anchorX: 0, anchorY: 0, fit: 'fill', scaleX: 1, scaleY: 1, tint: '#ffffff', alphaThreshold: 0.75 },
        x: -1800, y: -100, width: 3000, height: 2400, elevation: 19, sort: 3,
        occlusion: { alpha: 0, modes: [1] }, levels: [],
        flags: { 'pf2e-visioner': { liveTestRun: runId } },
      }]);
      await canvas.draw(canvas.scene);
    }, { f: c.fixture, runId: c.runId });
    c.fixture.camera = { x: 650, y: 750, scale: 1 };
    await c.rpc(c.gm, 'view', c.fixture);
    await c.rpc(c.player, 'view', c.fixture);
    await c.mutate('combat');
    await c.setting('avsOnlyInCombat', true);
    const observed = { state: 'observed', visible: true, filter: null };
    const hidden = { state: 'hidden', visible: true, filter: 'hearing' };
    await c.check(observed, true, 'tree-observed-at-20-25');
    await c.mutate('state', 'hidden');
    await c.check(hidden, false, 'tree-hidden-at-20-25');
    await c.indicator(true);
    for (const [index, [subject, elevation]] of [
      ['observer', 25], ['observer', 20], ['target', 20], ['target', 25],
      ['observer', 60], ['observer', 25], ['target', 60], ['target', 25],
    ].entries()) {
      await c.gm.evaluate(async ({ f, runId, subject, elevation }) => {
        if (!game.user.isGM || canvas.scene.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
        await canvas.tokens.get(subject === 'observer' ? f.observer : f.target).document.update({ elevation });
      }, { f: c.fixture, runId: c.runId, subject, elevation });
      await c.check(hidden, false, `tree-hidden-${index}-${subject}-${elevation}`);
      await c.indicator(true);
    }
    await c.gm.evaluate(async ({ f, runId }) => {
      if (!game.user.isGM || canvas.scene.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
      await canvas.scene.tiles.contents[0].update({ 'occlusion.modes': [] });
    }, { f: c.fixture, runId: c.runId });
    await c.check(hidden, false, 'tree-occlusion-disabled-hidden');
    await c.indicator(true);
    await c.mutate('reset-override');
    await c.check(observed, true, 'tree-observed-after-override-reset');
  },
  'avs-v14-combat-bounded-single-level-elevations': async c => {
    await c.gm.evaluate(async ({ f, runId }) => {
      if (!game.user.isGM || canvas.scene.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
      await canvas.scene.levels.contents[0].update({ 'elevation.bottom': 0, 'elevation.top': 20 });
      await canvas.draw(canvas.scene);
    }, { f: c.fixture, runId: c.runId });
    await c.rpc(c.gm, 'view', c.fixture);
    await c.rpc(c.player, 'view', c.fixture);
    await elevationWorkflows['avs-v14-combat-single-level-elevations'](c);
  },
  'avs-v14-combat-single-level-elevations': async c => {
    await c.mutate('combat');
    await c.setting('avsOnlyInCombat', true);
    await c.gm.evaluate(async ({ f, runId }) => {
      if (!game.user.isGM || canvas.scene.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
      // Normal native walls on the default level; offset from the clear sight ray.
      await canvas.scene.createEmbeddedDocuments('Wall', [{
        c: [350, 300, 950, 300], sight: 20, move: 20, sound: 20,
        levels: [canvas.scene.levels.contents[0].id],
        flags: { 'pf2e-visioner': { liveTestRun: runId } },
      }]);
    }, { f: c.fixture, runId: c.runId });
    const edits = [['observer', 25], ['target', 20], ['target', 25], ['observer', 20],
      ['observer', 25], ['target', 60], ['observer', 60], ['target', 25],
      ['observer', 25], ['target', 20], ['observer', 20]];
    for (const hidden of [false, true]) {
      if (hidden) await c.mutate('target-condition', 'invisible');
      for (const [index, [subject, elevation]] of edits.entries()) {
        await c.gm.evaluate(async ({ f, runId, subject, elevation }) => {
          if (!game.user.isGM || canvas.scene.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
          await canvas.tokens.get(subject === 'observer' ? f.observer : f.target).document.update({ elevation });
        }, { f: c.fixture, runId: c.runId, subject, elevation });
        const expected = { state: hidden ? 'hidden' : 'observed', visible: true,
          filter: hidden ? 'hearing' : null, encounterStarted: true, levelCount: 1, floorCount: 0 };
        for (const role of ['gm', 'player']) {
          await c.check(role === 'player' ? expected : { state: expected.state, encounterStarted: true },
            role === 'player' ? !hidden : undefined, `${hidden ? 'hidden' : 'observed'}-${index}-${role}-${subject}-${elevation}`, { session: role });
        }
        if (hidden) await c.indicator(true);
      }
    }
  },
  'avs-v14-single-level-elevation-refresh': async c => {
    const edit = (subject, elevation) => c.gm.evaluate(async ({ f, runId, subject, elevation }) => {
      if (!game.user.isGM || canvas.scene.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
      if (canvas.scene.levels.size !== 1 || canvas.scene.regions.size !== 0 || canvas.scene.walls.size !== 0 || canvas.scene.tiles.size !== 0) throw Error('Single-level scene without blockers required');
      const observer = canvas.tokens.get(f.observer), target = canvas.tokens.get(f.target);
      await (subject === 'observer' ? observer : target).document.update({ elevation });
    }, { f: c.fixture, runId: c.runId, subject, elevation });
    const observed = { state: 'observed', reverseState: 'observed', visible: true, meshVisible: true, filter: null, levelCount: 1, floorCount: 0 };
    for (const [index, [subject, elevation]] of [
      ['observer', 25], ['target', 20],
      ['observer', 20], ['observer', 25], ['observer', 20],
      ['target', 25], ['target', 20], ['observer', 25],
      ['target', 25], ['observer', 20], ['target', 20],
      ['observer', 25], ['target', 60], ['target', 25],
      ['observer', 60], ['target', 60], ['observer', 25],
      ['target', 25], ['observer', 20], ['target', 60],
      ['observer', 60], ['observer', 25], ['target', 20],
    ].entries()) {
      await edit(subject, elevation);
      for (const role of ['gm', 'player']) {
        await c.check(observed, true, `${index}-${role}-${subject}-${elevation}`, { session: role });
      }
    }
  },
  'avs-v14-descent-reveals-undetected': async c => {
    // Native surface separates eye heights at +25/+20, blocking sight and sound.
    // Movement is unrestricted so a normal elevation edit can descend through it.
    await c.mutate('floor');
    await c.gm.evaluate(async ({ f, runId }) => {
      if (!game.user.isGM || canvas.scene.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
      const floor = canvas.scene.regions.find(r => r.name === 'QA Floor');
      await floor.update({ 'elevation.bottom': 25, 'elevation.top': 25 });
      await floor.behaviors.contents[0].update({ 'system.move': false });
      await canvas.tokens.get(f.target).document.update({ elevation: 20 });
      await canvas.tokens.get(f.observer).document.update({ elevation: 25 });
    }, { f: c.fixture, runId: c.runId });
    const blocked = { state: 'undetected', visible: false };
    const clear = { state: 'observed', reverseState: 'observed', visible: true, filter: null };
    await c.check(blocked, false, 'observer-25-target-20-undetected');
    for (const elevation of [20, 25, 20]) {
      await c.gm.evaluate(async ({ f, runId, elevation }) => {
        if (!game.user.isGM || canvas.scene.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
        await canvas.tokens.get(f.observer).document.update({ elevation });
      }, { f: c.fixture, runId: c.runId, elevation });
      await c.check(elevation === 20 ? clear : blocked, elevation === 20, `native-observer-elevation-${elevation}`);
      await c.check({ state: elevation === 20 ? 'observed' : 'undetected' }, undefined,
        `gm-observer-elevation-${elevation}`, { session: 'gm' });
    }
  },
  'avs-v14-elevated-mutual-observed': elevatedMutualObserved,
  'avs-v14-hidden-elevation-indicator': hiddenElevationIndicator,
};
