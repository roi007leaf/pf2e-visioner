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
  for (const spec of [
    { target: 12, observer: 10, cover: 'none', expected: 'observed' },
    { target: 12, observer: 10, cover: 'standard', expected: 'hidden' },
    { target: 60, observer: 10, cover: 'standard', expected: 'unnoticed' },
    { target: 60, observer: 80, cover: 'standard', expected: 'undetected' },
  ]) {
    await c.mutate('reset-override'); await c.mutate('cover', spec.cover);
    await c.mutate('combat', { start: false });
    await c.mutate('initiative');
    c.assert((await c.messages()).some(m => m.roll), 'Native Stealth initiative produced a roll');
    // Editing initiative is a native encounter operation; fixed totals exercise
    // all four branches without altering PF2e random-number generation.
    await c.mutate('initiative-values', spec);
    await c.check({ state: spec.expected }, spec.expected === 'observed', `initiative-${spec.target}-${spec.observer}-${spec.cover}`);
    await c.mutate('combat-delete');
    await c.mutate('reset-override'); await c.check({ state: 'observed' }, true);
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
