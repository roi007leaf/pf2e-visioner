import { readFileSync } from 'node:fs';
const area = JSON.parse(
  readFileSync(new URL('../../docs/examples/autumns-leaves/in-area.json', import.meta.url), 'utf8'),
);
const caster = JSON.parse(
  readFileSync(new URL('../../docs/examples/autumns-leaves/caster.json', import.meta.url), 'utf8'),
);
export const autumnLeavesCases = [
  {
    name: 'regression-generic-visibility-replacements',
    area: 'rule-elements',
    disposableWorld: true,
    senses: [],
    steps: [{ workflow: 'regression-generic-visibility-replacements' }],
  },
  {
    name: 'regression-autumn-leaves-aura',
    area: 'rule-elements',
    disposableWorld: true,
    secondObserver: true,
    senses: [],
    settings: ['core.scrollingStatusText'],
    steps: [{ workflow: 'regression-autumn-leaves-aura' }],
  },
];
export const autumnLeavesWorkflows = {
  'regression-generic-visibility-replacements': async (c) => {
    const operation = (source, direction, toState, priority, extra = {}) => ({
      type: 'overrideVisibility',
      observers: 'all',
      source,
      direction,
      fromStates: ['observed'],
      toState,
      priority,
      ...extra,
    });
    const pair = async (reverse, state, label) => {
      for (const page of [c.gm, c.player])
        await page.waitForFunction(
          async ({ f, reverse, state }) => {
            const { getVisibilityBetween } = await import(
              '/modules/pf2e-visioner/scripts/stores/visibility-map.js'
            );
            const a = canvas.tokens.get(reverse ? f.target : f.observer);
            const b = canvas.tokens.get(reverse ? f.observer : f.target);
            return getVisibilityBetween(a, b) === state;
          },
          { f: c.fixture, reverse, state },
          { timeout: 10000 },
        );
      c.assert(true, label);
    };
    const high = operation('generic-high', 'from', 'hidden', 300);
    const low = operation('generic-low', 'from', 'concealed', 100);
    await c.mutate('effect-add', { id: 'high', operations: [high] });
    await c.check({ state: 'hidden' }, false, 'high-priority-replacement-applied');
    await c.mutate('effect-add', { id: 'low', operations: [low] });
    await c.check({ state: 'hidden' }, false, 'later-low-priority-effect-does-not-overwrite-high');
    await c.mutate('effect-edit', { id: 'high', operations: [{ ...high, direction: 'to' }] });
    await c.check(
      { state: 'concealed' },
      true,
      'direction-edit-preserves-independent-incoming-source',
    );
    await pair(true, 'hidden', 'edited-outgoing-source-coexists');
    await c.mutate('effect-delete', { id: 'high' });
    await c.mutate('target-token', { x: 900 });
    await pair(true, 'observed', 'removal-cleans-only-edited-direction');
    await c.check({ state: 'concealed' }, true, 'independent-effect-survives-other-item-removal');
    await c.mutate('effect-add', { id: 'high', operations: [{ ...high, range: 1 }] });
    await c.check({ state: 'concealed' }, true, 'unmatched-high-priority-range-does-not-block-low');
    await c.mutate('effect-delete', { id: 'high' });
    await c.mutate('target-condition', 'invisible');
    await c.check({ state: 'hidden' }, false, 'generic-concealment-preserves-invisibility');
    await c.mutate('target-condition', 'invisible');
    await c.check({ state: 'concealed' }, true, 'generic-concealment-restored');
    await c.gm.evaluate(async f => canvas.tokens.get(f.target).document.unsetFlag('pf2e-visioner', 'visibilityReplacement'), c.fixture);
    await c.mutate('target-token', { x: 1000 });
    await c.check({ state: 'concealed' }, true, 'stacked-source-works-without-legacy-mirror');
    await c.mutate('effect-delete', { id: 'low' });
    await c.check({ state: 'observed' }, true, 'last-independent-effect-removal-restores-art');
    await c.mutate('effect-add', { id: 'both-directions', operations: [low, { ...low, source: 'generic-outgoing', direction: 'to' }] });
    const nativeCount = await c.gm.evaluate(f => canvas.tokens.get(f.target).actor.itemTypes.effect.find(i => i.rules.some(r => r.key === 'PF2eVisionerEffect')).rules.find(r => r.key === 'PF2eVisionerEffect').smartMergeOperations().length, c.fixture);
    c.equal(nativeCount, 2, 'native-application-keeps-both-directions-in-one-rule');
    await pair(true, 'concealed', 'single-rule-outgoing-replacement');
    await c.check({ state: 'concealed' }, true, 'single-rule-incoming-replacement');
    await c.mutate('effect-delete', { id: 'both-directions' });
    await c.check({ state: 'observed' }, true, 'single-rule-cleanup');
  },
  'regression-autumn-leaves-aura': async (c) => {
    const previousScene = await c.gm.evaluate(() => game.scenes.active?.id ?? null);
    try {
      await c.gm.evaluate(
        async ({ f, runId }) => {
          if (game.scenes.get(f.scene)?.getFlag('pf2e-visioner', 'liveTestRun') !== runId)
            throw Error('Owned QA scene required');
          await game.scenes.get(f.scene).activate();
        },
        { f: c.fixture, runId: c.runId },
      );
      await c.setting('core.scrollingStatusText', false);
      const item = await c.gm.evaluate(
        async ({ f, runId, area, caster }) => {
          if (!game.user.isGM || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId)
            throw Error('Owned QA scene required');
          await canvas.scene.updateEmbeddedDocuments(
            'Token',
            [
              { _id: f.target, x: 600 },
              { _id: f.secondObserver, x: 1200, y: 500 },
            ],
            { animate: false },
          );
          const source = await Item.create({
            ...area,
            flags: { 'pf2e-visioner': { liveTestRun: runId } },
          });
          caster.system.rules.find((r) => r.key === 'Aura').effects[0].uuid = source.uuid;
          const [effect] = await canvas.tokens
            .get(f.observer)
            .actor.createEmbeddedDocuments('Item', [caster]);
          for (const aura of canvas.tokens.get(f.observer).document.auras.values())
            await aura.notifyActors();
          return effect.id;
        },
        { f: c.fixture, runId: c.runId, area, caster },
      );
      const pair = async (observer, target, state, label) => {
        for (const page of [c.gm, c.player])
          await page.waitForFunction(
            async ({ observer, target, state }) => {
              const { getVisibilityBetween } = await import(
                '/modules/pf2e-visioner/scripts/stores/visibility-map.js'
              );
              return (
                getVisibilityBetween(canvas.tokens.get(observer), canvas.tokens.get(target)) ===
                state
              );
            },
            { observer, target, state },
            { timeout: 10000 },
          );
        c.assert(true, label);
      };
      const { observer: owner, target: inside, secondObserver: outside } = c.fixture;
      await c.gm.waitForFunction(
        (f) =>
          canvas.tokens
            .get(f.target)
            .actor.itemTypes.effect.some((i) => i.slug === 'autumn-leaves-within'),
        c.fixture,
        { timeout: 15000 },
      );
      await pair(owner, inside, 'observed', 'caster-ignores-only-leaves');
      await pair(outside, inside, 'concealed', 'outsider-sees-leaves-concealment');
      await pair(inside, outside, 'concealed', 'inside-sees-outside-concealed');
      await pair(outside, owner, 'concealed', 'outsider-sees-caster-concealed');
      await c.gm.evaluate(async f => {
        const token = canvas.tokens.get(f.target);
        const effect = token.actor.itemTypes.effect.find(i => i.slug === 'autumn-leaves-within');
        await effect.update({ name: effect.name + ' edited', 'system.rules': effect.toObject().system.rules.slice().reverse() });
      }, c.fixture);
      await pair(inside, outside, 'concealed', 'native-rule-reapplication-preserves-to');
      await pair(outside, inside, 'concealed', 'native-rule-reapplication-preserves-from');
      await c.check({ state: 'observed' }, true, 'caster-sees-inside-art');
      await c.mutate('target-condition', 'invisible');
      await pair(owner, inside, 'hidden', 'caster-does-not-ignore-invisibility');
      await pair(outside, inside, 'hidden', 'leaves-do-not-downgrade-invisibility');
      await c.check({ state: 'hidden' }, false, 'invisible-inside-art-hidden');
      await c.mutate('target-condition', 'invisible');
      await pair(outside, inside, 'concealed', 'leaves-restored-after-invisibility-removal');
      await c.mutate('target-token', { x: 1000 });
      await c.gm.waitForFunction(
        (f) =>
          !canvas.tokens
            .get(f.target)
            .actor.itemTypes.effect.some((i) => i.slug === 'autumn-leaves-within'),
        c.fixture,
        { timeout: 15000 },
      );
      await pair(outside, inside, 'observed', 'native-aura-exit-removes-incoming-replacement');
      await pair(inside, outside, 'observed', 'native-aura-exit-removes-outgoing-replacement');
      await c.mutate('target-token', { x: 600 });
      await pair(outside, inside, 'concealed', 'native-aura-reentry-restores-from');
      await pair(inside, outside, 'concealed', 'native-aura-reentry-restores-to');
      await c.mutate('effect-add', {
        id: 'independent-mist',
        operations: [
          {
            type: 'overrideVisibility',
            direction: 'from',
            observers: 'all',
            fromStates: ['observed'],
            toState: 'concealed',
            source: 'independent-mist',
            sourceTags: ['mist'],
          },
        ],
      });
      await pair(owner, inside, 'concealed', 'caster-does-not-ignore-independent-mist');
      await c.gm.evaluate(
        async ({ f, item }) => canvas.tokens.get(f.observer).actor.items.get(item).delete(),
        { f: c.fixture, item },
      );
      await pair(outside, inside, 'concealed', 'aura-removal-preserves-independent-replacement');
      await pair(inside, outside, 'observed', 'caster-effect-removal-cleans-outgoing');
      await c.mutate('effect-delete', { id: 'independent-mist' });
      await pair(outside, inside, 'observed', 'last-replacement-removal-restores-sight');
    } finally {
      await c.gm.evaluate(async (id) => {
        if (id && game.scenes.has(id)) await game.scenes.get(id).activate();
      }, previousScene);
      for (const page of [c.gm, c.player]) {
        if (previousScene)
          await page.waitForFunction(
            (id) => canvas.ready && canvas.scene?.id === id,
            previousScene,
          );
        await page.evaluate(async (f) => game.scenes.get(f.scene).view(), c.fixture);
        await page.waitForFunction(
          (f) => canvas.ready && canvas.scene?.id === f.scene && !!canvas.tokens.get(f.observer),
          c.fixture,
        );
        await page.evaluate((f) => {
          canvas.tokens.get(f.observer).control({ releaseOthers: true });
          canvas.pan(f.camera ?? { x: 650, y: 550, scale: 1 });
        }, c.fixture);
      }
    }
  },
};
