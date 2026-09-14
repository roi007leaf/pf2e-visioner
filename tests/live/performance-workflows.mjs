import { animateAndMeasure } from './runner-actions.mjs';

export function timingSummary(samples) {
  if (!samples.length || samples.some(n => !Number.isFinite(n) || n < 0)) throw Error('Valid timing samples required');
  const sorted = [...samples].sort((a, b) => a - b);
  return { count: sorted.length, medianMs: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], maxMs: sorted.at(-1), samples };
}

const definitions = [
  ['movement', 30], ['movement-lights', 30], ['observer-switch', 24], ['recalculate-12', 12], ['recalculate-30', 30],
];
export const performanceCases = definitions.map(([mode]) => ({
  name: `performance-${mode}`, area: 'performance', disposableWorld: true, secondObserver: true,
  settings: ['autoVisibilityEnabled', 'avsOnlyInCombat'],
  camera: { x: 900, y: 700, scale: 0.7 }, steps: [{ workflow: `performance-${mode}` }],
}));
export const performanceWorkflows = Object.fromEntries(definitions.map(([mode, count]) =>
  [`performance-${mode}`, c => benchmark(c, mode, count)]));

function record(c, label, measurement, passed) {
  c.evidence.push({ label, measurement, status: passed ? 'passed' : 'failed' });
  c.assert(passed, `${label}: ${JSON.stringify(measurement)}`);
}

async function benchmark(c, mode, count) {
  await c.setting('autoVisibilityEnabled', true);
  await c.setting('avsOnlyInCombat', false);
  const fixture = await c.gm.evaluate(async ({ f, runId, count, lights }) => {
    if (!game.user.isGM || canvas.scene?.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('QA scene required');
    const base = canvas.tokens.get(f.target).document.toObject();
    if (base.flags?.['pf2e-visioner']?.liveTestRun !== runId) throw Error('Owned target required');
    const data = Array.from({ length: count - canvas.scene.tokens.size }, (_, index) => {
      const token = foundry.utils.deepClone(base); delete token._id;
      token.name = `QA Load ${index}`;
      token.x = 100 + index % 10 * 150; token.y = 100 + Math.floor(index / 10) * 150;
      if (lights && index % 4 === 0) token.light = { dim: 20, bright: 10, color: '#ffaa55', alpha: 0.2 };
      return token;
    });
    await canvas.scene.createEmbeddedDocuments('Token', data);
    await canvas.scene.createEmbeddedDocuments('Wall', Array.from({ length: 24 }, (_, i) => ({
      c: [100 + i % 12 * 130, 1000 + Math.floor(i / 12) * 150, 160 + i % 12 * 130, 1050 + Math.floor(i / 12) * 150],
      sight: 20, move: 20, sound: 20, flags: { 'pf2e-visioner': { liveTestRun: runId } },
    })));
    return { tokens: canvas.scene.tokens.size, walls: canvas.scene.walls.size,
      tokenLights: canvas.scene.tokens.filter(t => t.light.dim > 0 || t.light.bright > 0).length };
  }, { f: c.fixture, runId: c.runId, count, lights: mode === 'movement-lights' });
  await c.player.waitForFunction(count => canvas.tokens.placeables.length === count, count);
  fixture.browser = await c.player.evaluate(() => ({ width: innerWidth, height: innerHeight, devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency, userAgent: navigator.userAgent, visibility: document.visibilityState }));
  c.equal(fixture.tokens, count, 'Requested performance workload exists');
  if (mode === 'movement-lights') c.assert(fixture.tokenLights >= 6, 'Token-light workload is active');
  await c.gm.waitForFunction(async () => {
    const { autoVisibilitySystem } = await import('/modules/pf2e-visioner/scripts/visibility/auto-visibility/index.js');
    const d = autoVisibilitySystem.getDiagnostics();
    return !d.processingBatch && !d.stateManagerProcessing && !d.updatingEffects && !d.pendingTokens.length && !d.changedTokens.length;
  });
  await c.check({ state: 'observed', visible: true }, true, 'performance-fixture-visible');
  if (mode.startsWith('movement')) {
    // One warm-up, then four measured native animations. Existing sampler checks
    // intermediate positions as well as frame times, so a skipped animation fails.
    await animateAndMeasure(c.gm, c.player, c.fixture, { x: 1000, duration: 1000, maxP95FrameMs: 100, maxFrameMs: 750 });
    for (const x of [800, 1000, 800, 1000]) {
      const sample = await animateAndMeasure(c.gm, c.player, c.fixture, { x, duration: 1000, maxP95FrameMs: 100, maxFrameMs: 750 });
      record(c, `${mode}-animation-${x}`, { ...sample, workload: fixture }, sample.passed);
    }
    await c.check({ state: 'observed', visible: true, targetX: 1000 }, true, 'load-movement-final-art');
  } else if (mode === 'observer-switch') {
    await c.setting('autoVisibilityEnabled', false);
    await c.mutate('state', 'hidden');
    await c.mutate('state', 'observed', { observer: c.fixture.secondObserver });
    await c.player.bringToFront();
    const samples = await c.player.evaluate(async f => {
      const samples = [];
      for (let index = 0; index < 13; index++) {
        const hidden = index % 2 === 1;
        const start = performance.now();
        canvas.tokens.get(hidden ? f.observer : f.secondObserver).control({ releaseOthers: true });
        await new Promise((resolve, reject) => {
          let frames = 0;
          const tick = () => {
            const t = canvas.tokens.get(f.target);
            const matches = hidden ? !!t.detectionFilter : !t.detectionFilter && t.mesh.visible && t.mesh.renderable;
            frames = matches ? frames + 1 : 0;
            if (frames >= 2) return resolve();
            if (performance.now() - start > 4000) return reject(Error('Observer render switch exceeded 4000 ms'));
            requestAnimationFrame(tick);
          }; requestAnimationFrame(tick);
        });
        if (index) samples.push(performance.now() - start);
      }
      return samples;
    }, c.fixture);
    const summary = timingSummary(samples);
    record(c, 'observer-switch-render-latency', { ...summary, workload: fixture, limits: { p95Ms: 1500, maxMs: 3000 } }, summary.p95Ms <= 1500 && summary.maxMs <= 3000);
    await c.rpc(c.player, 'view', c.fixture);
    await c.check({ state: 'hidden', filter: 'hearing' }, false, 'switch-restores-hidden-render');
  } else {
    const samples = await c.gm.evaluate(async () => {
      const { autoVisibilitySystem } = await import('/modules/pf2e-visioner/scripts/visibility/auto-visibility/index.js');
      const samples = [];
      for (let index = 0; index < 7; index++) {
        const start = performance.now();
        await new Promise((resolve, reject) => {
          // VSM also emits this hook with {tokenCount} immediately after
          // enqueueing. Only the orchestrator's completed token Set proves work
          // finished; accepting the enqueue notification produces false 0-ms runs.
          const hook = Hooks.on('pf2e-visioner.batchComplete', changed => {
            if (!(changed instanceof Set) || changed.size !== canvas.scene.tokens.size) return;
            clearTimeout(timer); Hooks.off('pf2e-visioner.batchComplete', hook); resolve();
          });
          const timer = setTimeout(() => { Hooks.off('pf2e-visioner.batchComplete', hook); reject(Error('AVS batch exceeded 8000 ms')); }, 8000);
          autoVisibilitySystem.recalculateAllVisibility(true).catch(error => { clearTimeout(timer); Hooks.off('pf2e-visioner.batchComplete', hook); reject(error); });
        });
        if (index) samples.push(performance.now() - start);
      }
      return samples;
    });
    const summary = timingSummary(samples);
    record(c, 'full-avs-recalculation', { ...summary, workload: fixture, limits: { p95Ms: 2000, maxMs: 4000 } }, summary.p95Ms <= 2000 && summary.maxMs <= 4000);
    await c.check({ state: 'observed', visible: true }, true, 'recalculation-preserves-player-art');
  }
}
