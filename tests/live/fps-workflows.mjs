import { preparePerformanceFixture, timingSummary } from './performance-workflows.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

export function summarizeRenderedFrames({ timestamps, durationMs, hidden, cap }) {
  if (!Number.isFinite(durationMs) || durationMs < 3000 || !Number.isFinite(cap) || cap < 0 ||
    timestamps.length < 2 || timestamps.some((n, i) => !Number.isFinite(n) || n < 0 || n > durationMs || (i && n <= timestamps[i - 1]))) {
    throw Error('Valid rendered-frame timestamps, FPS cap and measurement duration required');
  }
  const gaps = timestamps.slice(1).map((t, i) => t - timestamps[i]);
  // Include empty time at either edge so a late first frame or stopped renderer cannot pass.
  const allGaps = [timestamps[0], ...gaps, durationMs - timestamps.at(-1)];
  const times = timingSummary(gaps);
  const tail = [...gaps].sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(gaps.length * 0.01)));
  const result = { frames: timestamps.length, durationMs, averageFps: timestamps.length * 1000 / durationMs,
    onePercentLowFps: 1000 / (tail.reduce((a, b) => a + b, 0) / tail.length),
    p95FrameMs: times.p95Ms, p99FrameMs: [...gaps].sort((a, b) => a - b)[Math.ceil(gaps.length * 0.99) - 1],
    worstGapMs: Math.max(...allGaps), stallsOver50Ms: allGaps.filter(n => n > 50).length,
    hidden, cap, uncapped: cap === 0, limits: { minAverageFps: Math.min(30, (cap || 60) * 0.75), maxP95FrameMs: Math.max(50, 2000 / (cap || 60)), maxGapMs: 250 } };
  result.passed = !hidden && result.averageFps >= result.limits.minAverageFps &&
    result.p95FrameMs <= result.limits.maxP95FrameMs && result.worstGapMs <= result.limits.maxGapMs;
  return result;
}

const steadyStateFpsCases = [false, true].flatMap(lights => [false, true].map(avs => ({
  name: `fps-30${lights ? '-lights' : ''}-avs-${avs ? 'on' : 'off'}`, area: 'performance',
  disposableWorld: true, secondObserver: true, settings: ['autoVisibilityEnabled', 'avsOnlyInCombat'],
  camera: { x: 900, y: 700, scale: 0.7 }, steps: [{ workflow: `fps-30${lights ? '-lights' : ''}-avs-${avs ? 'on' : 'off'}` }],
})));
steadyStateFpsCases.push(...[false, true].map(avs => ({
  name: `fps-100-lights-avs-${avs ? 'on' : 'off'}`, area: 'performance',
  disposableWorld: true, secondObserver: true, settings: ['autoVisibilityEnabled', 'avsOnlyInCombat'],
  camera: { x: 900, y: 700, scale: 0.7 }, steps: [{ workflow: `fps-100-lights-avs-${avs ? 'on' : 'off'}` }],
})));
const combatActivationCase = {
  name: 'fps-combat-30-lights-avs-activation', area: 'performance',
  disposableWorld: true, secondObserver: true, settings: ['autoVisibilityEnabled', 'avsOnlyInCombat'],
  camera: { x: 900, y: 700, scale: 0.7 }, steps: [{ workflow: 'fps-combat-30-lights-avs-activation' }],
};
const canvasPanCases = [false, true].map(avs => ({
  name: `fps-canvas-pan-100-lights-avs-${avs ? 'on' : 'off'}`, area: 'performance',
  disposableWorld: true, secondObserver: true, settings: ['autoVisibilityEnabled', 'avsOnlyInCombat'],
  camera: { x: 900, y: 700, scale: 0.7 }, steps: [{ workflow: `fps-canvas-pan-100-lights-avs-${avs ? 'on' : 'off'}` }],
}));
export const fpsCases = [...steadyStateFpsCases, ...canvasPanCases, combatActivationCase];
export const fpsWorkflows = {
  ...Object.fromEntries(steadyStateFpsCases.map(test => [test.name, c => renderedFps(c, test.name.includes('-lights'), test.name.endsWith('-on'), test.name.startsWith('fps-100') ? 100 : 30)])),
  ...Object.fromEntries(canvasPanCases.map(test => [test.name, c => renderedCanvasPanFps(c, test.name.endsWith('-on'))])),
  [combatActivationCase.name]: combatActivationFps,
};

export async function startSample(page, c) {
  return page.evaluate(({ f, runId }) => {
    if (canvas.scene?.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA canvas required');
    if (globalThis.visionerQaFps) throw Error('Previous FPS sampler was not cleaned up');
    const renderer = canvas.app.renderer;
    if (!renderer.on || !renderer.off || !('renderingToScreen' in renderer)) throw Error('Supported PIXI render events required');
    const cap = canvas.app.ticker.maxFPS;
    const stack = [], timestamps = [], positions = new Set(), start = performance.now();
    const avsBatches = [];
    const state = globalThis.visionerQaFps = { hidden: document.hidden, stop: null, promise: null };
    const before = () => stack.push(renderer.renderingToScreen);
    const after = () => {
      const screen = stack.pop();
      // Ignore render-to-texture passes, including nested lighting/filter renders.
      if (screen && stack.length === 0) {
        timestamps.push(performance.now() - start);
        positions.add(Math.round(canvas.tokens.get(f.target)?.x ?? -1));
      }
    };
    const visibility = () => { state.hidden ||= document.hidden; };
    const stateManagerBatchHook = Hooks.on('pf2e-visioner.batchComplete', changed => {
      avsBatches.push({ timeMs: performance.now() - start,
        kind: changed instanceof Set ? 'finalization' : 'state-manager',
        changedTokens: changed instanceof Set ? changed.size : Number(changed?.tokenCount ?? 0) });
    });
    const orchestratorBatchHook = Hooks.on('pf2eVisionerAvsBatchComplete', batch => {
      avsBatches.push({ timeMs: performance.now() - start, kind: 'orchestrator',
        changedTokens: batch?.changedTokens?.length ?? 0, allTokens: batch?.allTokens?.length ?? 0,
        uniqueUpdates: Number(batch?.uniqueUpdateCount ?? 0), performance: batch?.performance ?? null });
    });
    const lightingRefreshHook = Hooks.on('lightingRefresh', () => {
      avsBatches.push({ timeMs: performance.now() - start, kind: 'lighting-refresh' });
    });
    const beforeCount = renderer.listenerCount('prerender'), afterCount = renderer.listenerCount('postrender');
    renderer.on('prerender', before); renderer.on('postrender', after);
    document.addEventListener('visibilitychange', visibility);
    state.promise = new Promise(resolve => {
      let stopped = false;
      const timer = setTimeout(() => state.stop(), 4000);
      state.stop = () => {
        if (stopped) return; stopped = true; clearTimeout(timer);
        renderer.off('prerender', before); renderer.off('postrender', after);
        document.removeEventListener('visibilitychange', visibility);
        Hooks.off('pf2e-visioner.batchComplete', stateManagerBatchHook);
        Hooks.off('pf2eVisionerAvsBatchComplete', orchestratorBatchHook);
        Hooks.off('lightingRefresh', lightingRefreshHook);
        resolve({ timestamps, durationMs: performance.now() - start, hidden: state.hidden, cap, distinctPositions: positions.size,
          avsBatches, balanced: stack.length === 0,
          listenersRestored: renderer.listenerCount('prerender') === beforeCount && renderer.listenerCount('postrender') === afterCount });
      };
    });
    return { cap, configuredCap: game.settings.get('core', 'maxFPS'), tickerMaxFps: canvas.app.ticker.maxFPS,
      performanceMode: game.settings.get('core', 'performanceMode'), maximumMode: CONST.CANVAS_PERFORMANCE_MODES.MAX,
      rendererType: renderer.type, width: renderer.screen.width, height: renderer.screen.height, resolution: renderer.resolution,
      devicePixelRatio, hardwareConcurrency: navigator.hardwareConcurrency, userAgent: navigator.userAgent };
  }, { f: c.fixture, runId: c.runId });
}

async function combatActivationFps(c) {
  const workload = await preparePerformanceFixture(c, 30, true);
  await c.setting('avsOnlyInCombat', true);
  await c.setting('autoVisibilityEnabled', true);
  await c.mutate('combat', { start: false });
  const encounter = await c.gm.evaluate(async ({ f, runId }) => {
    const combat = game.combats.find(item => item.scene?.id === f.scene && item.getFlag('pf2e-visioner', 'liveTestRun') === runId);
    if (!combat || combat.started) throw Error('Owned inactive QA encounter required');
    const existing = new Set(combat.combatants.map(item => item.tokenId));
    const missing = canvas.scene.tokens.filter(token => !existing.has(token.id)).map(token => ({
      tokenId: token.id, actorId: token.actorId, sceneId: f.scene,
    }));
    if (missing.length) await combat.createEmbeddedDocuments('Combatant', missing);
    return { id: combat.id, combatants: combat.combatants.size, started: combat.started };
  }, { f: c.fixture, runId: c.runId });
  c.equal(encounter.combatants, workload.tokens, 'All performance tokens joined native encounter');
  for (const page of [c.gm, c.player]) await c.rpc(page, 'viewEncounter', c.fixture);
  const preCombatGate = await c.gm.evaluate(async () => {
    const { autoVisibilitySystem } = await import('/modules/pf2e-visioner/scripts/visibility/auto-visibility/index.js');
    return autoVisibilitySystem.getDiagnostics().processingAllowed;
  });
  c.equal(preCombatGate, false, 'AVS combat gate stays closed before encounter starts');

  const failures = [];
  const measure = async (phase, action) => {
    await c.player.bringToFront();
    await c.player.waitForTimeout(1000);
    await startSample(c.gm, c);
    const browser = await startSample(c.player, c);
    await action();
    await Promise.all([c.gm, c.player].map(page => page.evaluate(() => globalThis.visionerQaFps.promise)));
    const [gmRaw, raw] = await Promise.all([stopSample(c.gm), stopSample(c.player)]);
    const frameSummary = summarizeRenderedFrames(raw);
    const measurement = { ...frameSummary, renderBudgetPassed: frameSummary.passed,
      browser, workload, encounter, role: 'player', phase,
      avsBatches: gmRaw.avsBatches,
      avsBatchCount: gmRaw.avsBatches.filter(batch => batch.kind === 'orchestrator').length,
      avsChangedTokens: gmRaw.avsBatches.filter(batch => batch.kind === 'orchestrator')
        .reduce((sum, batch) => sum + batch.changedTokens, 0),
      distinctPositions: raw.distinctPositions, listenersRestored: raw.listenersRestored, balanced: raw.balanced };
    const enforceRenderBudget = !['combat-start', 'gm-condition-scope'].includes(phase);
    measurement.passed = (!enforceRenderBudget || frameSummary.passed) && raw.listenersRestored && raw.balanced &&
      (phase !== 'gm-movement' || raw.distinctPositions >= 3);
    c.evidence.push({ label: `player-${phase}-combat-avs-fps`, measurement, status: measurement.passed ? 'passed' : 'failed' });
    if (!measurement.passed) failures.push({ phase, measurement });
    return measurement;
  };

  try {
    const idle = await measure('pre-combat-idle', () => Promise.resolve());
    c.equal(idle.avsBatchCount, 0, 'No completed AVS batches before combat gate opens');
    const start = await measure('combat-start', () => c.mutate('combat-start'));
    const activeGate = await c.gm.evaluate(async () => {
      const { autoVisibilitySystem } = await import('/modules/pf2e-visioner/scripts/visibility/auto-visibility/index.js');
      return autoVisibilitySystem.getDiagnostics().processingAllowed;
    });
    c.equal(activeGate, true, 'AVS combat gate opens after encounter starts');
    const fullStartBatch = start.avsBatchCount >= 1 && start.avsChangedTokens >= workload.tokens;
    c.evidence.push({ label: 'Combat start completes full-scene AVS work during measured window',
      actual: fullStartBatch, expected: true, measurement: { avsBatches: start.avsBatches },
      status: fullStartBatch ? 'passed' : 'failed' });
    const queuedAt = start.avsBatches.find(batch => batch.kind === 'state-manager')?.timeMs;
    const completedAt = start.avsBatches.find(batch => batch.kind === 'orchestrator')?.timeMs;
    const activationLatencyMs = completedAt - queuedAt;
    c.assert(
      Number.isFinite(activationLatencyMs) && activationLatencyMs <= 150,
      `Combat-start AVS batch exceeds 150 ms: ${activationLatencyMs}`,
    );
    const movement = await measure('gm-movement', () => c.gm.evaluate(async ({ f, runId }) => {
      if (!game.user.isGM || canvas.scene?.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned GM fixture required');
      const target = canvas.tokens.get(f.target);
      target.control({ releaseOthers: true });
      for (const x of [1000, 800, 1000, 800]) {
        await target.document.update({ x }, { animate: true, animation: { duration: 700 } });
        await new Promise(resolve => setTimeout(resolve, 850));
      }
    }, { f: c.fixture, runId: c.runId }));
    const movementBatches = movement.avsBatches.filter(batch => batch.kind === 'orchestrator');
    c.equal(movementBatches.length, 4, 'Each completed GM move produces one AVS batch');
    c.assert(
      movementBatches.every(batch => batch.changedTokens === 1),
      `GM movement stays mover-scoped: ${JSON.stringify(movementBatches)}`,
    );
    c.assert(
      movementBatches.every(batch => Number.isFinite(batch.performance?.totalMs) &&
        batch.performance?.detailedBreakdown && batch.performance?.cacheBreakdown),
      `GM movement exposes AVS timing telemetry: ${JSON.stringify(movementBatches)}`,
    );
    const condition = await measure('gm-condition-scope', async () => {
      await c.mutate('condition', 'blinded');
      await c.gm.waitForTimeout(600);
      await c.mutate('condition', 'blinded');
      await c.gm.waitForTimeout(600);
    });
    const conditionBatches = condition.avsBatches.filter(batch => batch.kind === 'orchestrator');
    c.assert(conditionBatches.length >= 1, 'Native condition toggle completes AVS work');
    c.assert(
      conditionBatches.every(batch => batch.changedTokens === 1),
      `Native condition AVS work stays actor-token scoped: ${JSON.stringify(conditionBatches)}`,
    );
    await measure('gm-native-rolls', () => c.gm.evaluate(async ({ f, runId }) => {
      if (!game.user.isGM || canvas.scene?.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned GM fixture required');
      const target = canvas.tokens.get(f.target);
      target.control({ releaseOthers: true });
      const save = target.actor.saves?.fortitude ?? Object.values(target.actor.saves ?? {})[0];
      if (!save?.roll) throw Error('PF2e native save required');
      for (let index = 0; index < 6; index++) {
        await save.roll({ dc: { value: 20 }, skipDialog: true, event: new MouseEvent('click', { shiftKey: true }) });
        await new Promise(resolve => setTimeout(resolve, 450));
      }
    }, { f: c.fixture, runId: c.runId }));
    await c.check({ visible: true, targetX: 800 }, true, 'combat-avs-final-player-art');
  } finally {
    const cleanup = await Promise.allSettled([stopSample(c.gm), stopSample(c.player)]);
    c.assert(cleanup.every(result => result.status === 'fulfilled'), 'Combat AVS frame samplers cleaned up');
  }
  c.assert(!failures.length, `Combat AVS FPS budgets failed: ${JSON.stringify(failures)}`);
}

export async function stopSample(page) {
  return page.evaluate(async () => {
    const s = globalThis.visionerQaFps;
    if (!s) return null;
    s.stop(); const result = await s.promise; delete globalThis.visionerQaFps; return result;
  });
}

async function renderedCanvasPanFps(c, avs) {
  const workload = await preparePerformanceFixture(c, 100, true);
  await c.setting('autoVisibilityEnabled', avs);
  await c.gm.waitForFunction(async () => {
    const { autoVisibilitySystem } = await import('/modules/pf2e-visioner/scripts/visibility/auto-visibility/index.js');
    const d = autoVisibilitySystem.getDiagnostics();
    return !d.processingBatch && !d.stateManagerProcessing && !d.pendingTokens.length;
  });
  await c.gm.bringToFront();
  await c.gm.waitForTimeout(1000);
  let profiler;
  try {
    if (process.env.VISIONER_FPS_PROFILE === '1') {
      profiler = await c.gm.context().newCDPSession(c.gm);
      await profiler.send('Profiler.enable');
      await profiler.send('Profiler.start');
    }
    const browser = await startSample(c.gm, c);
    const pan = await c.gm.evaluate(async ({ f, runId }) => {
      if (!game.user.isGM || canvas.scene?.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) {
        throw Error('Owned GM fixture required');
      }
      let events = 0;
      const hook = Hooks.on('canvasPan', () => events++);
      const start = performance.now();
      try {
        for (const x of [1200, 600, 1200, 600]) {
          await canvas.animatePan({ x, y: 700, duration: 700 });
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } finally {
        Hooks.off('canvasPan', hook);
      }
      return { events, durationMs: performance.now() - start };
    }, { f: c.fixture, runId: c.runId });
    await c.gm.evaluate(() => globalThis.visionerQaFps.promise);
    const raw = await stopSample(c.gm);
    const measurement = { ...summarizeRenderedFrames(raw), browser, workload, role: 'gm', phase: 'canvas-pan', avs,
      panEvents: pan.events, panDurationMs: pan.durationMs, avsBatches: raw.avsBatches,
      listenersRestored: raw.listenersRestored, balanced: raw.balanced };
    measurement.passed &&= pan.events >= 4 && raw.listenersRestored && raw.balanced;
    c.evidence.push({ label: `gm-canvas-pan-rendered-fps`, measurement, status: measurement.passed ? 'passed' : 'failed' });
    c.assert(measurement.passed, `Canvas pan FPS budget: ${JSON.stringify(measurement)}`);
  } finally {
    if (profiler) {
      try {
        const { profile } = await profiler.send('Profiler.stop');
        await mkdir(`artifacts/live/${c.runId}`, { recursive: true });
        await writeFile(`artifacts/live/${c.runId}/fps-canvas-pan-100-${avs ? 'on' : 'off'}.cpuprofile`, JSON.stringify(profile));
      } finally { await profiler.detach(); }
    }
    await stopSample(c.gm);
  }
}

async function renderedFps(c, lights, avs, count = 30) {
  const profilePhase = process.env.VISIONER_FPS_PROFILE_PHASE ?? 'movement-1';
  if (process.env.VISIONER_FPS_PROFILE === '1' && !['idle', 'movement-1', 'movement-2', 'movement-3'].includes(profilePhase)) {
    throw Error('FPS profile phase must be idle or movement-1 through movement-3');
  }
  if (process.env.VISIONER_FPS_MAXIMUM === '1') {
    for (const page of [c.gm, c.player]) {
      for (const key of ['maxFPS', 'performanceMode']) {
        await page.waitForFunction(() => canvas.ready && !canvas.loading);
        await page.evaluate(async ({ key, f, runId }) => {
          if (canvas.scene?.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA canvas required');
          await game.settings.set('core', key, key === 'maxFPS' ? 60 : CONST.CANVAS_PERFORMANCE_MODES.MAX);
        }, { key, f: c.fixture, runId: c.runId });
      }
      await page.waitForFunction(() => canvas.ready && !canvas.loading && canvas.performance.mode === CONST.CANVAS_PERFORMANCE_MODES.MAX && canvas.app.ticker.maxFPS === 0);
    }
  }
  const workload = await preparePerformanceFixture(c, count, lights);
  await c.setting('autoVisibilityEnabled', avs);
  await c.gm.waitForFunction(async () => {
    const { autoVisibilitySystem } = await import('/modules/pf2e-visioner/scripts/visibility/auto-visibility/index.js');
    const d = autoVisibilitySystem.getDiagnostics();
    return !d.processingBatch && !d.stateManagerProcessing && !d.pendingTokens.length;
  });
  const failures = [], cleanupFailures = [];
  try {
    for (const [role, page] of [['gm', c.gm], ['player', c.player]]) {
      await page.bringToFront();
      // Warm-up and focus settling are outside all measured windows.
      await page.waitForTimeout(1000);
      for (const phase of ['idle', 'movement-1', 'movement-2', 'movement-3']) {
        let profiler;
        try {
        if (process.env.VISIONER_FPS_PROFILE === '1' && role === 'gm' && phase === profilePhase) {
          profiler = await page.context().newCDPSession(page);
          await profiler.send('Profiler.enable');
          await profiler.send('Profiler.start');
        }
        const browser = await startSample(page, c);
        if (phase !== 'idle') await c.gm.evaluate(async ({ f, runId }) => {
          if (!game.user.isGM || canvas.scene.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned GM fixture required');
          const target = canvas.tokens.get(f.target);
          if (target.document.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned target required');
          for (const x of [1000, 800, 1000, 800]) {
            await target.document.update({ x }, { animate: true, animation: { duration: 800 } });
            await new Promise(resolve => setTimeout(resolve, 900));
          }
        }, { f: c.fixture, runId: c.runId });
        await page.evaluate(() => globalThis.visionerQaFps.promise);
        const raw = await stopSample(page);
        const measurement = { ...summarizeRenderedFrames(raw), browser, workload, role, phase, avs,
          distinctPositions: raw.distinctPositions, listenersRestored: raw.listenersRestored, balanced: raw.balanced };
        measurement.passed &&= raw.listenersRestored && raw.balanced && (phase === 'idle' || raw.distinctPositions >= 3);
        c.evidence.push({ label: `${role}-${phase}-rendered-fps`, measurement, status: measurement.passed ? 'passed' : 'failed' });
        if (!measurement.passed) failures.push({ role, phase, measurement });
        } finally {
          if (profiler) {
            try {
              const { profile } = await profiler.send('Profiler.stop');
              await mkdir(`artifacts/live/${c.runId}`, { recursive: true });
              const suffix = phase === 'movement-1' ? '' : `-${phase}`;
              await writeFile(`artifacts/live/${c.runId}/fps-${count}-${avs ? 'on' : 'off'}${suffix}.cpuprofile`, JSON.stringify(profile));
            } finally { await profiler.detach(); }
          }
        }
      }
      await c.check({ state: 'observed', visible: true, targetX: 800 }, true, `${role}-fps-final-art`, { session: role });
    }
  } finally {
    const cleanup = await Promise.allSettled([stopSample(c.gm), stopSample(c.player)]);
    cleanupFailures.push(...cleanup.filter(r => r.status === 'rejected').map(r => r.reason));
  }
  c.assert(cleanupFailures.length === 0, `FPS sampler cleanup: ${cleanupFailures.map(String).join('; ')}`);
  c.assert(failures.length === 0, `Rendered FPS budgets: ${JSON.stringify(failures)}`);
}
