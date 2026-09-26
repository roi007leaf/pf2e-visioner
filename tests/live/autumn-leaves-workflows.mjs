import { readFileSync } from 'node:fs';
import {
  createUtilityButtonsLabelCard,
  assertUtilityButtonsLabelSnapshot,
} from './utility-buttons-label-workflow.mjs';
const area = JSON.parse(
  readFileSync(new URL('../../docs/examples/autumns-leaves/in-area.json', import.meta.url), 'utf8'),
);
const caster = JSON.parse(
  readFileSync(new URL('../../docs/examples/autumns-leaves/caster.json', import.meta.url), 'utf8'),
);
export const autumnLeavesCases = [
  {
    name: 'regression-player-mid-turn-visibility-effect',
    area: 'rule-elements',
    disposableWorld: true,
    senses: [],
    steps: [{ workflow: 'regression-player-mid-turn-visibility-effect' }],
  },
  {
    name: 'regression-autumn-leaves-mid-turn',
    area: 'rule-elements',
    disposableWorld: true,
    secondObserver: true,
    senses: [],
    settings: ['core.scrollingStatusText'],
    steps: [{ workflow: 'regression-autumn-leaves-mid-turn' }],
  },
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
  'regression-player-mid-turn-visibility-effect': async (c) => {
    await c.mutate('combat');
    const playerId = await c.player.evaluate(() => game.user.id);
    await c.gm.evaluate(
      async ({ f, playerId }) =>
        canvas.tokens.get(f.target).actor.update({ [`ownership.${playerId}`]: 3 }),
      { f: c.fixture, playerId },
    );
    await c.player.waitForFunction((f) => canvas.tokens.get(f.target).actor.isOwner, c.fixture);
    const turn = await c.gm.evaluate(() => ({ round: game.combat.round, turn: game.combat.turn }));
    const id = await c.player.evaluate(
      async ({ f, area, runId }) => {
        if (canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId)
          throw Error('Owned QA scene required');
        const [item] = await canvas.tokens
          .get(f.target)
          .actor.createEmbeddedDocuments('Item', [
            { ...area, flags: { 'pf2e-visioner': { liveTestRun: runId } } },
          ]);
        return item.id;
      },
      { f: c.fixture, area, runId: c.runId },
    );
    await c.check(
      { state: 'concealed', reverseState: 'concealed' },
      true,
      'player-applied-effect-refreshes-both-directions-mid-turn',
    );
    c.equal(
      await c.gm.evaluate(() => ({ round: game.combat.round, turn: game.combat.turn })),
      turn,
      'player-effect-does-not-need-turn-advance',
    );
    await c.player.evaluate(
      async ({ f, id }) => canvas.tokens.get(f.target).actor.items.get(id).delete(),
      { f: c.fixture, id },
    );
    await c.check(
      { state: 'observed', reverseState: 'observed' },
      true,
      'player-effect-removal-refreshes-mid-turn',
    );
  },
  'regression-autumn-leaves-mid-turn': async (c) => {
    c.autumnMidTurn = true;
    await autumnLeavesWorkflows['regression-autumn-leaves-aura'](c);
  },
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
    const low = operation('generic-low', 'from', 'concealed', 100, { label: 'Low mist' });
    await c.mutate('effect-add', { id: 'high', label: 'High mist', operations: [high] });
    await c.check({ state: 'hidden' }, false, 'high-priority-replacement-applied');
    await c.mutate('effect-add', { id: 'low', operations: [low] });
    await c.check({ state: 'hidden' }, false, 'later-low-priority-effect-does-not-overwrite-high');
    const labels = async (reverse = false) =>
      c.gm.evaluate(
        async ({ f, reverse }) => {
          const { Pf2eVisionerApi } = await import('/modules/pf2e-visioner/scripts/api.js');
          return (
            await Pf2eVisionerApi.getVisibilityFactors(
              reverse ? f.target : f.observer,
              reverse ? f.observer : f.target,
            )
          ).reasons;
        },
        { f: c.fixture, reverse },
      );
    c.assert((await labels()).includes('High mist'), 'RE-label-reaches-public-factor-API');
    c.assert(!(await labels()).includes('Low mist'), 'losing-source-label-excluded');
    const utilityEnabled = await c.gm.evaluate(
      () => game.modules.get('pf2e-flatcheck-helper')?.active,
    );
    const utilityCard = utilityEnabled
      ? await createUtilityButtonsLabelCard(c.gm, c.fixture, c.runId, 'High mist')
      : null;

    await c.mutate('effect-edit', {
      id: 'high',
      label: 'Edited mist',
      operations: [{ ...high, direction: 'to' }],
    });
    await c.check(
      { state: 'concealed' },
      true,
      'direction-edit-preserves-independent-incoming-source',
    );
    await pair(true, 'hidden', 'edited-outgoing-source-coexists');
    c.assert((await labels()).includes('Low mist'), 'operation-label-reaches-API');
    c.assert(!(await labels()).includes('Edited mist'), 'opposite-direction-label-excluded');
    c.assert((await labels(true)).includes('Edited mist'), 'RE-label-edit-refreshes-without-turn');
    if (utilityEnabled) {
      await createUtilityButtonsLabelCard(c.gm, c.fixture, c.runId, 'Low mist');
      await createUtilityButtonsLabelCard(c.gm, c.fixture, c.runId, 'Edited mist', true);
    }

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
    await c.gm.evaluate(
      async (f) =>
        canvas.tokens.get(f.target).document.unsetFlag('pf2e-visioner', 'visibilityReplacement'),
      c.fixture,
    );
    await c.mutate('target-token', { x: 1000 });
    await c.check({ state: 'concealed' }, true, 'stacked-source-works-without-legacy-mirror');
    await c.mutate('effect-delete', { id: 'low' });
    await c.check({ state: 'observed' }, true, 'last-independent-effect-removal-restores-art');
    await c.mutate('effect-add', {
      id: 'both-directions',
      operations: [low, { ...low, source: 'generic-outgoing', direction: 'to' }],
    });
    const nativeCount = await c.gm.evaluate(
      (f) =>
        canvas.tokens
          .get(f.target)
          .actor.itemTypes.effect.find((i) => i.rules.some((r) => r.key === 'PF2eVisionerEffect'))
          .rules.find((r) => r.key === 'PF2eVisionerEffect')
          .smartMergeOperations().length,
      c.fixture,
    );
    c.equal(nativeCount, 2, 'native-application-keeps-both-directions-in-one-rule');
    await pair(true, 'concealed', 'single-rule-outgoing-replacement');
    await c.check({ state: 'concealed' }, true, 'single-rule-incoming-replacement');
    await c.mutate('effect-delete', { id: 'both-directions' });
    await c.check({ state: 'observed' }, true, 'single-rule-cleanup');
    await c.mutate('effect-add', {
      id: 'direct-label',
      label: 'Custom direct label',
      operations: [
        { type: 'overrideVisibility', direction: 'from', state: 'hidden', observers: 'all' },
      ],
    });
    await c.check({ state: 'hidden' }, false, 'direct-label-state');
    c.assert((await labels()).includes('Custom direct label'), 'direct-override-label-reaches-API');
    await c.gm.waitForFunction(
      (f) =>
        canvas.tokens.get(f.target).document.getFlag('pf2e-visioner', 'ruleElementOverride')
          ?.label === 'Custom direct label',
      c.fixture,
      { timeout: 10000 },
    );
    await c.mutate('effect-edit', {
      id: 'direct-label',
      operations: [
        { type: 'overrideVisibility', direction: 'from', state: 'hidden', observers: 'all' },
      ],
    });
    const fallback = await c.gm.evaluate(() =>
      game.i18n.localize('PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.RULE_ELEMENT_OVERRIDE'),
    );
    await c.gm.waitForFunction(
      async ({ f, fallback }) => {
        const { Pf2eVisionerApi } = await import('/modules/pf2e-visioner/scripts/api.js');
        const factors = await Pf2eVisionerApi.getVisibilityFactors(f.observer, f.target);
        return (
          factors?.reasons.includes(fallback) && !factors.reasons.includes('Custom direct label')
        );
      },
      { f: c.fixture, fallback },
      { timeout: 10000 },
    );
    await c.gm.waitForFunction(
      (f) =>
        canvas.tokens.get(f.target).document.getFlag('pf2e-visioner', 'ruleElementOverride')
          ?.label === null,
      c.fixture,
      { timeout: 10000 },
    );
    const finalReasons = await labels();
    c.assert(
      finalReasons.includes(fallback),
      'removed-label-restores-localized-fallback: ' + JSON.stringify(finalReasons),
    );
    c.assert(!(await labels()).includes('Custom direct label'), 'removed-label-no-longer-reported');
    await c.mutate('effect-delete', { id: 'direct-label' });
    if (utilityCard) {
      await assertUtilityButtonsLabelSnapshot(c.gm, utilityCard, 'High mist');
      await c.gm.locator('.fc-flatcheck-buttons').last().hover();
      await c.gm
        .locator('.fc-flatcheck-buttons')
        .last()
        .screenshot({
          path: `artifacts/live/${c.runId}/utility-buttons-label.png`,
        });
      c.assert(true, 'utility-buttons-rendered-labels-and-roll-snapshot');
    }
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
      if (c.autumnMidTurn) {
        const playerId = await c.player.evaluate(() => game.user.id);
        await c.gm.evaluate(
          async ({ f, playerId }) =>
            canvas.tokens.get(f.target).actor.update({ [`ownership.${playerId}`]: 3 }),
          { f: c.fixture, playerId },
        );
      }
      if (c.autumnMidTurn) await c.mutate('combat');
      const combatState = c.autumnMidTurn
        ? await c.gm.evaluate(() => ({ round: game.combat.round, turn: game.combat.turn }))
        : null;
      const item = await c.gm.evaluate(
        async ({ f, runId, area, caster, midTurn }) => {
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
          if (!midTurn)
            for (const aura of canvas.tokens.get(f.observer).document.auras.values())
              await aura.notifyActors();
          return effect.id;
        },
        { f: c.fixture, runId: c.runId, area, caster, midTurn: c.autumnMidTurn === true },
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
      if (combatState)
        c.equal(
          await c.gm.evaluate(() => ({ round: game.combat.round, turn: game.combat.turn })),
          combatState,
          'aura-entry-applies-without-turn-advance',
        );
      await c.gm.evaluate(async (f) => {
        const token = canvas.tokens.get(f.target);
        const effect = token.actor.itemTypes.effect.find((i) => i.slug === 'autumn-leaves-within');
        await effect.update({
          name: effect.name + ' edited',
          'system.rules': effect.toObject().system.rules.slice().reverse(),
        });
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
