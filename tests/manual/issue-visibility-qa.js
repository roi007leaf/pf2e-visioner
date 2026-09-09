/* global Actor */
// Run from a Foundry Script macro. Operates only on the explicitly named QA scene.
const NAME = 'Visioner Issues QA temporary';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function run(mode = 'inspect') {
  const report = { mode };
  try {
    const scene = game.scenes.find((entry) => entry.name === NAME);
    if (!scene) throw new Error('Create the Visioner QA scene first.');
    if (canvas.scene?.id !== scene.id) {
      await scene.view();
      await pause(1000);
    }
    const { getVisibilityMap } = await import('../../scripts/stores/visibility-map.js');
    const api = game.modules.get('pf2e-visioner').api;
    const observer = canvas.tokens.placeables.find((token) => token.name === 'Visioner QA Observer');
    const target = canvas.tokens.placeables.find((token) => token.name === 'Visioner QA Target');
    const door = scene.walls.contents[0];
    if (mode === 'wall-config') {
      door.sheet.render(true);
      return;
    }
    const snapshot = () => canvas.tokens.placeables.map((token) => ({
      name: token.name, map: getVisibilityMap(token), visible: token.visible,
      mesh: token.mesh?.visible, filter: !!token.detectionFilter,
      hardHidden: token._pvCurrentViewHardHidden,
      indicator: token._pvSystemHiddenIndicator?._pvIndicatorMode ?? null,
    }));
    if (mode === 'scent-edges') {
      const { default: Overrides } = await import('../../scripts/chat/services/infra/AvsOverrideManager.js');
      await Overrides.removeOverride(observer.id, target.id);
      const region = scene.regions.find((entry) => entry.name === 'Visioner QA darkness');
      if (region) await region.updateEmbeddedDocuments('RegionBehavior', region.behaviors.map((behavior) => ({ _id: behavior.id, disabled: true })));
      await observer.actor.update({ 'system.perception.senses': [{ type: 'scent', acuity: 'imprecise', range: 60 }] });
      await observer.document.update({ x: 600, y: 600, light: { bright: 0, dim: 0 } });
      const shortData = observer.actor.toObject();
      delete shortData._id;
      shortData.name = 'Visioner QA short scent temporary';
      shortData.system.perception.senses = [{ type: 'scent', acuity: 'imprecise', range: 20 }];
      const shortActor = await Actor.create(shortData);
      const shortTokenData = await shortActor.getTokenDocument({ name: shortData.name, x: 600, y: 600, actorLink: true, sight: { enabled: true } });
      const [shortDocument] = await scene.createEmbeddedDocuments('Token', [shortTokenData.toObject()]);
      await pause(2500);
      const shortObserver = shortDocument.object;
      observer.control({ releaseOthers: true });
      report.cases = [];
      for (const entry of [
        { name: 'inside-range', x: 1200, ds: 0, blocksScent: false },
        { name: 'outside-range', x: 1200, range: 20, ds: 0, blocksScent: false },
        { name: 'blocked-scent', x: 1200, ds: 0, blocksScent: true },
        { name: 'open-scent-blocking-door', x: 1200, ds: 1, blocksScent: true },
        { name: 'manual-hidden-scent', x: 1200, ds: 0, blocksScent: false, manual: true },
      ]) {
        // Separate prepared observers avoid movement previews and edited-sense caches.
        const activeObserver = entry.range === 20 ? shortObserver : observer;
        activeObserver.control({ releaseOthers: true });
        await door.update({ ds: entry.ds, 'flags.pf2e-visioner.blocksScent': entry.blocksScent });
        if (entry.manual) await Overrides.applyForHide(observer, { target, state: 'hidden' });
        await api.autoVisibility.recalculateAll(true);
        await pause(2500);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        report.cases.push({ name: entry.name, targetPosition: { x: target.x, documentX: target.document.x },
          selected: canvas.tokens.controlled.map((token) => token.name), observerState: getVisibilityMap(activeObserver)[target.id] ?? 'observed',
          calculated: await api.autoVisibility.calculateVisibility(activeObserver, target), states: snapshot() });
      }
      await Overrides.removeOverride(observer.id, target.id);
      await shortDocument.delete();
      await shortActor.delete();
    }
    if (mode === 'door-flash' || mode === 'door-flash-dark') {
      const { getDetectionBetween } = await import('../../scripts/stores/detection-map.js');
      const region = scene.regions.find((entry) => entry.name === 'Visioner QA darkness');
      if (region) await region.updateEmbeddedDocuments('RegionBehavior', region.behaviors.map((behavior) => ({ _id: behavior.id, disabled: mode !== 'door-flash-dark' })));
      observer.control({ releaseOthers: true });
      report.transitions = [];
      await door.update({ ds: 1, 'flags.pf2e-visioner.blocksScent': false });
      await pause(3000);
      const originalRender = target.mesh._render;
      const { isClosedSightDoorBetween } = await import('../../scripts/helpers/scent-wall-utils.js');
      const { getPerceptionProfileBetween } = await import('../../scripts/stores/visibility-map.js');
      report.drawFailures = [];
      let exposedDraws = 0;
      target.mesh._render = function(...args) {
        const result = originalRender.apply(this, args);
        if ((door.ds === 0 || mode === 'door-flash-dark') && this.visible && this.renderable !== false && this.alpha > 0) {
          exposedDraws++;
          if (report.drawFailures.length < 5) report.drawFailures.push({
            state: getVisibilityMap(observer)[target.id] ?? 'observed', sense: getDetectionBetween(observer, target),
            objectClass: this.object?.constructor?.name, objectMatches: this.object === target,
            documentObjectMatches: this.object?.object === target, doorBlocks: isClosedSightDoorBetween(observer, target),
            door: { ds: door.ds, sight: door.sight, dir: door.dir },
            controlled: canvas.tokens.controlled.map((entry) => entry.name),
            profile: getPerceptionProfileBetween(observer, target),
            lookupClass: (this.object?.object ?? this.object)?.constructor?.name,
            generation: game.release.generation,
          });
        }
        return result;
      };
      try {
      for (const ds of [0, 1, 0, 1]) {
        exposedDraws = 0;
        const samples = [];
        let sampling = true;
        const sample = () => {
          if (!sampling) return;
          samples.push({ ds: door.ds, state: getVisibilityMap(observer)[target.id] ?? 'observed',
            sense: getDetectionBetween(observer, target)?.sense,
            art: !!(target.mesh?.visible && target.mesh?.renderable !== false && target.mesh?.alpha > 0),
            filter: !!(target.detectionFilter && target.detectionFilterMesh?.visible),
            indicator: !!target._pvSystemHiddenIndicator });
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        await door.update({ ds });
        await pause(3500);
        sampling = false;
        const unique = new Map();
        for (const entry of samples) {
          const key = JSON.stringify(entry);
          unique.set(key, { ...entry, frames: (unique.get(key)?.frames ?? 0) + 1 });
        }
        report.transitions.push({ ds, exposedDraws, totalFrames: samples.length, samples: [...unique.values()] });
      }
      } finally { target.mesh._render = originalRender; }
    }
    if (mode === 'scent-flash') {
      const { getPerceptionProfileBetween, primeHiddenDetectionFilterVisualsForObserver } = await import('../../scripts/stores/visibility-map.js');
      observer.control({ releaseOthers: true });
      await door.update({ ds: 0, 'flags.pf2e-visioner.blocksScent': false });
      await api.autoVisibility.recalculateAll(true);
      await pause(3000);
      report.profile = getPerceptionProfileBetween(observer, target);
      report.exposedRefreshes = 0;
      report.samples = 40;
      for (let i = 0; i < report.samples; i++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        target._refreshVisibility();
        primeHiddenDetectionFilterVisualsForObserver(observer);
        const art = target.mesh?.visible && target.mesh?.renderable !== false && target.mesh?.alpha > 0;
        const silhouette = target.detectionFilter && target.detectionFilterMesh?.visible;
        if (art || silhouette) report.exposedRefreshes++;
      }
      report.final = snapshot();
    }
    if (mode === 'inspect') {
      report.mesh = { className: target.mesh?.constructor?.name, objectId: target.mesh?.object?.id,
        objectClass: target.mesh?.object?.constructor?.name, documentTokenMatches: target.mesh?.object?.object === target,
        paths: Object.entries(foundry.canvas).flatMap(([space, values]) => Object.entries(values ?? {}).filter(([, cls]) => cls === target.mesh?.constructor).map(([name]) => `foundry.canvas.${space}.${name}`)),
        tokenId: target.mesh?.token?.id, registeredClass: !!foundry.canvas.primary?.TokenMesh,
        render: String(target.mesh?._render).slice(0, 2500) };
      report.darknessDefaults = new CONFIG.RegionBehavior.dataModels.adjustDarknessLevel().toObject();
      report.actorSenses = observer.actor.toObject().system.perception;
      report.states = snapshot();
      report.lights = [...canvas.effects.lightSources.values()].map((source) => ({
        active: source.active, x: source.x, y: source.y, data: source.data,
        reachesTarget: source.shape?.contains(target.center.x, target.center.y),
      }));
    }
    if (mode === 'camera') {
      canvas.tokens.releaseAll();
      await canvas.animatePan({ x: 4000, y: 4000, duration: 0 });
      await door.update({ ds: 0 });
      await pause(3000);
      report.closedOffscreen = snapshot();
      await door.update({ ds: 1 });
      await pause(3000);
      report.openOffscreen = snapshot();
      await canvas.animatePan({ x: 1000, y: 700, scale: 0.7, duration: 0 });
    }
    if (mode === 'darkness') {
      let region = scene.regions.find((entry) => entry.name === 'Visioner QA darkness');
      if (!region) [region] = await scene.createEmbeddedDocuments('Region', [{
        name: 'Visioner QA darkness', shapes: [{ type: 'rectangle', x: 0, y: 0, width: 2000, height: 1400 }],
        behaviors: [{ type: 'adjustDarknessLevel', system: { mode: 0, modifier: 1 } }],
      }]);
      await observer.document.update({ light: { bright: 40, dim: 40, color: '#ffffff' } });
      observer.control({ releaseOthers: true });
      await door.update({ ds: 0 });
      await pause(3000);
      report.closedRegion = snapshot();
      await door.update({ ds: 1 });
      await pause(3000);
      report.openRegion = snapshot();
      observer.release();
      observer.control({ releaseOthers: true });
      await pause(2000);
      report.afterReselect = snapshot();
      await observer.document.update({ x: observer.document.x + 100 }, { animate: false });
      await pause(3000);
      report.afterMove = snapshot();
      await observer.document.update({ x: 600 }, { animate: false });
    }
    if (mode === 'scent') {
      const { default: AvsOverrideManager } = await import('../../scripts/chat/services/infra/AvsOverrideManager.js');
      await AvsOverrideManager.removeOverride(observer.id, target.id);
      for (const region of scene.regions) {
        if (region.name === 'Visioner QA darkness') {
          await region.updateEmbeddedDocuments('RegionBehavior', region.behaviors.map((behavior) => ({ _id: behavior.id, disabled: true })));
        }
      }
      await observer.actor.update({ 'system.perception.senses': [{ type: 'scent', acuity: 'imprecise', range: 60 }] });
      await observer.document.update({ light: { bright: 0, dim: 0 } });
      await door.update({ ds: 0, sight: 20, sound: 20, 'flags.pf2e-visioner.blocksScent': false });
      observer.control({ releaseOthers: true });
      await api.autoVisibility.recalculateAll(true);
      await pause(3000);
      report.closedScent = snapshot();
      report.actorSenses = observer.actor.system.perception.senses;
      report.calculated = await api.autoVisibility.calculateVisibility(observer, target);
      report.detectionModes = observer.document.detectionModes;
      await door.update({ ds: 1 });
      await pause(3000);
      report.openScent = snapshot();
      await door.update({ ds: 0 });
      await pause(3000);
      report.closedAgain = snapshot();
      await door.update({ 'flags.pf2e-visioner.blocksScent': true });
      await pause(4000);
      report.scentBlocked = snapshot();
      await door.update({ 'flags.pf2e-visioner.blocksScent': false });
      await pause(4000);
      report.scentAllowedAgain = snapshot();
    }
  } catch (error) {
    report.error = error.stack;
  }
  new Dialog({ title: 'Visioner QA results', content: `<pre>${JSON.stringify(report, null, 2)}</pre>`,
    buttons: {
      camera: { label: 'Camera test', callback: () => run('camera') },
      darkness: { label: 'Darkness test', callback: () => run('darkness') },
      scent: { label: 'Scent test', callback: () => run('scent') },
      ok: { label: 'OK' },
    } }, { width: 680 }).render(true);
}
