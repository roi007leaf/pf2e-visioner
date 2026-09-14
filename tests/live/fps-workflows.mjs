import { preparePerformanceFixture, timingSummary } from './performance-workflows.mjs';

export function summarizeRenderedFrames({ timestamps, durationMs, hidden, cap }) {
  if (!Number.isFinite(durationMs) || durationMs < 3000 || !Number.isFinite(cap) || cap <= 0 ||
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
    hidden, cap, limits: { minAverageFps: Math.min(30, cap * 0.75), maxP95FrameMs: Math.max(50, 2000 / cap), maxGapMs: 250 } };
  result.passed = !hidden && result.averageFps >= result.limits.minAverageFps &&
    result.p95FrameMs <= result.limits.maxP95FrameMs && result.worstGapMs <= result.limits.maxGapMs;
  return result;
}

export const fpsCases = [false, true].flatMap(lights => [false, true].map(avs => ({
  name: `fps-30${lights ? '-lights' : ''}-avs-${avs ? 'on' : 'off'}`, area: 'performance',
  disposableWorld: true, secondObserver: true, settings: ['autoVisibilityEnabled', 'avsOnlyInCombat'],
  camera: { x: 900, y: 700, scale: 0.7 }, steps: [{ workflow: `fps-30${lights ? '-lights' : ''}-avs-${avs ? 'on' : 'off'}` }],
})));
fpsCases.push(...[false, true].map(avs => ({
  name: `fps-100-lights-avs-${avs ? 'on' : 'off'}`, area: 'performance',
  disposableWorld: true, secondObserver: true, settings: ['autoVisibilityEnabled', 'avsOnlyInCombat'],
  camera: { x: 900, y: 700, scale: 0.7 }, steps: [{ workflow: `fps-100-lights-avs-${avs ? 'on' : 'off'}` }],
})));
export const fpsWorkflows = Object.fromEntries(fpsCases.map(test => [test.name, c => renderedFps(c, test.name.includes('-lights'), test.name.endsWith('-on'), test.name.startsWith('fps-100') ? 100 : 30)]));

export async function startSample(page, c) {
  return page.evaluate(({ f, runId }) => {
    if (canvas.scene?.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA canvas required');
    if (globalThis.visionerQaFps) throw Error('Previous FPS sampler was not cleaned up');
    const renderer = canvas.app.renderer;
    if (!renderer.on || !renderer.off || !('renderingToScreen' in renderer)) throw Error('Supported PIXI render events required');
    const cap = Math.min(game.settings.get('core', 'maxFPS') || 60, 60);
    const stack = [], timestamps = [], positions = new Set(), start = performance.now();
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
        resolve({ timestamps, durationMs: performance.now() - start, hidden: state.hidden, cap, distinctPositions: positions.size,
          balanced: stack.length === 0, listenersRestored: renderer.listenerCount('prerender') === beforeCount && renderer.listenerCount('postrender') === afterCount });
      };
    });
    return { cap, configuredCap: game.settings.get('core', 'maxFPS'), tickerMaxFps: canvas.app.ticker.maxFPS,
      rendererType: renderer.type, width: renderer.screen.width, height: renderer.screen.height, resolution: renderer.resolution,
      devicePixelRatio, hardwareConcurrency: navigator.hardwareConcurrency, userAgent: navigator.userAgent };
  }, { f: c.fixture, runId: c.runId });
}

export async function stopSample(page) {
  return page.evaluate(async () => {
    const s = globalThis.visionerQaFps;
    if (!s) return null;
    s.stop(); const result = await s.promise; delete globalThis.visionerQaFps; return result;
  });
}

async function renderedFps(c, lights, avs, count = 30) {
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
