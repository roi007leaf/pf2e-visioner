/* global Actor, Scene, Combat, ChatMessage */
import { assertQaWorld } from './world-guard.mjs';
const MODULE = 'pf2e-visioner';
const MARKER = 'liveTestRun';
let messageTagger = null;
export { captureSettings, changeSetting, restoreSettings } from './settings-support.js';
export { peekAudit, cleanupAuditTransients } from './audit-support.js';
export function validateRunId(runId) {
  if (typeof runId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) {
    throw Error('Invalid live-test run ID; refusing document access');
  }
}
const owned = (document, runId) => document.getFlag(MODULE, MARKER) === runId;
const flag = (runId) => ({ [MODULE]: { [MARKER]: runId } });

export async function setPause({ world, paused }) {
  assertQaWorld(game.world?.id, world);
  if (!game.user?.isGM) throw Error('GM required to change QA pause state');
  if (typeof paused !== 'boolean') throw Error('QA pause state must be boolean');
  if (game.paused !== paused) await game.togglePause(paused, { broadcast: true });
  if (game.paused !== paused) throw Error('QA pause state did not update');
}

export function preflight() {
  if (!game.ready || !canvas.ready) throw Error('Foundry canvas is not ready');
  if (game.system.id !== 'pf2e') throw Error('PF2e world required');
  if (!game.modules.get(MODULE)?.active) throw Error('PF2E Visioner must be enabled');
  return {
    world: game.world.id, user: game.user.id, isGM: game.user.isGM, paused: game.paused,
    scene: canvas.scene?.id ?? null, controlled: canvas.tokens.controlled.map(t => t.id),
    targeted: [...game.user.targets].map(t => t.id),
    combat: game.combat?.id ?? null,
    pan: canvas.scene?._viewPosition ? { ...canvas.scene._viewPosition } : null,
    level: canvas.level?.id ?? null,
    core: game.version, system: game.system.version, module: game.modules.get(MODULE).version,
    modules: game.modules.filter(m => m.active).map(m => ({ id: m.id, version: m.version })),
    clientSettings: { gmObserverView: game.settings.get(MODULE, 'gmObserverView') },
    systemClientSettings: { gmVision: game.settings.get('pf2e', 'gmVision') },
    diceConfiguration: foundry.utils.deepClone(game.settings.get('core', foundry.dice.Roll.DICE_CONFIGURATION_SETTING)),
    manualRollPermission: { existed: Object.hasOwn(game.user._source.permissions, 'MANUAL_ROLLS'), value: game.user._source.permissions.MANUAL_ROLLS ?? false },
    openApps: [...new Set([...Object.values(ui.windows), ...(foundry.applications.instances?.values?.() ?? [])])].map(app => app.id),
    settings: Object.fromEntries(['autoVisibilityEnabled', 'avsOnlyInCombat', 'enableHoverTooltips', 'allowPlayerTooltips'].map(key => [key, game.settings.get(MODULE, key)])),
  };
}

export function installMessageTagger(runId) {
  validateRunId(runId);
  if (!game.user.isGM) throw Error('GM required');
  if (messageTagger?.runId === runId) return messageTagger.hook;
  if (messageTagger) {
    Hooks.off('preCreateChatMessage', messageTagger.hook);
    Hooks.off('preCreateActor', messageTagger.actorHook);
  }
  const hook = Hooks.on('preCreateChatMessage', (message) => {
    const scene = game.scenes.get(message.speaker?.scene);
    const actor = game.actors.get(message.speaker?.actor);
    if (owned(scene ?? { getFlag: () => null }, runId) || owned(actor ?? { getFlag: () => null }, runId)) {
      message.updateSource({ [`flags.${MODULE}.${MARKER}`]: runId });
    }
  });
  // Only this isolated GM session and the marked scene: automated workflows may
  // create hazard/loot actors through Foundry UI. Their embedded items follow
  // the actor's lifetime, so the same recovery journal owns all their data.
  const actorHook = Hooks.on('preCreateActor', actor => {
    if (canvas.scene && owned(canvas.scene, runId)) actor.updateSource({ [`flags.${MODULE}.${MARKER}`]: runId });
  });
  messageTagger = { runId, hook, actorHook };
  return hook;
}

export async function setup({ runId, playerId, senses = ['darkvision'], darkness = false, secondObserver = false, requireSettings = {}, environment = {}, camera, observerType = 'npc', targetType = 'npc', observerLevel = 1, targetLevel = 1 }) {
  validateRunId(runId);
  installMessageTagger(runId);
  if (!game.user.isGM) throw Error('GM required');
  if (!['npc', 'character'].includes(observerType)) throw Error('Invalid observer fixture type');
  if (!['npc', 'character', 'hazard', 'loot'].includes(targetType)) throw Error('Invalid target fixture type');
  if (environment.core && Number(game.version.split('.')[0]) !== environment.core) throw Error(`Prerequisite: Foundry ${environment.core} world required`);
  if (environment.minimumActiveGms && game.users.filter(user => user.active && user.isGM).length < environment.minimumActiveGms) throw Error(`Prerequisite: ${environment.minimumActiveGms} active GM accounts required`);
  for (const id of environment.modules ?? []) if (!game.modules.get(id)?.active) throw Error(`Prerequisite: enabled ${id} module required`);
  for (const [key, expected] of Object.entries(requireSettings)) {
    if (game.settings.get(MODULE, key) !== expected) throw Error(`Prerequisite: ${key} must be ${expected}; no settings were changed`);
  }
  // Actor senses are authoritative. Never disable Rules-Based Vision in test scenes.
  const senseData = senses.map(type => typeof type === 'object' ? type : ({ type, acuity: ['darkvision', 'low-light-vision'].includes(type) ? 'precise' : 'imprecise', range: 30 }));
  const actors = [];
  for (const [index, name] of ['Observer', 'Target', ...(secondObserver ? ['Second Observer'] : [])].entries()) {
    const type = index === 0 ? observerType : index === 1 ? targetType : 'npc';
    const character = type === 'character';
    const items = character ? await (await import('./scenario-support.js')).fixtureCharacterItems(runId) : [];
    actors.push(await Actor.create({ name: `Visioner QA ${name}`, type, items,
      img: 'icons/svg/mystery-man.svg', flags: flag(runId),
      ownership: { default: 0, ...(index !== 1 ? { [playerId]: 3 } : {}) },
      system: { details: { level: { value: index === 0 ? observerLevel : targetLevel } }, attributes: { hp: { value: character ? 80 : 20, max: character ? 88 : 20 }, ac: { value: 18 } },
        perception: { mod: 8, senses: index === 0 ? senseData : [{ type: 'darkvision' }] },
        skills: { stealth: { base: 100 } }, traits: { size: { value: 'med' } } },
    }));
  }
  const tokens = [];
  for (const [index, actor] of actors.entries()) {
    const token = await actor.getTokenDocument({ actorLink: true, x: index === 1 ? 800 : 400, y: index === 2 ? 700 : 500,
      width: 1, height: 1, sight: { enabled: true }, disposition: index ? -1 : 1,
      texture: { src: index ? `/modules/${MODULE}/tests/live/assets/target.svg` : 'icons/svg/mystery-man.svg' },
      flags: { ...flag(runId), pf2e: { linkToActorSize: false } },
    });
    const data = token.toObject(); delete data._id; tokens.push(data);
  }
  const scene = await Scene.create({ name: `Visioner QA ${runId.slice(0, 8)}`, flags: { ...flag(runId), pf2e: { rulesBasedVision: true } },
    active: false, navigation: true, ownership: { default: 0, [playerId]: 3 },
    width: 1800, height: 1400, padding: 0, grid: { size: 100, distance: 5, type: 1 },
    tokenVision: true, environment: { darknessLevel: darkness ? 1 : 0, globalLight: { enabled: !darkness } }, tokens,
  });
  return { scene: scene.id, camera, observer: scene.tokens.find(t => t.actorId === actors[0].id).id,
    target: scene.tokens.find(t => t.actorId === actors[1].id).id,
    secondObserver: actors[2] ? scene.tokens.find(t => t.actorId === actors[2].id).id : null,
    actors: actors.map(a => a.id) };
}

export async function view(fixture) {
  const scene = game.scenes.get(fixture.scene);
  if (!scene) throw Error('Fixture scene not yet synchronized');
  const level = scene.levels && scene.tokens.get(fixture.observer)?.level;
  await scene.view(level ? { level } : undefined);
  canvas.tokens.get(fixture.observer).control({ releaseOthers: true });
  canvas.pan(fixture.camera ?? { x: 650, y: 550, scale: 1 });
  if (canvas.scene.flags.pf2e.rulesBasedVision === false) throw Error('Rules-Based Vision disabled');
}

export async function viewEncounter(fixture) {
  const run = canvas.scene?.getFlag(MODULE, MARKER);
  if (!run || canvas.scene.id !== fixture.scene) throw Error('Owned test scene required for encounter view');
  const combat = game.combats.find(c => c.scene?.id === fixture.scene && owned(c, run));
  if (!combat) throw Error('Owned fixture encounter missing');
  // A local tracker selection supplies the native game.combat without globally
  // activating this encounter or deactivating a campaign encounter elsewhere.
  await ui.combat.render({ force: true, combat, renderContext: "viewCombat", renderData: [] });
  if (game.combat?.id !== combat.id || ![fixture.observer, fixture.target].every(id => canvas.tokens.get(id)?.inCombat)) throw Error('Fixture tokens are not in the current native encounter');
}

async function pair(fixture, state) {
  const { default: Overrides } = await import('../../scripts/chat/services/infra/AvsOverrideManager.js');
  const observer = canvas.tokens.get(fixture.observer), target = canvas.tokens.get(fixture.target);
  await Overrides.setPairOverrides(observer, new Map([[target.id, { target, state, hasCover: false, hasConcealment: state === 'concealed' }]]), { source: 'manual_action' });
}

export async function mutate({ fixture, operation, value, runId }) {
  validateRunId(runId);
  if (!game.user.isGM) throw Error('GM required');
  const observer = canvas.tokens.get(fixture.observer), target = canvas.tokens.get(fixture.target);
  if (!owned(canvas.scene, runId)) throw Error('Refusing to mutate a non-test scene');
  if (canvas.scene.id !== fixture.scene || ![observer, target].every(t => t && owned(t.document, runId) && owned(t.actor, runId))) {
    throw Error('Refusing to mutate documents outside the fixture');
  }
  switch (operation) {
    case 'gm-observer-view': {
      if (game.settings.settings.get(`${MODULE}.gmObserverView`)?.scope !== 'client') throw Error('GM Observer View must remain a client setting');
      await game.settings.set(MODULE, 'gmObserverView', value);
      const { gmObserverView } = await import('../../scripts/services/GmObserverView/gm-observer-view.js');
      gmObserverView.refresh(); break;
    }
    case 'effect-add': {
      const actor = value.subject === 'observer' ? observer.actor : target.actor;
      await actor.createEmbeddedDocuments('Item', [{ name: `Visioner QA ${value.id}`, type: 'effect',
        flags: { [MODULE]: { [MARKER]: runId, liveEffectId: value.id } },
        system: { duration: { value: -1, unit: 'unlimited', expiry: null },
          rules: [{ key: 'PF2eVisionerEffect', operations: value.operations.map(op => op.masterActorUuid === '$secondObserver' ? { ...op, masterActorUuid: canvas.tokens.get(fixture.secondObserver).actor.uuid } : op), priority: value.priority ?? 100 }] },
      }]); break;
    }
    case 'effect-delete': {
      const actor = value?.subject === 'observer' ? observer.actor : target.actor;
      const id = typeof value === 'string' ? value : value.id;
      const ids = actor.items.filter(item => owned(item, runId) && item.getFlag(MODULE, 'liveEffectId') === id).map(item => item.id);
      if (!ids.length) throw Error(`Fixture effect missing: ${value}`);
      await actor.deleteEmbeddedDocuments('Item', ids); break;
    }
    case 'effect-edit': {
      const item = target.actor.items.find(item => owned(item, runId) && item.getFlag(MODULE, 'liveEffectId') === value.id);
      if (!item) throw Error('Fixture effect missing for edit');
      await item.update({ 'system.rules': [{ key: 'PF2eVisionerEffect', operations: value.operations, priority: 100 }] }); break;
    }
    case 'condition': await observer.actor.toggleCondition(value); break;
    case 'target-condition': await target.actor.toggleCondition(value); break;
    case 'senses': await observer.actor.update({ 'system.perception.senses': value }); break;
    case 'lighting': await canvas.scene.update({ 'environment.darknessLevel': value ? 1 : 0, 'environment.globalLight.enabled': !value }); break;
    case 'hearing-range': await canvas.scene.setFlag('pf2e', 'hearingRange', value); break;
    case 'foundry-hidden': await target.document.update({ hidden: value }); break;
    case 'observer-move': {
      const level = Number.isFinite(value.elevation) && canvas.scene.levels?.find(l => l.name.startsWith('QA ') && value.elevation >= l.elevation.bottom && value.elevation < l.elevation.top);
      await observer.document.update({ ...value, ...(level ? { level: level.id } : {}) }, { animate: false }); break;
    }
    case 'region': {
      await canvas.scene.createEmbeddedDocuments('Region', [{ name: 'Visioner QA Region', flags: flag(runId),
        shapes: [{ type: 'rectangle', x: value.x ?? 700, y: 400, width: value.width ?? 300, height: 300, rotation: 0, hole: false }],
        behaviors: [{ type: `${MODULE}.Pf2eVisioner${value.type}`, system: {
          ...(value.type === 'Visibility' ? { events: ['BEHAVIOR_ACTIVATED', 'BEHAVIOR_DEACTIVATED', 'TOKEN_ENTER', 'TOKEN_EXIT',
            'TOKEN_TURN_START', 'TOKEN_TURN_END', 'TOKEN_ROUND_START', 'TOKEN_ROUND_END'].map(key => CONST.REGION_EVENTS[key]) } : {}),
          ...value.system,
        } }],
      }]); break;
    }
    case 'remove-regions': await canvas.scene.deleteEmbeddedDocuments('Region', canvas.scene.regions.filter(d => owned(d, runId)).map(d => d.id)); break;
    case 'reset-override': {
      const { default: Overrides } = await import('../../scripts/chat/services/infra/AvsOverrideManager.js');
      await Overrides.removeOverride(observer.id, target.id); break;
    }
    case 'api-state': {
      const { api } = await import('../../scripts/api.js');
      if (await api.setVisibility(observer.id, target.id, value) !== true) throw Error('Public API rejected a supported visibility state'); break;
    }
    case 'api-invalid-state': {
      const { api } = await import('../../scripts/api.js');
      if (await api.setVisibility(observer.id, target.id, value) !== false) throw Error('Public API accepted an unsupported visibility state'); break;
    }
    case 'api-cover': {
      const { api } = await import('../../scripts/api.js');
      await api.setCover(observer.id, target.id, value); break;
    }
    case 'manager': {
      const { api } = await import('../../scripts/api.js');
      await api.openTokenManager(observer, { mode: value ?? 'observer' }); break;
    }
    case 'state': await pair(fixture, value); break;
    case 'move': await target.document.update({ x: value }, { animate: false }); break;
    case 'elevation': await target.document.update({ elevation: value }, { animate: false }); break;
    case 'tile': await canvas.scene.createEmbeddedDocuments('Tile', [{ texture: { src: `/modules/${MODULE}/tests/live/assets/target.svg` }, x: value?.x ?? 1100, y: value?.y ?? 800, width: 100, height: 100, flags: flag(runId) }]); break;
    case 'cover': {
      const { setCoverBetween } = await import('../../scripts/stores/cover-map.js');
      await setCoverBetween(observer, target, value); break;
    }
    case 'door': {
      if (!canvas.scene.walls.size) await canvas.scene.createEmbeddedDocuments('Wall', [{ c: [650, 0, 650, 1400], door: 1, ds: value, sight: 20, move: 20, sound: 20 }]);
      else await canvas.scene.walls.contents[0].update({ ds: value }); break;
    }
    case 'combat-start': {
      const combat = game.combats.find(c => c.scene?.id === fixture.scene && owned(c, runId));
      if (!combat) throw Error('Owned fixture encounter missing');
      await combat.startCombat(); break;
    }
    case 'combat': {
      const combat = await Combat.create({ scene: fixture.scene, active: false, flags: flag(runId) });
      await combat.createEmbeddedDocuments('Combatant', [observer, target, canvas.tokens.get(fixture.secondObserver)].filter(Boolean).map(t => ({ tokenId: t.id, actorId: t.actor.id, sceneId: fixture.scene })));
      await viewEncounter(fixture);
      if (value?.start !== false) await combat.startCombat(); break;
    }
    case 'hide': await game.pf2e.actions.get('hide').use({ actors: [target.actor], target: observer, event: new MouseEvent('click', { shiftKey: true }) }); break;
    case 'seek': await game.pf2e.actions.get('seek').use({ actors: [observer.actor], target, event: new MouseEvent('click', { shiftKey: true }) }); break;
    case 'sneak': await game.pf2e.actions.get('sneak').use({ actors: [target.actor], target: observer, event: new MouseEvent('click', { shiftKey: true }) }); break;
    default: {
      const { mutateExtra } = await import('./scenario-support.js');
      await mutateExtra({ fixture, operation, value, runId });
    }
  }
}

export async function snapshot(fixture) {
  const observer = canvas.tokens.get(fixture.observer), target = canvas.tokens.get(fixture.target);
  const { getVisibilityBetween } = await import('../../scripts/stores/visibility-map.js');
  const { getDetectionBetween } = await import('../../scripts/stores/detection-map.js');
  const { getCoverBetween } = await import('../../scripts/stores/cover-map.js');
  const { api } = await import('../../scripts/api.js');
  const { HoverTooltips } = await import('../../scripts/services/HoverTooltips.js');
  const modes = CONFIG.Canvas.detectionModes;
  const filter = target.detectionFilter;
  const point = target.getGlobalPosition();
  const scale = canvas.stage.scale.x;
  return {
    ...(fixture.probe ? await (await import('./scenario-support.js')).inspect({ fixture, kind: fixture.probe }) : {}),
    state: getVisibilityBetween(observer, target), sense: getDetectionBetween(observer, target)?.sense ?? null,
    reverseState: getVisibilityBetween(target, observer),
    fixtureEffects: target.actor.items.filter(item => item.type === 'effect' && item.getFlag(MODULE, MARKER)).length,
    cover: getCoverBetween(observer, target),
    autoCover: game.settings.get(MODULE, 'autoCover') ? api.getAutoCoverState(observer, target) : null,
    observerSenses: Array.from(observer.actor.system.perception.senses).map(s => ({ type: s.type, acuity: s.acuity, range: s.range })),
    visible: target.visible, meshVisible: target.mesh?.visible, meshRenderable: target.mesh?.renderable,
    presenceMode: target._pvSystemHiddenIndicator?._pvIndicatorMode ?? null,
    presenceVisible: !!(target._pvSystemHiddenIndicator?.worldVisible && target._pvSystemHiddenIndicator?.renderable && target._pvSystemHiddenIndicator?.worldAlpha > 0),
    meshAlpha: target.mesh?.alpha, meshTint: target.mesh?.tint,
    renderDiagnostics: {
      avs: game.user.isGM ? (await import('../../scripts/visibility/auto-visibility/index.js')).autoVisibilitySystem.getDiagnostics() : null,
      invisibleHistory: target.document.getFlag(MODULE, 'invisibility'),
      activeGM: game.users.activeGM?.id, user: game.user.id,
      documentVisibility: document.visibilityState,
      controlled: canvas.tokens.controlled.map(t => t.id), targetControlled: target.controlled,
      targetOwned: target.isOwner, targetHidden: target.document.hidden,
      lightingModifications: target.document.getFlag(MODULE, 'lightingModification'),
      observerConditions: observer.actor.itemTypes.condition.map(item => ({ id: item.id, slug: item.slug, active: item.active })),
      observerBlinded: observer.actor.hasCondition('blinded'), observerDeafened: observer.actor.hasCondition('deafened'),
      observerSystemConditions: observer.actor.system.conditions,
      observerVisionSourceActive: observer.vision?.active, observerVisionSourceDisabled: observer.vision?.disabled,
      sceneDarkness: canvas.scene.environment.darknessLevel, darkness: canvas.environment.darknessLevel,
      globalLight: { enabled: canvas.scene.environment.globalLight.enabled, active: canvas.environment.globalLightSource.active },
      observerDetectionModes: observer.document.detectionModes,
      observerElevation: observer.document.elevation, targetElevation: target.document.elevation,
      observerLevel: observer.document.level, targetLevel: target.document.level, viewedLevel: canvas.level?.id,
      tokenRenderable: target.renderable, tokenAlpha: target.alpha, tokenWorldAlpha: target.worldAlpha,
      tokenCulled: target.culled, tokenCullingBounds: target.cullArea?.toString?.(),
      detectionMesh: target.detectionFilterMesh && { visible: target.detectionFilterMesh.visible,
        renderable: target.detectionFilterMesh.renderable, alpha: target.detectionFilterMesh.alpha,
        worldAlpha: target.detectionFilterMesh.worldAlpha },
      targetMeshFilters: target.mesh?.filters?.map(f => f.constructor.name) ?? [],
      filterEnabled: filter?.enabled, filterClass: filter?.constructor?.name,
      hardHidden: target._pvCurrentViewHardHidden,
      presenceSuppression: target._pvPresenceOnlyRenderSuppression,
      presenceIndicator: target._pvSystemHiddenIndicator && {
        mode: target._pvSystemHiddenIndicator._pvIndicatorMode,
        observer: target._pvSystemHiddenIndicator._pvObserverId,
      },
    },
    filter: !filter ? null : filter === modes.hearing?.constructor.getDetectionFilter() ? 'hearing' : filter === modes.feelTremor?.constructor.getDetectionFilter() ? 'tremorsense' : 'other',
    visibilityBadge: HoverTooltips.visibilityIndicators.has(target.id), coverBadge: HoverTooltips.coverIndicators.has(`${target.id}|cover`),
    rect: { x: Math.round(point.x), y: Math.round(point.y), width: Math.round(target.w * scale), height: Math.round(target.h * scale) },
    tilesVisible: canvas.tiles.placeables.every(tile => tile.mesh?.visible !== false && tile.mesh?.renderable !== false && tile.visible !== false),
    messages: game.messages.filter(m => m.speaker?.scene === fixture.scene).map(m => ({ id: m.id, roll: !!m.rolls?.length })),
  };
}

export async function leftovers(runId) {
  validateRunId(runId);
  return Object.fromEntries(['messages', 'combats', 'scenes', 'actors'].map(key => [key, game[key].filter(d => owned(d, runId)).map(d => d.id)]));
}

export async function cleanup(runId) {
  validateRunId(runId);
  if (!game.user.isGM) throw Error('GM required for cleanup');
  const failures = [];
  // Include action-generated messages even if a remote creation skipped our hook.
  const sceneIds = new Set(game.scenes.filter(d => owned(d, runId)).map(d => d.id));
  const actorIds = new Set(game.actors.filter(d => owned(d, runId)).map(d => d.id));
  let retainMessageReferences = false;
  for (const [collection, type] of [[game.messages, ChatMessage], [game.combats, Combat], [game.scenes, Scene], [game.actors, Actor]]) {
    if (retainMessageReferences && (collection === game.scenes || collection === game.actors)) continue;
    const ids = collection.filter(d => owned(d, runId) || (collection === game.messages &&
      (sceneIds.has(d.speaker?.scene) || actorIds.has(d.speaker?.actor)))).map(d => d.id);
    if (ids.length) try { await type.deleteDocuments(ids); } catch (error) {
      failures.push(error.message);
      // Untagged remote action messages are found through their speakers. Keep
      // these anchors when message deletion fails so recovery can find them.
      if (collection === game.messages) retainMessageReferences = true;
    }
  }
  if (failures.length) throw Error(failures.join('; '));
}

export async function restore(saved) {
  if (saved.diceConfiguration) await game.settings.set('core', foundry.dice.Roll.DICE_CONFIGURATION_SETTING, saved.diceConfiguration);
  // Windows belong to these isolated QA browser contexts. Close only those
  // opened after preflight, including native item/config/check dialogs.
  if (saved.openApps && typeof ui !== 'undefined') {
    const apps = new Set([...Object.values(ui.windows), ...(foundry.applications.instances?.values?.() ?? [])]);
    for (const app of apps) if (!saved.openApps.includes(app.id)) await app.close();
  }
  // Restore client settings before viewing another scene, so scene-ready hooks
  // cannot apply the test's GM view mode to the user's previous scene.
  for (const [key, value] of Object.entries(saved.clientSettings ?? {})) {
    if (game.settings.settings.get(`${MODULE}.${key}`)?.scope !== 'client') throw Error('Refusing to restore a non-client setting');
    if (game.settings.get(MODULE, key) !== value) await game.settings.set(MODULE, key, value);
  }
  for (const [key, value] of Object.entries(saved.systemClientSettings ?? {})) {
    if (key !== 'gmVision' || game.settings.settings.get(`pf2e.${key}`)?.scope !== 'client') throw Error('Unexpected system client setting');
    if (game.settings.get('pf2e', key) !== value) await game.settings.set('pf2e', key, value);
  }
  if (saved.scene && game.scenes.has(saved.scene)) {
    const deadline = Date.now() + 30000;
    while (canvas.loading && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    if (canvas.loading) throw Error('Canvas still loading; original scene restoration must be retried');
    await game.scenes.get(saved.scene).view(saved.level ? { level: saved.level } : undefined);
    if (canvas.scene?.id !== saved.scene || (saved.level && canvas.level?.id !== saved.level)) throw Error('Original scene or level was not restored');
  }
  if (saved.pan && canvas.scene?.id === saved.scene) canvas.pan(saved.pan);
  canvas.tokens.releaseAll();
  for (const id of saved.controlled ?? []) canvas.tokens.get(id)?.control({ releaseOthers: false });
  if (saved.combat && game.combats.has(saved.combat)) {
    await ui.combat.render({ force: true, combat: game.combats.get(saved.combat) });
    if (game.combat?.id !== saved.combat) throw Error('Original encounter view was not restored');
  }
  if (saved.targeted) {
    for (const token of [...game.user.targets]) token.setTarget(false, { releaseOthers: false });
    for (const id of saved.targeted) canvas.tokens.get(id)?.setTarget(true, { releaseOthers: false });
    if ([...game.user.targets].map(t => t.id).sort().join(',') !== [...saved.targeted].sort().join(',')) throw Error('Original token targets were not restored');
  }
}
