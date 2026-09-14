export const deletionRaceCases = [{
  name: 'avs-delete-during-persistence-wait', area: 'lifecycle', disposableWorld: true,
  settings: ['autoVisibilityEnabled', 'avsOnlyInCombat'],
  steps: [{ workflow: 'avs-delete-during-persistence-wait' }],
}, {
  name: 'avs-two-gm-delete-during-batch', area: 'lifecycle', disposableWorld: true, secondGm: true,
  settings: ['autoVisibilityEnabled', 'avsOnlyInCombat'],
  steps: [{ workflow: 'avs-two-gm-delete-during-batch' }],
}];
export const deletionRaceWorkflows = {
  'avs-two-gm-delete-during-batch': async c => {
    await c.setting('avsOnlyInCombat', false);
    await c.setting('autoVisibilityEnabled', true);
    for (const page of [c.gm, c.gm2]) {
      const authority = await page.evaluate(async () => {
        const { autoVisibilitySystem } = await import('/modules/pf2e-visioner/scripts/visibility/auto-visibility/index.js');
        return { primary: game.users.activeGM.id === game.user.id, allowed: autoVisibilitySystem.getDiagnostics().processingAllowed };
      });
      c.equal(authority.allowed, authority.primary, 'Only active GM processes automatic AVS events');
    }
    await c.gm.evaluate(async ({ f, runId }) => {
      if (canvas.scene.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
      for (let i = 0; i < 30; i++) {
        const data = canvas.scene.tokens.get(f.target).toObject(); delete data._id;
        data.name = 'QA concurrent deletion'; data.x = 1300;
        const [clone] = await canvas.scene.createEmbeddedDocuments('Token', [data]);
        await clone.delete();
      }
    }, { f: c.fixture, runId: c.runId });
    for (const page of [c.gm, c.gm2]) await page.waitForFunction(async () => {
      const { autoVisibilitySystem } = await import('/modules/pf2e-visioner/scripts/visibility/auto-visibility/index.js');
      const d = autoVisibilitySystem.getDiagnostics();
      return !d.processingBatch && !d.stateManagerProcessing && !d.pendingTokens.length;
    });
    await c.check({ state: 'observed', visible: true }, true, 'two-gm-rapid-deletion-surviving-player-art');
    c.equal(await c.gm.evaluate(() => canvas.scene.tokens.size), 2, 'All transient tokens removed');
  },
  'avs-delete-during-persistence-wait': async c => {
    await c.setting('autoVisibilityEnabled', false);
    const result = await c.gm.evaluate(async ({ f, runId }) => {
      if (canvas.scene.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId) throw Error('Owned QA scene required');
      const { applyTokenFlagMapUpdates } = await import('/modules/pf2e-visioner/scripts/stores/token-flag-map-persistence.js');
      const outcomes = [];
      for (let i = 0; i < 3; i++) {
        const scene = canvas.scene, data = scene.tokens.get(f.target).toObject();
        delete data._id; data.name = 'QA deleted during write'; data.x = 1300;
        const [clone] = await scene.createEmbeddedDocuments('Token', [data]);
        let release, entered;
        const waiting = new Promise(resolve => { entered = resolve; });
        const barrier = new Promise(resolve => { release = resolve; });
        const timer = setTimeout(release, 10000);
        let pending;
        try {
          // This injected wait is the existing production movement-wait seam.
          // Actual updates are built before deletion; no writer or backend is mocked.
          pending = applyTokenFlagMapUpdates({
            entries: [{ tokenId: clone.id, map: { cycle: i } }, { tokenId: f.observer, map: { cycle: i } }],
            moduleId: 'pf2e-visioner', flagKey: 'liveRaceProbe', scene,
            waitForToken: async () => { entered(); await barrier; },
          });
          await waiting;
          await clone.delete();
          release();
          const write = await pending;
          outcomes.push({ ...write, deletedAbsent: !scene.tokens.has(clone.id),
            survivorValue: scene.tokens.get(f.observer).getFlag('pf2e-visioner', 'liveRaceProbe')?.cycle });
        } finally {
          clearTimeout(timer); release();
          await pending?.catch(() => {});
          if (scene.tokens.has(clone.id)) await clone.delete();
        }
      }
      await canvas.scene.tokens.get(f.observer).unsetFlag('pf2e-visioner', 'liveRaceProbe');
      return outcomes;
    }, { f: c.fixture, runId: c.runId });
    result.forEach((r, i) => c.assert(r.written === 1 && r.skipped === 1 && r.deletedAbsent && r.survivorValue === i,
      `Deleted token skipped; surviving write persisted: ${JSON.stringify(r)}`));
    await c.setting('avsOnlyInCombat', false);
    await c.setting('autoVisibilityEnabled', true);
    await c.gm.evaluate(async () => {
      const { autoVisibilitySystem } = await import('/modules/pf2e-visioner/scripts/visibility/auto-visibility/index.js');
      await autoVisibilitySystem.recalculateAllVisibility(true);
    });
    await c.check({ state: 'observed', visible: true }, true, 'avs-recovers-after-deleted-write-target');
  },
};
