// Additional live fixtures and read-only probes. Every mutation is confined to
// marked scene documents; this file never changes users or world settings.
const MODULE = 'pf2e-visioner';
export async function fixtureCharacterItems(runId, classSlug = 'fighter') {
  const items = [];
  for (const [packId, slug] of [['pf2e.ancestries', 'human'], ['pf2e.classes', classSlug]]) {
    const pack = game.packs.get(packId);
    if (!pack) throw Error(`Prerequisite: ${packId} compendium required for character fixture`);
    const index = await pack.getIndex({ fields: ['system.slug'] });
    const entry = index.find(item => item.system?.slug === slug);
    if (!entry) throw Error(`Prerequisite: ${slug} required for character fixture`);
    const data = (await pack.getDocument(entry._id)).toObject(); delete data._id;
    data.flags = { ...data.flags, [MODULE]: { liveTestRun: runId } };
    items.push(data);
  }
  return items;
}
function tokens(fixture) {
  const scene = canvas.scene;
  const run = scene?.getFlag(MODULE, 'liveTestRun');
  if (!run || scene.id !== fixture.scene) throw Error('Refusing non-fixture access');
  const get = id => {
    if (!id) return null;
    const token = canvas.tokens.get(id);
    if (!token || token.document.getFlag(MODULE, 'liveTestRun') !== run || token.actor.getFlag(MODULE, 'liveTestRun') !== run) throw Error('Refusing unowned fixture token');
    return token;
  };
  return { observer: get(fixture.observer), target: get(fixture.target), second: get(fixture.secondObserver), run };
}

export async function mutateExtra({ fixture, operation, value }) {
  if (!game.user.isGM) throw Error('GM required');
  const { observer, target, second, run } = tokens(fixture);
  switch (operation) {
    case 'target-data': await target.actor.update(value); break;
    case 'observer-data': await observer.actor.update(value); break;
    case 'observer-token': await observer.document.update(value, { animate: false }); break;
    case 'target-token': await target.document.update(value, { animate: false }); break;
    case 'second-token': if (!second) throw Error('Second fixture token required'); await second.document.update(value, { animate: false }); break;
    case 'second-data': if (!second) throw Error('Second fixture token required'); await second.actor.update(value); break;
    case 'second-condition': if (!second) throw Error('Second fixture token required'); await second.actor.toggleCondition(value); break;
    case 'ambient-light': {
      await canvas.scene.deleteEmbeddedDocuments('AmbientLight', canvas.scene.lights.filter(d => d.getFlag(MODULE, 'liveTestRun') === run).map(d => d.id));
      if (value) await canvas.scene.createEmbeddedDocuments('AmbientLight', [{ x: 850, y: 550,
        config: { bright: value.bright ?? 0, dim: value.dim ?? 30, angle: value.angle ?? 360, rotation: value.rotation ?? 0 },
        flags: { [MODULE]: { liveTestRun: run } },
      }]); break;
    }
    case 'feat-add': {
      const actor = value.subject === 'target' ? target.actor : observer.actor;
      let pack, entry;
      for (const id of [...new Set([value.pack, 'pf2e.feats-srd', 'pf2e.ancestryfeatures', 'pf2e.classfeatures'].filter(Boolean))]) {
        const candidate = game.packs.get(id); if (!candidate) continue;
        const index = await candidate.getIndex({ fields: ['system.slug'] });
        entry = index.find(item => item.system?.slug === value.slug);
        if (entry) { pack = candidate; break; }
      }
      if (!entry) throw Error(`Prerequisite: installed PF2e lacks native feature ${value.slug}`);
      const data = (await pack.getDocument(entry._id)).toObject(); delete data._id;
      if (value.selection) for (const rule of data.system.rules ?? []) if (rule.key === 'ChoiceSet') rule.selection = value.selection;
      data.flags = { ...data.flags, [MODULE]: { liveTestRun: run, liveFeat: value.slug } };
      const created = await actor.createEmbeddedDocuments('Item', [data]);
      if (!created.some((item) => item.slug === value.slug && actor.items.has(item.id))) {
        throw Error(`Fixture setup failed: actor did not accept feat ${value.slug}`);
      }
      break;
    }
    case 'feat-delete': {
      const actor = value.subject === 'target' ? target.actor : observer.actor;
      const ids = actor.items.filter(i => i.getFlag(MODULE, 'liveTestRun') === run && i.getFlag(MODULE, 'liveFeat') === value.slug).map(i => i.id);
      if (!ids.length) throw Error('Test feat missing');
      await actor.deleteEmbeddedDocuments('Item', ids); break;
    }
    case 'combat-start-character-kit': {
      const actor = target.actor;
      const source = value === 'defend'
        ? [['pf2e.actionspf2e', 'defend'], ['pf2e.equipment-srd', 'steel-shield']]
        : [['pf2e.actionspf2e', 'rage']];
      const documents = [];
      for (const [packId, slug] of source) {
        const pack = game.packs.get(packId);
        if (!pack) throw Error(`Prerequisite: ${packId} compendium required`);
        const index = await pack.getIndex({ fields: ['system.slug'] });
        const entry = index.find((item) => item.system?.slug === slug);
        if (!entry) throw Error(`Prerequisite: ${slug} item required`);
        const data = (await pack.getDocument(entry._id)).toObject();
        delete data._id;
        data.flags = { ...data.flags, [MODULE]: { liveTestRun: run, liveCombatStartItem: slug } };
        if (slug === 'steel-shield') data.system.equipped = { ...data.system.equipped, carryType: 'held', handsHeld: 1 };
        documents.push(data);
      }
      if (value === 'rage' && !documents[0].system.selfEffect?.uuid) {
        const pack = game.packs.get('pf2e.feat-effects');
        const index = await pack?.getIndex({ fields: ['system.slug'] });
        const entry = index?.find((item) => item.system?.slug === 'effect-rage');
        if (!entry) throw Error('Prerequisite: native Rage self effect required');
        documents[0].system.selfEffect = { uuid: `Compendium.pf2e.feat-effects.Item.${entry._id}` };
      }
      const created = await actor.createEmbeddedDocuments('Item', documents);
      if (created.length !== documents.length) throw Error('Fixture combat-start kit creation failed');
      if (value === 'defend') {
        const defend = created.find((item) => item.slug === 'defend');
        if (!defend) throw Error('Fixture Defend activity missing');
        await actor.update({ 'system.exploration': [defend.id] });
      }
      break;
    }
    case 'purge-seed': {
      if (!second) throw Error('Second fixture token required');
      const { api } = await import('../../scripts/api.js');
      await api.setVisibility(observer.id, target.id, 'hidden');
      await api.setVisibility(observer.id, second.id, 'concealed');
      await api.setCover(observer.id, target.id, 'greater');
      await api.setCover(observer.id, second.id, 'lesser');
      // Non-Visioner sentinel must survive selected-token cleanup as well.
      await target.document.setFlag('world', 'visionerQaSentinel', run); break;
    }
    case 'purge-selected': {
      const { api } = await import('../../scripts/api.js');
      if (!await api.clearAllDataForSelectedTokens([target])) throw Error('Selected-token purge rejected fixture'); break;
    }
    default: await (await import('./workflow-support.js')).mutateWorkflow({ fixture, operation, value, runId: run });
  }
}

export async function inspect({ fixture, kind }) {
  const { observer, target, second, run } = tokens(fixture);
  switch (kind) {
    case 'audit': return (await import('./audit-support.js')).inspectAudit(fixture);
    case 'feat-context': {
      const { FeatsHandler: F } = await import('../../scripts/chat/services/FeatsHandler.js');
      const { OffGuardSuppression } = await import('../../scripts/rule-elements/operations/OffGuardSuppression.js');
      const base = { startQualifies: true, endQualifies: false, bothQualify: false };
      return {
        hideQualified: F.overridePrerequisites(observer, base, { action: 'hide', observer: target, endPoint: observer.center }).endQualifies,
        seekHidden: F.adjustVisibility('seek', observer, 'hidden', 'hidden'),
        seekUndetected: F.adjustVisibility('seek', observer, 'undetected', 'undetected'),
        seekHazard: F.adjustVisibility('seek', observer, 'hidden', 'hidden', { subjectType: 'hazard' }),
        seekLoot: F.adjustVisibility('seek', observer, 'hidden', 'hidden', { subjectType: 'loot' }),
        sneakDistanceBonus: F.getSneakDistanceBonusFeet(observer),
        denyHidden: OffGuardSuppression.shouldSuppressOffGuardForState(observer, 'hidden', target),
      };
    }
    case 'workflow': return (await import('./workflow-support.js')).inspectWorkflow(fixture);
    case 'rules': {
      const { ActionQualifier } = await import('../../scripts/rule-elements/operations/ActionQualifier.js');
      const { OffGuardSuppression } = await import('../../scripts/rule-elements/operations/OffGuardSuppression.js');
      const { resolveAdjustedCover } = await import('../../scripts/cover/cover-adjustments.js');
      const { CoverAdjustment } = await import('../../scripts/rule-elements/operations/CoverAdjustment.js');
      const { getCoverBetween } = await import('../../scripts/stores/cover-map.js');
      return {
        concealmentAllowsHide: ActionQualifier.canUseConcealment(target, 'hide'),
        hiddenOffGuardSuppressed: OffGuardSuppression.shouldSuppressOffGuardForState(target, 'hidden', observer),
        undetectedOffGuardSuppressed: OffGuardSuppression.shouldSuppressOffGuardForState(target, 'undetected', observer),
        adjustedCover: (await resolveAdjustedCover({ attacker: observer, defender: target, baseState: fixture.coverBase ?? getCoverBetween(observer, target), rollOptions: [], consume: false })).state,
        coverAdjustmentCount: CoverAdjustment.getActiveCoverAdjustments(observer, target).length,
        sharedMaster: !!second && observer.document.getFlag(MODULE, 'visionMasterTokenId') === second.id,
      };
    }
    case 'roll-context': {
      // Exercise the registered native deferred effect, including its predicate.
      // This is a rule integration contract; the automated Strike workflow covers UI.
      const callbacks = target.actor.synthetics.ephemeralEffects['attack-roll']?.origin ?? [];
      const options = async test => (await Promise.all(callbacks.map(fn => fn({ test })))).filter(effect => effect?.flags?.[MODULE]?.rollContextVisibility).flatMap(effect => effect.system.rules.map(rule => rule.option));
      return { qualifiedRollHidden: (await options(['item:trait:agile'])).includes('target:condition:hidden'),
        unqualifiedRollHidden: (await options([])).includes('target:condition:hidden') };
    }
    case 'privacy': {
      const name = target.nameplate;
      return { targeted: game.user.targets.has(target),
        nameplateRendered: !!(target.visible && name?.visible && name?.renderable && name?.worldAlpha > 0),
        tooltipContainsName: [...document.querySelectorAll('#tooltip.active, .pf2e-visioner-tooltip')].some(el => el.getClientRects().length && el.textContent.includes(target.name)) };
    }
    case 'purge': {
      const { getVisibilityBetween } = await import('../../scripts/stores/visibility-map.js');
      const { getCoverBetween } = await import('../../scripts/stores/cover-map.js');
      return { unrelatedState: getVisibilityBetween(observer, second), unrelatedCover: getCoverBetween(observer, second),
        foreignFlagPreserved: target.document.getFlag('world', 'visionerQaSentinel') === run };
    }
    case 'feat': {
      const { FeatsHandler } = await import('../../scripts/chat/services/FeatsHandler.js');
      return { blindFightReplacement: FeatsHandler.getVisibilityReplacement(observer, target, 'undetected')?.state ?? null,
        recognizesBlindFight: FeatsHandler.hasBlindFight(observer),
        installedFeatSlugs: observer.actor.items.filter(item => item.type === 'feat').map(item => item.system.slug),
        observerLevel: observer.actor.level, targetLevel: target.actor.level, distance: observer.distanceTo(target),
        sneakSpeed: FeatsHandler.getSneakSpeedMultiplier(observer),
        creatureCover: FeatsHandler.upgradeCoverForCreature(observer, 'lesser').state,
        skipHideEnd: FeatsHandler.shouldSkipEndCoverRequirement(observer, 'hide') };
    }
    default: throw Error(`Unknown live probe ${kind}`);
  }
}
