import { performance } from 'node:perf_hooks';
import { preparePerformanceFixture, timingSummary } from './performance-workflows.mjs';

export const performanceLifecycleCases = ['cold-client-startup', 'retained-memory-soak', 'linked-effect-noop'].map(mode => ({
  name: `performance-${mode}`, area: 'performance', disposableWorld: true, secondObserver: true,
  settings: ['autoVisibilityEnabled', 'avsOnlyInCombat'],
  steps: [{ workflow: `performance-${mode}` }],
}));
export const performanceLifecycleWorkflows = {
  'performance-cold-client-startup': coldStartup,
  'performance-retained-memory-soak': memorySoak,
  'performance-linked-effect-noop': linkedEffectNoop,
};

async function linkedEffectNoop(c) {
  await preparePerformanceFixture(c, 4);
  await c.setting('autoVisibilityEnabled', false);
  const measurement = await c.gm.evaluate(async ({ f, runId }) => {
    if (!game.user.isGM || canvas.scene?.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
    const { batchUpdateVisibilityEffects, batchUpdateVisibilityEffectsForObservers } = await import('/modules/pf2e-visioner/scripts/visibility/batch.js');
    const observer = canvas.tokens.get(f.observer), target = canvas.tokens.get(f.target);
    const linked = canvas.tokens.placeables.find(t => t.id !== target.id && t.actor === target.actor);
    if (!linked || target.actor.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned linked actor required');
    const hiddenEffect = () => target.actor.itemTypes.effect.find(e => e.getFlag('pf2e-visioner', 'aggregateOffGuard') && e.getFlag('pf2e-visioner', 'visibilityState') === 'hidden');
    await batchUpdateVisibilityEffects(observer, [{ target, state: 'observed' }]);
    await batchUpdateVisibilityEffects(observer, [{ target, state: 'hidden' }]);
    const before = hiddenEffect();
    if (!before) throw Error('Native hidden effect was not created');
    const rulesBefore = JSON.stringify(before.system.rules);
    let updates = 0;
    const hook = Hooks.on('updateItem', item => { if (item.parent === target.actor) updates++; });
    let sameEffect, sameRules;
    try {
      await batchUpdateVisibilityEffects(observer, [{ target, state: 'observed' }, { target: linked, state: 'hidden' }]);
      sameEffect = hiddenEffect()?.id === before.id;
      sameRules = JSON.stringify(hiddenEffect()?.system.rules) === rulesBefore;
    } finally { Hooks.off('updateItem', hook); }
    await batchUpdateVisibilityEffects(observer, [{ target, state: 'observed' }]);
    const removedAfterObserved = !hiddenEffect();
    await batchUpdateVisibilityEffects(observer, [{ target, state: 'hidden' }]);
    const restoredAfterHidden = !!hiddenEffect();
    await batchUpdateVisibilityEffects(target, [{ target: observer, state: 'observed' }]);
    await batchUpdateVisibilityEffects(target, [{ target: observer, state: 'hidden' }]);
    const receiverEffect = () => observer.actor.itemTypes.effect.find(e => e.getFlag('pf2e-visioner', 'aggregateOffGuard') && e.getFlag('pf2e-visioner', 'visibilityState') === 'hidden');
    const aggregateId = receiverEffect()?.id;
    if (!aggregateId) throw Error('Shared observer aggregate was not created');
    let crossObserverWrites = 0;
    const hooks = ['createItem', 'updateItem', 'deleteItem'].map(name => [name, Hooks.on(name, item => {
      if (item.parent === observer.actor) crossObserverWrites++;
    })]);
    try {
      await batchUpdateVisibilityEffectsForObservers([
        { observer: target, targets: [{ target: observer, state: 'observed' }] },
        { observer: linked, targets: [{ target: observer, state: 'hidden' }] },
      ]);
    } finally { for (const [name, hook] of hooks) Hooks.off(name, hook); }
    return { updates, sameEffect, sameRules, removedAfterObserved, restoredAfterHidden,
      crossObserverWrites, crossObserverEffectPreserved: receiverEffect()?.id === aggregateId };
  }, { f: c.fixture, runId: c.runId });
  const passed = measurement.updates === 0 && measurement.sameEffect && measurement.sameRules && measurement.removedAfterObserved && measurement.restoredAfterHidden && measurement.crossObserverWrites === 0 && measurement.crossObserverEffectPreserved;
  c.evidence.push({ label: 'linked-effect-noop-native-items', measurement, status: passed ? 'passed' : 'failed' });
  c.assert(passed, `Linked effect updates: ${JSON.stringify(measurement)}`);
}

export function retainedGrowth(samples) {
  if (samples.length < 4 || samples.some(s => ['heap', 'nodes', 'listeners'].some(k => !Number.isFinite(s[k]) || s[k] < 0))) throw Error('Four valid post-GC samples required');
  const median = values => [...values].sort((a, b) => a - b)[1];
  const growth = Object.fromEntries(['heap', 'nodes', 'listeners'].map(k => [k, median(samples.slice(-3).map(s => s[k])) - samples[0][k]]));
  const limits = { heap: 32 * 1024 * 1024, nodes: 500, listeners: 100 };
  return { samples, growth, limits, passed: Object.keys(limits).every(k => growth[k] <= limits[k]) };
}

async function ready(page, c) {
  await page.waitForFunction(() => globalThis.game?.ready && game.socket?.connected &&
    game.modules.get('pf2e-visioner')?.api, null, { timeout: 90000 });
  await c.rpc(page, 'view', c.fixture);
  await page.waitForFunction(f => canvas?.ready && canvas.scene?.id === f.scene &&
    canvas.tokens.get(f.target)?.mesh, c.fixture, { timeout: 90000 });
}

async function coldStartup(c) {
  await preparePerformanceFixture(c, 30, true);
  const failures = [];
  for (const [role, page] of [['gm', c.gm], ['player', c.player]]) {
    const session = await page.context().newCDPSession(page);
    const samples = [], navigation = [];
    try {
      await session.send('Network.enable');
      await session.send('Network.setCacheDisabled', { cacheDisabled: true });
      for (let index = 0; index < 3; index++) {
        const start = performance.now();
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
        await ready(page, c);
        await page.bringToFront();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        samples.push(performance.now() - start);
        navigation.push(await page.evaluate(() => {
          const n = performance.getEntriesByType('navigation')[0];
          return { type: n?.type, domContentLoadedMs: n?.domContentLoadedEventEnd, transferSize: n?.transferSize };
        }));
        await c.check({ state: 'observed', visible: true }, true, `${role}-cold-load-${index}`, { session: role });
      }
    } finally {
      try { await session.send('Network.setCacheDisabled', { cacheDisabled: false }); }
      finally { await session.detach(); }
    }
    const measurement = { ...timingSummary(samples), navigation, role, cacheDisabled: true, limits: { medianMs: 15000, maxMs: 30000 } };
    const passed = measurement.medianMs <= 15000 && measurement.maxMs <= 30000;
    c.evidence.push({ label: `${role}-cold-client-startup`, measurement, status: passed ? 'passed' : 'failed' });
    if (!passed) failures.push(role);
  }
  c.assert(!failures.length, `Cold client startup budget: ${failures.join(', ')}`);
}

async function memorySoak(c) {
  const minutes = Number(process.env.VISIONER_LIVE_SOAK_MINUTES ?? 5);
  c.assert(Number.isFinite(minutes) && minutes >= 5 && minutes <= 120, 'Soak duration must be 5–120 minutes');
  const workload = await preparePerformanceFixture(c, 30, true);
  const clients = [];
  try {
    for (const [role, page] of [['gm', c.gm], ['player', c.player]]) {
      const session = await page.context().newCDPSession(page);
      clients.push({ role, page, session, samples: [] });
      await session.send('HeapProfiler.enable');
    }
    const sample = async () => {
      for (const client of clients) {
        await client.session.send('HeapProfiler.collectGarbage');
        const heap = await client.session.send('Runtime.getHeapUsage');
        const dom = await client.session.send('Memory.getDOMCounters');
        const visioner = await client.page.evaluate(async () => {
          const { HoverTooltips: tooltips } = await import('/modules/pf2e-visioner/scripts/services/HoverTooltips.js');
          const { TimedOverrideManager: timers } = await import('/modules/pf2e-visioner/scripts/services/TimedOverrideManager.js');
          const hooks = globalThis.Hooks.events;
          return {
            hooks: hooks && Object.keys(hooks).length ? Object.fromEntries(Object.entries(hooks).map(([key, entries]) => [key, entries.length])) : null,
            tooltipHandlers: tooltips.tokenEventHandlers.size,
            staleTooltipHandlers: [...tooltips.tokenEventHandlers.keys()].filter(id => !canvas.tokens.get(id)).length,
            visibilityIndicators: tooltips.visibilityIndicators.size,
            coverIndicators: tooltips.coverIndicators.size,
            visibilityBadges: tooltips.visibilityBadges.size,
            keyTooltipTokens: tooltips.keyTooltipTokens.size,
            factorTokens: tooltips.factorsOverlayTokens.size,
            timerCheckerActive: timers._realtimeIntervalId !== null,
            sceneTokens: canvas.scene.tokens.size,
          };
        });
        client.samples.push({ heap: heap.usedSize, nodes: dom.nodes, listeners: dom.jsEventListeners, visioner });
      }
    };
    const cycle = async index => {
      // All transient documents remain inside the journal-owned scene. If interrupted,
      // normal runner recovery removes the whole fixture, including unfinished clones.
      await c.gm.evaluate(async ({ f, runId, index }) => {
        if (!game.user.isGM || canvas.scene.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA canvas required');
        const target = canvas.tokens.get(f.target);
        const data = target.document.toObject(); delete data._id;
        data.name = `QA Soak ${index}`; data.x = 1400; data.y = 800;
        const [clone] = await canvas.scene.createEmbeddedDocuments('Token', [data]);
        try {
          await target.document.update({ x: index % 2 ? 800 : 1000 }, { animate: true, animation: { duration: 300 } });
          await target.movementAnimationPromise;
        } finally { await clone.delete(); }
      }, { f: c.fixture, runId: c.runId, index });
      await c.player.evaluate(({ f, index }) => canvas.tokens.get(index % 2 ? f.observer : f.secondObserver).control({ releaseOthers: true }), { f: c.fixture, index });
      await c.player.waitForFunction(count => canvas.scene.tokens.size === count, workload.tokens);
    };
    for (let i = 0; i < 4; i++) await cycle(i);
    await sample(); // Exclude one-time lazy initialization from retained-growth baseline.
    const start = performance.now();
    let cycles = 0;
    for (let batch = 0; batch < 6; batch++) {
      const deadline = start + (batch + 1) * minutes * 60000 / 6;
      do {
        await cycle(cycles++);
        await c.player.waitForTimeout(1000);
      } while (performance.now() < deadline);
      await c.rpc(c.player, 'view', c.fixture);
      await c.check({ state: 'observed', visible: true }, true, `soak-batch-${batch}-art`);
      await sample();
      console.log(`Soak checkpoint ${batch + 1}/6 (${cycles} cycles)`);
    }
    const failures = [];
    for (const client of clients) {
      const measurement = { ...retainedGrowth(client.samples), workload, cycles, durationMs: performance.now() - start, role: client.role };
      c.evidence.push({ label: `${client.role}-post-gc-retained-growth`, measurement, status: measurement.passed ? 'passed' : 'failed' });
      if (!measurement.passed) failures.push(client.role);
      const settledHandlersReleased = client.samples.slice(-3).every(s => s.visioner.staleTooltipHandlers === 0);
      c.evidence.push({ label: `${client.role}-settled-deleted-token-handlers`,
        samples: client.samples.map(s => s.visioner.staleTooltipHandlers),
        status: settledHandlersReleased ? 'passed' : 'failed' });
      if (!settledHandlersReleased) failures.push(`${client.role}-tooltip-handlers`);
    }
    c.assert(!failures.length, `Retained memory growth budget: ${failures.join(', ')}`);
  } finally {
    const cleanup = await Promise.allSettled(clients.map(client => client.session.detach()));
    c.assert(cleanup.every(r => r.status === 'fulfilled'), 'Memory sampler sessions detached');
  }
}
