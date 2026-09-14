import { preparePerformanceFixture } from './performance-workflows.mjs';
import { startSample, stopSample, summarizeRenderedFrames } from './fps-workflows.mjs';

export const scenePerformanceCases = [false, true].map(avs => ({
  name: `performance-dungeon-avs-${avs ? 'on' : 'off'}`, area: 'performance',
  disposableWorld: true, secondObserver: true,
  settings: ['autoVisibilityEnabled', 'avsOnlyInCombat'],
  camera: { x: 900, y: 650, scale: 0.65 },
  steps: [{ workflow: `performance-dungeon-avs-${avs ? 'on' : 'off'}` }],
}));
export const scenePerformanceWorkflows = Object.fromEntries(scenePerformanceCases.map(test =>
  [test.name, c => dungeon(c, test.name.endsWith('-on'))]));

async function prepareDungeon(c) {
  await preparePerformanceFixture(c, 30, true);
  const workload = await c.gm.evaluate(async ({ f, runId }) => {
    const scene = canvas.scene;
    if (scene.id !== f.scene || scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
    const flags = { 'pf2e-visioner': { liveTestRun: runId } };
    await scene.deleteEmbeddedDocuments('Wall', scene.walls.map(w => w.id));
    const walls = [];
    const wall = (x1, y1, x2, y2, extra = {}) => walls.push({ c: [x1, y1, x2, y2], sight: 20, light: 20, move: 20, sound: 20, flags, ...extra });
    wall(50, 50, 1750, 50); wall(1750, 50, 1750, 1350);
    wall(1750, 1350, 50, 1350); wall(50, 1350, 50, 50);
    for (const y of [400, 700]) {
      let start = 50;
      for (const x of [250, 650, 1050, 1450]) { wall(start, y, x, y); start = x + 150; }
      wall(start, y, 1750, y);
    }
    for (const x of [450, 850, 1250]) { wall(x, 50, x, 400); wall(x, 700, x, 1350); }
    wall(900, 400, 900, 475); wall(900, 475, 900, 625, { door: 1, ds: 1 }); wall(900, 625, 900, 700);
    for (const x of [180, 580, 980, 1380]) for (const y of [200, 950]) {
      wall(x, y, x + 60, y); wall(x + 60, y, x + 60, y + 60);
      wall(x + 60, y + 60, x, y + 60); wall(x, y + 60, x, y);
    }
    await scene.createEmbeddedDocuments('Wall', walls);
    const population = scene.tokens.filter(t => ![f.observer, f.target, f.secondObserver].includes(t.id));
    await scene.updateEmbeddedDocuments('Token', population.map((t, i) => ({ _id: t.id,
      x: 70 + i % 4 * 400 + Math.floor(i / 8) * 85, y: i % 8 < 4 ? 80 : 780 })));
    await scene.updateEmbeddedDocuments('Token', [{ _id: f.secondObserver, x: 400, y: 550 }]);
    await scene.update({ 'environment.darknessLevel': 1, 'environment.globalLight.enabled': false,
      background: { src: '/modules/pf2e-visioner/tests/live/assets/dungeon.svg' } });
    await scene.createEmbeddedDocuments('AmbientLight', [200, 600, 1000, 1400].flatMap(x => [250, 550, 1050].map(y => ({
      x, y, walls: true, flags, config: { bright: 12, dim: 25, color: '#ffbb66', alpha: 0.25,
        animation: { type: 'torch', speed: 3, intensity: 3 } },
    }))));
    await scene.createEmbeddedDocuments('Region', [600, 950, 1250].map((x, i) => ({
      name: `QA native lighting region ${i}`, flags,
      shapes: [{ type: 'rectangle', x, y: 350, width: 450, height: 450, rotation: 0, hole: false }],
      behaviors: [{ type: 'adjustDarknessLevel', system: { mode: 0, modifier: i === 1 ? 0.1 : 0.95 } }],
    })));
    return { tokens: scene.tokens.size, walls: scene.walls.size, pillars: 8, doors: scene.walls.filter(w => w.door).length,
      ambientLights: scene.lights.size, tokenLights: scene.tokens.filter(t => t.light.dim || t.light.bright).length,
      regions: scene.regions.size, door: scene.walls.find(w => w.door).id };
  }, { f: c.fixture, runId: c.runId });
  for (const page of [c.gm, c.player]) {
    await c.rpc(page, 'view', c.fixture);
    await page.waitForFunction(() => canvas.effects.illumination.darknessLevelMeshes.children.length >= 3 &&
      canvas.lighting.placeables.length === 12 && canvas.lighting.placeables.every(l => l.lightSource?.active), null, { timeout: 15000 });
  }
  c.assert(workload.walls === 55 && workload.regions === 3 && workload.ambientLights === 12, 'Dungeon geometry and lighting workload exists');
  await c.check({ visible: true, filter: null }, true, 'dungeon-open-door-art');
  return workload;
}

async function dungeon(c, avs) {
  const workload = await prepareDungeon(c);
  await c.setting('autoVisibilityEnabled', avs);
  const failures = [];
  try {
    // Prove that the central wall intersects actual sight; decorative distant walls cannot pass.
    await c.mutate('move', 1000);
    await c.gm.evaluate(door => canvas.scene.walls.get(door).update({ ds: 0 }), workload.door);
    await c.check({ visible: false }, false, 'closed-corridor-door-blocks-player');
    await c.gm.evaluate(door => canvas.scene.walls.get(door).update({ ds: 1 }), workload.door);
    await c.check({ visible: true }, true, 'open-corridor-door-restores-player');
    await c.mutate('move', 800);
    for (const [role, page] of [['gm', c.gm], ['player', c.player]]) {
      await page.bringToFront(); await page.waitForTimeout(1000);
      for (const phase of ['idle', 'movement', 'door-changes', 'region-changes']) {
        const browser = await startSample(page, c);
        if (phase !== 'idle') await c.gm.evaluate(async ({ f, runId, door, phase }) => {
          if (canvas.scene.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
          for (let i = 0; i < 4; i++) {
            if (phase === 'door-changes') await canvas.scene.walls.get(door).update({ ds: i % 2 });
            if (phase === 'region-changes') for (const region of canvas.scene.regions) {
              await region.updateEmbeddedDocuments('RegionBehavior', region.behaviors.map(b => ({ _id: b.id, 'system.modifier': i % 2 ? 0.1 : 0.95 })));
            }
            await canvas.scene.updateEmbeddedDocuments('Token', [
              { _id: f.target, x: i % 2 ? 800 : 1000 },
              { _id: f.observer, x: i % 2 ? 400 : 600 },
            ], { animate: true, animation: { duration: 700 } });
            await new Promise(resolve => setTimeout(resolve, 850));
          }
        }, { f: c.fixture, runId: c.runId, door: workload.door, phase });
        await page.evaluate(() => globalThis.visionerQaFps.promise);
        const raw = await stopSample(page);
        const measurement = { ...summarizeRenderedFrames(raw), role, phase, browser, workload, avs,
          distinctPositions: raw.distinctPositions, listenersRestored: raw.listenersRestored };
        measurement.passed &&= raw.balanced && raw.listenersRestored && (phase === 'idle' || raw.distinctPositions >= 3);
        c.evidence.push({ label: `${role}-${phase}-dungeon-fps`, measurement, status: measurement.passed ? 'passed' : 'failed' });
        if (!measurement.passed) failures.push(`${role}/${phase}`);
      }
      await c.check({ visible: true, filter: null, targetX: 800 }, true, `${role}-dungeon-final-art`, { session: role });
    }
  } finally {
    const cleanup = await Promise.allSettled([stopSample(c.gm), stopSample(c.player)]);
    c.assert(cleanup.every(r => r.status === 'fulfilled'), 'Dungeon frame samplers cleaned up');
  }
  c.assert(!failures.length, `Dungeon FPS budgets failed: ${failures.join(', ')}`);
}
