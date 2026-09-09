/* global User, Actor, Scene, Macro */
// Live acceptance only. Run from the named Foundry QA Script macro.
const NAME = 'Visioner live acceptance temporary';
const wait = (ms = 1800) => new Promise((resolve) => setTimeout(resolve, ms));
const report = (data) => new Dialog({ title: 'Visioner live acceptance',
  content: `<pre>${JSON.stringify(data, null, 2)}</pre>`, buttons: { ok: { label: 'OK' } },
}, { width: 720 }).render(true);

export async function run(mode) {
  const results = { mode, checks: [] };
  try {
    const { getVisibilityBetween } = await import('../../scripts/stores/visibility-map.js');
    const { default: Overrides } = await import('../../scripts/chat/services/infra/AvsOverrideManager.js');
    let scene = game.scenes.find((s) => s.name === NAME);
    if (mode === 'setup') {
      if (!game.user.isGM) throw Error('GM setup required');
      const users = [];
      for (const name of ['Visioner QA Player temporary', 'Visioner QA Other temporary']) {
        users.push(game.users.find((u) => u.name === name) ?? await User.create({ name, role: 1, password: '' }));
      }
      const actors = [];
      for (const [i, name] of ['Visioner QA PC A temporary', 'Visioner QA PC B temporary', 'Visioner QA Familiar temporary'].entries()) {
        let actor = game.actors.find((a) => a.name === name);
        if (!actor) actor = await Actor.create({ name, type: i === 2 ? 'familiar' : 'character',
          ownership: { default: 0, [users[i === 1 ? 1 : 0].id]: 3 },
          ...(i === 2 ? { system: { master: { id: actors[0].id } } } : {}),
        });
        actors.push(actor);
      }
      await users[0].update({ character: actors[0].id });
      await users[1].update({ character: actors[1].id });
      if (!scene) {
        const tokens = [];
        for (const [i, actor] of actors.entries()) {
          const token = await actor.getTokenDocument({ x: i === 1 ? 1200 : 600, y: i === 2 ? 900 : 600,
            name: actor.name, actorLink: true, sight: { enabled: true }, disposition: 1 });
          tokens.push(token.toObject());
        }
        scene = await Scene.create({ name: NAME, width: 6000, height: 4000, padding: 0,
          grid: { type: 1, size: 100, distance: 5, units: 'ft' }, tokenVision: true,
          environment: { globalLight: { enabled: true }, darknessLevel: 0 }, navigation: true,
          tokens, walls: [{ c: [900, 0, 900, 4000], door: 1, ds: 0, sight: 20, sound: 20, move: 20 }],
        });
      }
      let macro = game.macros.find((m) => m.name === 'Visioner live acceptance temporary');
      if (!macro) macro = await Macro.create({ name: 'Visioner live acceptance temporary', type: 'script',
        command: 'const qa = await import("/modules/pf2e-visioner/tests/manual/issue-live-acceptance.js?run="+Date.now()); await qa.run("player");',
        ownership: { default: 0, [users[0].id]: 3 },
      });
      results.setup = { scene: scene.id, player: users[0].name, macro: macro.name, activeUsers: game.users.filter((u) => u.active).map((u) => ({ name: u.name, isGM: u.isGM })) };
    }
    if (!scene) throw Error('Run setup first');
    if (canvas.scene?.id !== scene.id) { await scene.view(); await wait(2000); }
    const [a, b, familiar] = ['Visioner QA PC A temporary', 'Visioner QA PC B temporary', 'Visioner QA Familiar temporary'].map((name) => canvas.tokens.placeables.find((t) => t.name === name));
    const door = scene.walls.contents[0];
    const api = game.modules.get('pf2e-visioner').api;
    if (mode === 'cleanup') {
      if (!game.user.isGM) throw Error('GM cleanup required');
      if (game.scenes.active && game.scenes.active.id !== scene.id) await game.scenes.active.view();
      await scene.delete();
      for (const name of ['Visioner QA PC A temporary', 'Visioner QA PC B temporary', 'Visioner QA Familiar temporary']) {
        await game.actors.find((actor) => actor.name === name)?.delete();
      }
      await game.macros.find((macro) => macro.name === NAME)?.delete();
      for (const name of ['Visioner QA Player temporary', 'Visioner QA Other temporary']) {
        await game.users.find((user) => user.name === name)?.delete();
      }
      await game.macros.find((macro) => macro.name === 'Visioner Issues QA temporary')?.update({
        command: 'const qa = await import("/modules/pf2e-visioner/tests/manual/issue-visibility-qa.js?run="+Date.now()); await qa.run("inspect");',
      });
      report({ mode, removed: NAME });
      return;
    }
    const state = () => ({ aToB: getVisibilityBetween(a, b), bToA: getVisibilityBetween(b, a), familiarToB: getVisibilityBetween(familiar, b),
      familiarPosition: { x: familiar.x, y: familiar.y, documentX: familiar.document.x },
      bVisible: b.visible, bArt: !!(b.mesh?.visible && b.mesh?.renderable !== false && b.mesh?.alpha > 0),
      bFilter: !!b.detectionFilter, bHardHidden: !!b._pvCurrentViewHardHidden,
      bMesh: { visible: b.mesh?.visible, renderable: b.mesh?.renderable, alpha: b.mesh?.alpha },
      selected: canvas.tokens.controlled.map((t) => t.name),
      sources: canvas.tokens.placeables.filter((t) => t._isVisionSource()).map((t) => t.name),
    });
    if (mode === 'matrix') {
      const { ViewportFilterService } = await import('../../scripts/visibility/auto-visibility/core/ViewportFilterService.js');
      const viewport = new ViewportFilterService();
      await familiar.document.update({ hidden: true });
      await Overrides.removeOverride(a.id, b.id);
      await Overrides.removeOverride(b.id, a.id);
      a.control({ releaseOthers: true });
      for (const distance of [15, 30]) {
        await a.document.update({ x: distance === 15 ? 700 : 600 });
        await b.document.update({ x: distance === 15 ? 1000 : 1200 });
        for (const camera of [
          { name: 'both-offscreen', x: 4500, y: 3000, scale: 1 },
          { name: 'observer-only', x: (a.x + b.x) / 2 - canvas.app.renderer.screen.width / 6 - 100, y: a.center.y, scale: 3 },
          { name: 'target-only', x: (a.x + b.x) / 2 + canvas.app.renderer.screen.width / 6, y: b.center.y, scale: 3 },
        ]) {
          await canvas.animatePan({ ...camera, duration: 0 });
          for (const ds of [0, 1]) {
            await door.update({ ds }); await wait(2500);
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const actual = state();
            results.checks.push({ distance, camera: camera.name, viewportTokens: [...(viewport.getViewportTokenIdSet() ?? [])].map((id) => canvas.tokens.get(id)?.name), ds, ...actual,
              pass: actual.aToB === (ds ? 'observed' : 'undetected') && actual.bToA === (ds ? 'observed' : 'undetected') && actual.bArt === !!ds });
          }
        }
      }
      await canvas.animatePan({ x: 950, y: 700, scale: 0.8, duration: 0 });
    }
    if (mode === 'override') {
      a.control({ releaseOthers: true });
      await door.update({ ds: 0 }); await wait();
      await Overrides.applyForHide(b, { target: a, state: 'hidden' });
      await door.update({ ds: 1 }); await wait();
      let actual = state();
      results.checks.push({ phase: 'open-after-hide', ...actual, pass: actual.aToB === 'observed' && actual.bToA === 'hidden' });
      await a.document.update({ x: 500 }, { animate: false }); await wait();
      await a.document.update({ x: 600 }, { animate: false }); await wait();
      actual = state();
      results.checks.push({ phase: 'move-back-into-los', ...actual, override: await Overrides.getOverrideData(b, a), pass: actual.aToB === 'observed' && actual.bToA === 'hidden' });
      await Overrides.removeOverride(b.id, a.id);
    }
    if (mode === 'override-corner') {
      await door.update({ c: [900, 0, 900, 1000], ds: 0 });
      await a.document.update({ x: 600, y: 600 }, { animate: false });
      a.control({ releaseOthers: true }); await wait();
      await Overrides.applyForHide(b, { target: a, state: 'hidden' });
      await a.document.update({ x: 600, y: 1200 }, { animate: false }); await wait();
      await a.document.update({ x: 1200, y: 1200 }, { animate: false }); await wait(2500);
      const actual = state();
      results.checks.push({ phase: 'hider-rounds-corner', position: { x: a.x, y: a.y }, ...actual,
        override: await Overrides.getOverrideData(b, a), pass: actual.aToB === 'observed' && actual.bToA === 'hidden' });
      await Overrides.removeOverride(b.id, a.id);
      await door.update({ c: [900, 0, 900, 4000], ds: 1 });
      await a.document.update({ x: 600, y: 600 }, { animate: false });
    }
    if (mode === 'darkness' || mode === 'darkness-light') {
      let region = scene.regions.find((r) => r.name === NAME);
      if (!region) [region] = await scene.createEmbeddedDocuments('Region', [{ name: NAME,
        shapes: [{ type: 'rectangle', x: 0, y: 0, width: 6000, height: 4000 }],
        behaviors: [{ type: 'adjustDarknessLevel', system: { mode: 0, modifier: 1 } }],
      }]);
      await region.updateEmbeddedDocuments('RegionBehavior', region.behaviors.map((behavior) => ({ _id: behavior.id, disabled: false })));
      const oldSenses = a.actor.toObject().system.perception?.senses ?? [];
      a.control({ releaseOthers: true });
      try {
        for (const variant of (mode === 'darkness-light' ? ['light-no-darkvision'] : ['light-no-darkvision', 'darkvision', 'no-light-no-darkvision'])) {
          await a.actor.update({ 'system.perception.senses': variant === 'darkvision' ? [{ type: 'darkvision' }] : [] });
          await a.document.update({ light: { bright: variant === 'light-no-darkvision' ? 40 : 0, dim: variant === 'light-no-darkvision' ? 40 : 0 } });
          // Establish the stationary sense/light setup before testing the door event itself.
          await wait(2500);
          for (const ds of [0, 1]) {
            await door.update({ ds }); await wait(2500);
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const actual = state();
            const expected = ds ? (variant === 'no-light-no-darkvision' ? 'hidden' : 'observed') : 'undetected';
            results.checks.push({ variant, ds, ...actual, pass: actual.aToB === expected && (expected === 'observed' ? actual.bArt : !actual.bArt) });
            if (mode === 'darkness-light' && ds) {
              await wait(5000);
              results.delayed = state();
              results.lightSources = [...canvas.effects.lightSources.values()].map((source) => ({ active: source.active, data: source.data, reachesTarget: source.shape?.contains(b.center.x, b.center.y) }));
            }
          }
        }
      } finally {
        if (mode !== 'darkness-light') {
          await region.updateEmbeddedDocuments('RegionBehavior', region.behaviors.map((behavior) => ({ _id: behavior.id, disabled: true })));
          await a.actor.update({ 'system.perception.senses': oldSenses });
          await a.document.update({ light: { bright: 0, dim: 0 } });
        }
      }
    }
    if (mode === 'player' || mode === 'player-familiar') {
      if (game.user.isGM) throw Error('Run this mode from the separate player login');
      a.control({ releaseOthers: true }); await wait(500);
      a.release(); await wait(500);
      await canvas.animatePan({ x: 950, y: 700, scale: 0.8, duration: 0 });
      results.user = { name: game.user.name, isGM: game.user.isGM };
      results.initial = state();
      let sampleCount = 0;
      const phases = [];
      let last = '';
      for (let i = 0; i < 70; i++) {
        await wait(500);
        const current = { ds: door.ds, ...state() };
        const key = JSON.stringify(current);
        if (key !== last) { phases.push({ sample: i, ...current }); last = key; }
        sampleCount++;
      }
      results.phases = phases; results.sampleCount = sampleCount;
      results.final = state();
    }
    if (mode === 'player-door') {
      await familiar.document.update({ hidden: true });
      await door.update({ ds: 0 }); await wait(6000);
      await door.update({ ds: 1 }); await wait(7000);
      await door.update({ ds: 0 }); await wait(7000);
      await door.update({ ds: 1 }); await wait(7000);
      results.final = state();
    }
    if (mode === 'familiar-door') {
      await door.update({ ds: 0, move: 0 });
      await familiar.document.update({ x: 1200, y: 900 }); await wait(7000);
      await familiar.document.update({ x: 600, y: 900 }, { animate: false }); await wait(7000);
      await familiar.document.update({ x: 1200, y: 900 }, { animate: false }); await wait(7000);
      results.final = state();
    }
    if (mode === 'setup') results.state = state();
    results.pass = results.checks.length ? results.checks.every((c) => c.pass) : undefined;
  } catch (error) { results.error = error.stack; }
  report(results);
}
