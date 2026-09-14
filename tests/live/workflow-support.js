/* global ChatMessage */
// Called only after world.mutate has checked GM, scene, actor and token ownership.
const MODULE = 'pf2e-visioner';
export async function mutateWorkflow({ fixture, operation, value = {}, runId }) {
  const observer = canvas.tokens.get(fixture.observer), target = canvas.tokens.get(fixture.target);
  const subject = value.subject === 'observer' ? observer : target;
  const flags = { [MODULE]: { liveTestRun: runId } };
  switch (operation) {
    case 'audit': await (await import('./audit-support.js')).mutateAudit(fixture, value); break;
    case 'native-levels': {
      if (Number(game.version.split('.')[0]) < 14) throw Error('Prerequisite: Foundry 14 native levels required');
      // Scene creation supplies a default infinite level. Narrow and reuse it;
      // adding two overlapping levels would leave tokens on the default level.
      const scene = canvas.scene;
      const ground = scene.levels.contents[0];
      await ground.update({ name: 'QA Ground', elevation: { bottom: 0, top: 10 }, flags });
      const [upper] = await scene.createEmbeddedDocuments('Level', [
        { name: 'QA Upper', elevation: { bottom: 10, top: 20 }, flags },
      ]);
      const levels = [ground, upper];
      if (levels.length !== 2) throw Error('Native levels rejected');
      await scene.updateEmbeddedDocuments('Level', levels.map(l => ({ _id: l.id, 'visibility.levels': levels.map(x => x.id) })));
      await observer.document.update({ elevation: 0, level: ground.id }); await target.document.update({ elevation: 10, level: upper.id });
      await scene.updateEmbeddedDocuments('Wall', scene.walls.map(w => ({ _id: w.id, levels: levels.map(l => l.id) })));
      // Level edits enqueue native canvas rebuilds without awaiting them. Join
      // that queue before another operation touches the newly drawn tokens.
      await canvas.draw(scene);
      break;
    }
    case 'floor': {
      if (value.remove) { await canvas.scene.deleteEmbeddedDocuments('Region', canvas.scene.regions.filter(r => r.name === 'QA Floor').map(r => r.id)); break; }
      await canvas.scene.createEmbeddedDocuments('Region', [{ name: 'QA Floor', flags,
        elevation: { bottom: 10, top: 10 },
        shapes: [{ type: 'rectangle', x: 300, y: 350, width: 700, height: 400, rotation: 0, hole: false }],
        behaviors: [{ type: 'defineSurface', system: { placement: 'bottom', light: true, move: true, sight: true, sound: true, occlusion: true } }],
      }]); break;
    }
    case 'cover-geometry': {
      await canvas.scene.deleteEmbeddedDocuments('Wall', canvas.scene.walls.map(w => w.id));
      await canvas.scene.deleteEmbeddedDocuments('Tile', canvas.scene.tiles.map(t => t.id));
      if (value.cover) flags[MODULE].coverOverride = value.cover;
      if (value.type === 'wall') await canvas.scene.createEmbeddedDocuments('Wall', [{ c: [650, 0, 650, 1400], sight: 0, move: 20, flags }]);
      else await canvas.scene.createEmbeddedDocuments('Tile', [{ name: 'QA Cover Tile', texture: { src: `/modules/${MODULE}/tests/live/assets/target.svg` },
        x: 600, y: 400, width: 100, height: 300, flags }]);
      break;
    }
    case 'cover-config': {
      if (value.type === 'wall') {
        const { VisionerWallQuickSettings } = await import('../../scripts/managers/wall-manager/WallQuick.js');
        await new VisionerWallQuickSettings(canvas.scene.walls.contents[0]).render(true);
      } else await canvas.scene.tiles.contents[0].sheet.render(true);
      break;
    }
    case 'terrain': {
      await canvas.scene.setFlag('pf2e', 'environmentTypes', [value.type]);
      await canvas.scene.deleteEmbeddedDocuments('Region', canvas.scene.regions.filter(r => r.name === 'QA Terrain').map(r => r.id));
      if (value.difficult) await canvas.scene.createEmbeddedDocuments('Region', [{ name: 'QA Terrain', flags: { ...flags, pf2e: { environmentTypes: [value.type] } },
        shapes: [{ type: 'rectangle', x: 200, y: 200, width: 900, height: 900, rotation: 0, hole: false }],
        behaviors: [{ type: 'modifyMovementCost', system: { difficulties: { walk: 2 } } }],
      }]);
      break;
    }
    case 'close-apps': {
      const apps = new Set([...Object.values(ui.windows), ...(foundry.applications.instances?.values?.() ?? [])]);
      for (const app of apps) {
        if (app.element?.classList?.contains(MODULE) || app.element?.classList?.contains('pf2e-visioner')) await app.close();
      }
      break;
    }
    case 'pillar': {
      await canvas.scene.deleteEmbeddedDocuments('Wall', canvas.scene.walls.map(w => w.id));
      await canvas.scene.createEmbeddedDocuments('Wall', [
        [600, 450, 700, 450], [700, 450, 700, 650], [700, 650, 600, 650], [600, 650, 600, 450],
      ].map(c => ({ c, sight: 20, move: 20, sound: 20, flags: { ...flags, 'wall-height': { bottom: 0, top: 20 } } })));
      break;
    }
    case 'walls-delete': await canvas.scene.deleteEmbeddedDocuments('Wall', canvas.scene.walls.map(w => w.id)); break;
    case 'region-edit': {
      for (const region of canvas.scene.regions) for (const behavior of region.behaviors) await behavior.update(value);
      break;
    }
    case 'select': {
      canvas.tokens.get(fixture[value.subject ?? 'observer']).control({ releaseOthers: true });
      if (value.target) canvas.tokens.get(fixture[value.target]).setTarget(true, { releaseOthers: true });
      break;
    }
    case 'quick-panel': {
      const { VisionerQuickPanel } = await import('../../scripts/managers/QuickPanel.js');
      await new VisionerQuickPanel({ mode: 'observer' }).render(true); break;
    }
    case 'hazard-manager': {
      const { VisionerHazardLootManager } = await import('../../scripts/managers/hazard-loot-manager/HazardLootManager.js');
      await new VisionerHazardLootManager().render(true); break;
    }
    case 'action-roll': {
      const actor = value.action === 'seek' ? observer : subject;
      actor.control({ releaseOthers: true });
      const action = game.pf2e.actions.get(value.action);
      if (!action) throw Error(`Installed PF2e action missing: ${value.action}`);
      await action.use({ actors: [actor.actor], target: actor === observer ? target : observer,
        ...(value.action === 'create-a-diversion' ? { variant: 'distracting-words' } : {}),
        event: new MouseEvent('click', { shiftKey: true }) });
      break;
    }
    case 'strike-item': {
      const created = await subject.actor.createEmbeddedDocuments('Item', [{ name: 'QA Strike', type: 'melee', flags,
        system: { bonus: { value: 15 }, attackEffects: { value: [] }, traits: { value: value.agile ? ['agile'] : [] },
          ...(value.ranged ? { range: { increment: 60, max: null } } : {}),
          damageRolls: { primary: { damage: '1d6', damageType: 'bludgeoning' } } } }]);
      if (created.length !== 1) throw Error('Strike fixture rejected'); break;
    }
    case 'strike': {
      subject.control({ releaseOthers: true });
      (subject === observer ? target : observer).setTarget(true, { releaseOthers: true });
      const strike = subject.actor.system.actions.find(a => a.item?.name === 'QA Strike');
      if (!strike) throw Error('Prepared QA Strike missing');
      await strike.variants[0].roll({ event: new MouseEvent('click', { shiftKey: true }) }); break;
    }
    case 'strike-traits': {
      const item = subject.actor.items.find(i => i.name === 'QA Strike' && i.getFlag(MODULE, 'liveTestRun') === runId);
      if (!item) throw Error('Owned QA Strike missing');
      await item.update({ 'system.traits.value': value.agile ? ['agile'] : [] }); break;
    }
    case 'preview': {
      // Uses the same dispatcher as result-card buttons, with a real evaluated
      // roll. Fixed totals keep success/failure branches deterministic without
      // replacing dice methods, handlers or PF2e globals.
      const { previewActionResults } = await import('../../scripts/chat/services/preview/preview-service.js');
      const actor = value.action === 'seek' ? observer : subject;
      const RollClass = foundry.dice.Roll;
      const roll = await new RollClass(String(value.total ?? 40)).evaluate();
      const message = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ token: actor }), rolls: [roll], flags });
      await previewActionResults({ actionType: value.action, actor, actorToken: actor, roll,
        messageId: message.id, message, ignoreAllies: false, isStealthInitiative: value.initiative === true });
      break;
    }
    case 'search': {
      const { openSearchExplorationResults } = await import('../../scripts/chat/services/search-exploration-service.js');
      await observer.document.setFlag(MODULE, 'searchExploration', true);
      const roll = await new foundry.dice.Roll(String(value.total ?? 50)).evaluate();
      await openSearchExplorationResults(observer, { roll, rangeFeet: value.range ?? 30 }); break;
    }
    case 'next-turn': {
      const combat = game.combats.find(c => c.scene?.id === fixture.scene && c.getFlag(MODULE, 'liveTestRun') === runId);
      if (!combat) throw Error('Fixture encounter missing');
      if (!combat.started || !combat.turns.length) throw Error('Started fixture encounter with participants required');
      const turn = (combat.turn + 1) % combat.turns.length;
      // A native encounter update runs turn hooks without advancing the shared
      // campaign clock. Combat.nextTurn can otherwise age unrelated effects.
      await combat.update({ round: combat.round + (turn === 0 ? 1 : 0), turn }, { advanceTime: 0 }); break;
    }
    case 'initiative': {
      const combat = game.combats.find(c => c.scene?.id === fixture.scene && c.getFlag(MODULE, 'liveTestRun') === runId);
      if (!combat) throw Error('Fixture encounter missing');
      await subject.actor.update({ 'system.initiative.statistic': 'stealth' });
      const combatant = combat.combatants.find(c => c.tokenId === subject.id);
      await combat.rollInitiative([combatant.id], { updateTurn: false, skipDialog: true, messageOptions: { flags } }); break;
    }
    case 'initiative-values': {
      const combat = game.combats.find(c => c.scene?.id === fixture.scene && c.getFlag(MODULE, 'liveTestRun') === runId);
      if (!combat || combat.started) throw Error('Unstarted fixture encounter required');
      await combat.updateEmbeddedDocuments('Combatant', combat.combatants.map(c => ({ _id: c.id,
        initiative: c.tokenId === target.id ? value.target : value.observer,
        'flags.pf2e.initiativeStatistic': c.tokenId === target.id ? 'stealth' : 'perception',
      })));
      await combat.startCombat(); break;
    }
    case 'combat-delete': {
      for (const combat of game.combats.filter(c => c.scene?.id === fixture.scene && c.getFlag(MODULE, 'liveTestRun') === runId)) await combat.delete();
      break;
    }
    case 'link-spotter': {
      const { api } = await import('../../scripts/api.js');
      if (value.clear) await api.clearSnipingDuoSpotter(observer);
      else await api.setSnipingDuoSpotter(observer, canvas.tokens.get(fixture.secondObserver));
      break;
    }
    case 'link-vision': {
      const { autoVisibility } = await import('../../scripts/api.js');
      if (value.clear) await autoVisibility.clearVisionMaster(observer);
      else await autoVisibility.setVisionMaster(observer, canvas.tokens.get(fixture.secondObserver), value?.mode ?? 'one-way');
      break;
    }
    case 'delete-partner': await canvas.scene.deleteEmbeddedDocuments('Token', [fixture.secondObserver]); break;
    default: throw Error(`Unknown workflow mutation: ${operation}`);
  }
}

export async function inspectWorkflow(fixture) {
  const observer = canvas.tokens.get(fixture.observer), target = canvas.tokens.get(fixture.target);
  const { api } = await import('../../scripts/api.js');
  const { getVisibilityBetween } = await import('../../scripts/stores/visibility-map.js');
  const { tokenHasActiveTakeCoverState } = await import('../../scripts/chat/services/take-cover-expiration-service.js');
  const partner = canvas.tokens.get(fixture.secondObserver);
  const strike = game.messages.filter(m => m.speaker?.scene === fixture.scene && m.speaker?.actor === observer.actor.id &&
    String(m.flags.pf2e?.context?.type).includes('attack-roll')).at(-1);
  const strikeOptions = strike?.flags.pf2e?.context?.options ?? [];
  return { observerX: observer.document.x, observerY: observer.document.y,
    targetX: target.document.x, targetY: target.document.y,
    clones: canvas.tokens.preview.children.length,
    encounterStarted: game.combat?.scene?.id === fixture.scene && game.combat.started,
    encounterParticipants: game.combat?.scene?.id === fixture.scene ? game.combat.combatants.size : 0,
    secondState: partner ? getVisibilityBetween(partner, target) : null,
    takeCoverActive: tokenHasActiveTakeCoverState(target),
    hasSpotter: !!api.getSnipingDuoSpotter(observer),
    hasVisionMaster: !!observer.document.getFlag(MODULE, 'visionMasterTokenId'),
    levelCount: canvas.scene.levels?.size ?? 0,
    floorCount: canvas.scene.regions.filter(r => r.name === 'QA Floor').length,
    wallCover: canvas.scene.walls.contents[0]?.getFlag(MODULE, 'coverOverride') ?? null,
    tileCover: canvas.scene.tiles.contents[0]?.getFlag(MODULE, 'coverOverride') ?? null,
    strikeRollHidden: strikeOptions.includes('target:condition:hidden'),
    strikeDC: strike?.flags.pf2e?.context?.dc?.value ?? null,
    strikeCover: strikeOptions.find(option => option.startsWith('target:cover-level:'))?.split(':').at(-1) ?? null,
    strikeOffGuardSuppressed: !!strike?.flags[MODULE]?.offGuardSuppression,
    validationDialogs: document.querySelectorAll('.override-validation-dialog').length,
    legacyMovementText: [...document.querySelectorAll('.application, .window-app')].some(el => /Token Overrides has moved/.test(el.textContent)),
  };
}
