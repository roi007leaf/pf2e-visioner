import { actionDialog, closeDialogs } from './ui-workflows.mjs';

export async function featContext(c, slug) {
  const add = extra => c.mutate('feat-add', { slug, ...extra });
  const remove = () => c.mutate('feat-delete', { slug });
  const check = (expected, label) => c.check(expected, undefined, label, { probe: 'feat-context' });
  if (['terrain-stalker', 'camouflage', 'vanish-into-the-land'].includes(slug)) {
    if (slug === 'vanish-into-the-land') await c.mutate('feat-add', { slug: 'terrain-stalker', selection: 'underbrush' });
    await c.mutate('terrain', { type: 'urban' }); await add({ selection: 'underbrush' });
    await check({ hideQualified: false }, 'wrong-terrain');
    await c.mutate('terrain', { type: 'forest', difficult: slug !== 'camouflage' });
    await check({ hideQualified: true }, 'matching-terrain');
    await remove();
    if (slug === 'vanish-into-the-land') await c.mutate('feat-delete', { slug: 'terrain-stalker' });
    await check({ hideQualified: false }, 'removed');
  } else if (slug === 'distracting-shadows') {
    await c.mutate('second-token', { x: 600, y: 500 });
    await add(); await check({ hideQualified: false }, 'same-size');
    await c.mutate('second-data', { 'system.traits.size.value': 'huge' });
    await check({ hideQualified: true }, 'larger-creature');
    await remove(); await check({ hideQualified: false }, 'removed');
  } else if (slug === 'keen-eyes') {
    await check({ seekHidden: 'hidden', seekUndetected: 'undetected' }, 'baseline');
    await add(); await check({ seekHidden: 'observed', seekUndetected: 'hidden' }, 'installed');
    await remove(); await check({ seekHidden: 'hidden', seekUndetected: 'undetected' }, 'removed');
  } else if (slug === 'thats-odd') {
    await add(); await check({ seekHazard: 'observed', seekLoot: 'observed', seekHidden: 'hidden' }, 'anomaly-only');
    await remove(); await check({ seekHazard: 'hidden', seekLoot: 'hidden' }, 'removed');
  } else if (['very-sneaky', 'sneaky'].includes(slug)) {
    await check({ sneakDistanceBonus: 0 }, 'baseline');
    await add(); await check({ sneakDistanceBonus: 5 }, 'installed');
    await remove(); await check({ sneakDistanceBonus: 0 }, 'removed');
  } else if (slug === 'deny-advantage') {
    await add({ pack: 'pf2e.classfeatures' });
    for (const [level, expected] of [[7, true], [8, true], [9, false]]) {
      await c.mutate('target-data', { 'system.details.level.value': level });
      await check({ denyHidden: expected }, `opponent-level-${level}`);
    }
    await remove(); await c.mutate('target-data', { 'system.details.level.value': 7 });
    await check({ denyHidden: false }, 'removed');
  } else throw Error(`No automated feat contract: ${slug}`);
}

const blur = [
  { type: 'overrideVisibility', state: 'concealed', direction: 'from', observers: 'all', source: 'qa-blur' },
  { type: 'modifyActionQualification', qualifications: { hide: { qualifiesOnConcealment: false }, sneak: { end: { qualifiesOnConcealment: false } } }, source: 'qa-blur' },
];
export async function ruleLifecycle(c) {
  await c.mutate('effect-add', { id: 'blur', operations: blur });
  await c.check({ state: 'concealed', concealmentAllowsHide: false }, true, 'blur', { probe: 'rules' });
  const dialog = await actionDialog(c, 'hide', 60);
  await dialog.locator('[data-action="applyAll"]').click();
  await c.check({ state: 'concealed' }, true, 'blur-does-not-qualify-hide'); await closeDialogs(c);
  await c.mutate('effect-edit', { id: 'blur', operations: [{ ...blur[0], state: 'hidden' }] });
  await c.check({ state: 'hidden' }, false);
  await c.mutate('state', 'undetected'); await c.mutate('effect-delete', 'blur');
  await c.check({ state: 'undetected' }, false);
  await c.mutate('reset-override'); await c.check({ state: 'observed', fixtureEffects: 0 }, true);
}

export async function ruleStrike(c) {
  await c.mutate('combat'); await c.mutate('strike-item', { subject: 'observer', agile: true });
  await c.mutate('cover-geometry', { type: 'wall', cover: 'standard' });
  await c.mutate('effect-add', { id: 'once', operations: [
    { type: 'adjustCover', mode: 'step', steps: -1, direction: 'from', observers: 'all', scope: 'next-attack', source: 'qa-next-attack' },
  ] });
  await c.check({ coverAdjustmentCount: 1, adjustedCover: 'lesser' }, undefined, 'before-strike', { probe: 'rules', coverBase: 'standard' });
  const before = await c.messages(); await c.mutate('strike', { subject: 'observer' });
  const after = await c.messages();
  c.assert(after.some(m => m.roll && !before.some(b => b.id === m.id)), 'Native Strike produced a roll');
  await c.check({ coverAdjustmentCount: 0, adjustedCover: 'standard' }, undefined, 'one-use-consumed', { probe: 'rules', coverBase: 'standard' });
  await c.mutate('walls-delete');
  await c.mutate('effect-delete', 'once');
  await c.mutate('effect-add', { id: 'roll', operations: [{
    type: 'overrideVisibility', state: 'hidden', direction: 'from', observers: 'all',
    selectors: ['attack-roll'], predicate: ['item:trait:agile'], source: 'qa-roll',
  }] });
  await c.check({ state: 'observed' }, true);
  await c.mutate('strike', { subject: 'observer' });
  await c.check({ state: 'observed', strikeRollHidden: true }, true, 'qualified-strike-context');
  await c.mutate('strike-traits', { subject: 'observer', agile: false });
  await c.mutate('strike', { subject: 'observer' });
  await c.check({ state: 'observed', strikeRollHidden: false }, true, 'unqualified-strike-context');
  await c.mutate('effect-delete', 'roll');
  await c.mutate('strike-traits', { subject: 'observer', agile: true });
  await c.mutate('strike', { subject: 'observer' });
  await c.check({ state: 'observed', fixtureEffects: 0, strikeRollHidden: false }, true, 'deleted-strike-context');
  await ruleLifecycle(c);
}

export async function stealthInitiative(c) {
  const enabled = await c.gm.evaluate(() => game.settings.get('pf2e-visioner', 'enableStealthInitiativeVisibility'));
  if (!enabled) throw Error('Prerequisite: enableStealthInitiativeVisibility must be enabled');
  await requireAvoidNoticeBridgeDisabled(c);
  const perceptionDC = await c.gm.evaluate(observerId => {
    const dc = canvas.tokens.get(observerId)?.actor?.system?.perception?.dc;
    return typeof dc === 'number' ? dc : dc?.value;
  }, c.fixture.observer);
  if (!Number.isFinite(perceptionDC)) throw Error('Prerequisite: observer Perception DC required');
  for (const spec of [
    { label: 'plain-sight-success', target: perceptionDC + 5, observer: 10, cover: 'none', expected: 'observed' },
    { label: 'standard-cover-failure', target: perceptionDC - 1, observer: 10, cover: 'standard', expected: 'hidden' },
    { label: 'concealment-success', target: perceptionDC + 5, observer: 10, cover: 'none', state: 'concealed', expected: 'unnoticed' },
    { label: 'standard-cover-success', target: perceptionDC + 5, observer: 10, cover: 'standard', expected: 'unnoticed' },
    { label: 'observer-wins-initiative', target: perceptionDC + 5, observer: perceptionDC + 10, cover: 'standard', expected: 'unnoticed' },
    { label: 'critical-failure-boundary', target: perceptionDC - 10, observer: 10, cover: 'standard', expected: 'observed' },
    { label: 'legendary-sneak-plain-sight', target: perceptionDC + 5, observer: 10, cover: 'none', feat: 'legendary-sneak', expected: 'unnoticed' },
  ]) {
    await c.mutate('reset-override'); await c.mutate('cover', spec.cover);
    if (spec.state) await c.mutate('state', spec.state);
    if (spec.feat) await c.mutate('feat-add', { slug: spec.feat, subject: 'target' });
    await c.mutate('combat', { start: false });
    const messagesBeforeRoll = await c.messages();
    await c.mutate('initiative');
    c.assert(
      (await c.messages()).some(m => m.roll && !messagesBeforeRoll.some(previous => previous.id === m.id)),
      'Native Stealth initiative produced a new roll',
    );
    // Editing initiative is a native encounter operation; fixed totals exercise
    // the rule boundaries without replacing PF2e random-number generation.
    await c.mutate('initiative-values', spec);
    await c.check({ state: spec.expected }, spec.expected === 'observed', `initiative-${spec.label}`);
    await c.mutate('combat-delete');
    await c.mutate('reset-override');
    if (spec.feat) await c.mutate('feat-delete', { slug: spec.feat, subject: 'target' });
    await c.check({ state: 'observed' }, true, `initiative-${spec.label}-cleanup`);
  }
}

export async function stealthInitiativeManualStates(c) {
  const enabled = await c.gm.evaluate(() => game.settings.get('pf2e-visioner', 'enableStealthInitiativeVisibility'));
  if (!enabled) throw Error('Prerequisite: enableStealthInitiativeVisibility must be enabled');
  await requireAvoidNoticeBridgeDisabled(c);
  const targetType = await c.gm.evaluate(targetId => canvas.tokens.get(targetId)?.actor?.type, c.fixture.target);
  c.equal(targetType, 'npc', 'Stealth initiative fixture is an NPC');
  const perceptionDC = await c.gm.evaluate(observerId => {
    const dc = canvas.tokens.get(observerId)?.actor?.system?.perception?.dc;
    return typeof dc === 'number' ? dc : dc?.value;
  }, c.fixture.observer);
  if (!Number.isFinite(perceptionDC)) throw Error('Prerequisite: observer Perception DC required');

  for (const spec of [
    { label: 'manual-concealed', state: 'concealed', cover: 'none' },
    { label: 'manual-standard-cover', cover: 'standard' },
    { label: 'manual-greater-cover', cover: 'greater' },
    { label: 'dialog-standard-cover', cover: 'none', dialogCover: 'standard' },
    { label: 'dialog-greater-cover', cover: 'none', dialogCover: 'greater' },
  ]) {
    await c.mutate('reset-override');
    await c.mutate('cover', spec.cover);
    if (spec.state) await c.mutate('state', spec.state);
    const prior = await c.gm.evaluate(({ observer, target }) => {
      const observerToken = canvas.tokens.get(observer);
      const targetToken = canvas.tokens.get(target);
      return {
        cover: observerToken.document.getFlag('pf2e-visioner', 'cover')?.[target],
        override: targetToken.document.getFlag('pf2e-visioner', `avs-override-from-${observer}`),
      };
    }, c.fixture);
    c.equal(prior.cover ?? 'none', spec.cover, `${spec.label}: manual cover persisted before combat`);
    if (spec.state) c.equal(prior.override?.state, spec.state, `${spec.label}: manual visibility override persisted before combat`);
    await c.mutate('combat', { start: false });
    const messagesBeforeRoll = await c.messages();
    await c.mutate('initiative', spec.dialogCover ? { cover: spec.dialogCover } : undefined);
    c.assert((await c.messages()).some(m => m.roll && !messagesBeforeRoll.some(previous => previous.id === m.id)),
      `${spec.label}: NPC made a native Stealth initiative roll`);
    if (spec.dialogCover) {
      const savedCover = await c.gm.evaluate(({ scene, target }) => {
        const combat = game.combats.find(entry => entry.scene?.id === scene && entry.combatants.some(cbt => cbt.tokenId === target));
        return combat?.combatants.find(cbt => cbt.tokenId === target)?.getFlag('pf2e-visioner', 'stealthInitiativeCoverChoice');
      }, c.fixture);
      c.equal(savedCover, spec.dialogCover, `${spec.label}: GM dialog choice stored on combatant`);
    }
    await c.mutate('initiative-values', { target: perceptionDC + 5, observer: perceptionDC + 10 });
    await c.check({ state: 'unnoticed', cover: spec.cover }, false, `${spec.label}-unnoticed`);
    await c.mutate('combat-delete');
    await c.check({ state: 'observed', cover: spec.cover }, true, `${spec.label}-avs-restored`);
    const remaining = await c.gm.evaluate(({ observer, target }) => {
      const flags = canvas.tokens.get(target).document;
      return {
        override: flags.getFlag('pf2e-visioner', `avs-override-from-${observer}`),
        previous: flags.getFlag('pf2e-visioner', `encounter-stealth-previous-from-${observer}`),
      };
    }, c.fixture);
    c.equal(remaining.override, undefined, `${spec.label}: visibility override released`);
    c.equal(remaining.previous, undefined, `${spec.label}: saved override discarded`);
    await c.mutate('cover', 'none');
    await c.check({ state: 'observed', cover: 'none' }, true, `${spec.label}-cleanup`);
  }
}

export async function combatStartCharacterAction(c, kind) {
  const setting = kind === 'defend' ? 'raisePcShieldsWhenDefending' : 'enrageBarbariansAtCombatStart';
  const competing = await c.gm.evaluate((key) => {
    if (!game.modules.get('pf2e-avoid-notice')?.active) return false;
    return game.settings.get('pf2e-avoid-notice', key);
  }, kind === 'defend' ? 'raiseShields' : 'rage');
  if (competing) throw Error(`Prerequisite: disable Avoid Notice ${kind} automation in the QA world`);
  await c.setting(setting, true);
  if (kind === 'rage') await c.mutate('feat-add', { slug: 'quick-tempered', subject: 'target' });
  await c.mutate('combat-start-character-kit', kind);
  const ready = await c.gm.evaluate(({ target }) => {
    const actor = canvas.tokens.get(target)?.actor;
    return {
      type: actor?.type,
      activity: Array.from(actor?.system?.exploration ?? []).some((id) => actor.items.get(id)?.slug === 'defend'),
      shield: !!actor?.heldShield,
      action: !!actor?.itemTypes?.action?.find((item) => item.slug === 'rage' && item.system.selfEffect?.uuid),
      feat: !!actor?.itemTypes?.feat?.find((item) => item.slug === 'quick-tempered'),
    };
  }, c.fixture);
  c.equal(ready.type, 'character', `${kind}: fixture is a PC`);
  if (kind === 'defend') {
    c.assert(ready.activity && ready.shield, 'Defend activity and held shield are prepared');
  } else {
    c.assert(ready.feat && ready.action, 'Quick-Tempered and configured Rage action are prepared');
  }

  await c.mutate('combat', { start: false });
  await c.mutate('combat-start');
  const effectSlug = kind === 'defend' ? 'raise-a-shield' : 'effect-rage';
  await c.gm.waitForFunction(({ target, effectSlug }) =>
    canvas.tokens.get(target)?.actor?.itemTypes?.effect?.some((effect) =>
      (effect.slug === effectSlug || (effectSlug === 'raise-a-shield' && effect.slug === 'effect-raise-a-shield')) &&
      (effectSlug !== 'raise-a-shield' || effect.system.duration?.value === 0)),
  { target: c.fixture.target, effectSlug }, { timeout: 20000 });
  const effects = await c.gm.evaluate(({ target }) => canvas.tokens.get(target).actor.itemTypes.effect.map((effect) => ({
    slug: effect.slug, duration: effect.system.duration?.value,
  })), c.fixture);
  c.assert(effects.some((effect) => effect.slug === effectSlug ||
    (effectSlug === 'raise-a-shield' && effect.slug === 'effect-raise-a-shield')),
  `${kind}: native PF2e effect applied at combat start`);
  if (kind === 'defend') c.assert(effects.some((effect) =>
    ['raise-a-shield', 'effect-raise-a-shield'].includes(effect.slug) && effect.duration === 0),
  'Raised shield expires at first turn');
  await c.mutate('combat-delete');
}

async function requireAvoidNoticeBridgeDisabled(c) {
  const handler = await c.gm.evaluate(() => {
    if (!game.modules.get('pf2e-avoid-notice')?.active) return 'disabled';
    return game.settings.get('pf2e-avoid-notice', 'visibilityHandler');
  });
  if (handler !== 'disabled') {
    throw Error(`Prerequisite: pf2e-avoid-notice visibilityHandler must be disabled; found ${handler}`);
  }
}

export async function strikeOffGuard(c) {
  await c.mutate('combat'); await c.mutate('strike-item', { subject: 'observer' });
  const reverse = { observer: c.fixture.target, target: c.fixture.observer };
  await c.mutate('state', 'hidden', reverse);
  const roll = async (dc, label) => {
    const before = await c.messages();
    await c.mutate('strike', { subject: 'observer' });
    c.assert((await c.messages()).some(m => m.roll && !before.some(b => b.id === m.id)), `${label}: native Strike created a new roll`);
    // Custom suppression operations need not add the named-feat chat badge.
    // The actual native attack DC proves whether the -2 penalty was applied.
    await c.check({ strikeDC: dc }, undefined, label, { session: 'gm' });
  };
  await roll(16, 'hidden-attacker-off-guard');
  await c.mutate('effect-add', { id: 'off-guard', operations: [{
    type: 'offGuardSuppression', suppressedStates: ['hidden', 'undetected'], source: 'qa-off-guard',
  }] });
  await roll(18, 'visibility-penalty-suppressed');
  await c.mutate('target-condition', 'prone');
  await roll(16, 'prone-penalty-preserved');
  await c.mutate('target-condition', 'prone');
  await c.mutate('effect-delete', 'off-guard');
  await roll(16, 'suppression-removed');
  await c.mutate('reset-override', undefined, reverse);
  await roll(18, 'observed-restored');
}
