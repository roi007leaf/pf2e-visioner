const MODULE = 'pf2e-visioner';

export function auditTokens(fixture) {
  const scene = canvas.scene;
  const run = scene?.getFlag(MODULE, 'liveTestRun');
  if (!run || scene.id !== fixture.scene) throw Error('Owned audit scene required');
  const observer = canvas.tokens.get(fixture.observer), target = canvas.tokens.get(fixture.target);
  for (const token of [observer, target]) if (!token ||
    token.document.getFlag(MODULE, 'liveTestRun') !== run || token.actor.getFlag(MODULE, 'liveTestRun') !== run) {
    throw Error('Owned audit token and actor required');
  }
  return { scene, observer, target, run };
}

export async function mutateAudit(fixture, { action, ...value }) {
  const { scene, observer, target, run } = auditTokens(fixture);
  if (!game.user.isGM) throw Error('GM required for audit mutation');
  const { TimedOverrideManager: Timers } = await import('../../scripts/services/TimedOverrideManager.js');
  switch (action) {
    case 'template': {
      observer.control({ releaseOthers: true });
      const area = scene.regions.find(r => r.name === 'QA Spell Area');
      if (value.remove) { if (area) await area.delete(); }
      else if (area) await area.update({ shapes: [{ ...area.shapes[0].toObject(),
        ...(value.update.x !== undefined ? { x: value.update.x } : {}),
        ...(value.update.distance !== undefined ? { radius: value.update.distance * 20 } : {}),
      }] });
      else await scene.createEmbeddedDocuments('Region', [{ name: 'QA Spell Area',
        shapes: [{ type: 'circle', x: 450, y: 550, radius: 600 }],
        displayMeasurements: true, highlightMode: 'coverage', ownership: { [game.user.id]: 3 }, flags: {
          [MODULE]: { liveTestRun: run }, pf2e: { areaShape: 'burst', origin: { type: 'spell', actorId: observer.actor.id } },
        } }]);
      break;
    }
    case 'save': {
      target.control({ releaseOthers: true });
      await target.actor.saves[value.statistic].roll({ dc: { value: 20 }, skipDialog: true,
        extraRollOptions: value.area ? ['area-effect'] : [], event: new MouseEvent('click', { shiftKey: true }) });
      break;
    }
    case 'connected-hidden-walls': {
      await scene.createEmbeddedDocuments('Wall', ['Alpha', 'Beta'].map((name, i) => ({
        c: [600, 450 + i * 100, 600, 550 + i * 100], sight: 20, move: 20, sound: 20, door: 1,
        flags: { [MODULE]: { liveTestRun: run, wallIdentifier: `QA ${name}`, stealthDC: 15,
          hiddenWall: true, connectedWalls: [`QA ${i ? 'Alpha' : 'Beta'}`] } },
      })));
      break;
    }
    case 'party': {
      await observer.actor.update({ [`prototypeToken.flags.${MODULE}.liveTestRun`]: run });
      const party = await globalThis.Actor.create({ name: 'Visioner QA Party', type: 'party',
        flags: { [MODULE]: { liveTestRun: run } },
        system: { details: { members: [{ uuid: observer.actor.uuid }] } } });
      const doc = await party.getTokenDocument({ actorLink: true, x: 400, y: 500,
        flags: { [MODULE]: { liveTestRun: run } } });
      const data = doc.toObject(); delete data._id;
      const [token] = await scene.createEmbeddedDocuments('Token', [data]);
      token.object.control({ releaseOthers: true });
      canvas.hud.token.bind(token.object);
      break;
    }
    case 'future-pc': {
      const data = observer.actor.toObject(); delete data._id;
      data.name = 'QA Future PC'; data.items = [];
      const actor = await globalThis.Actor.create(data);
      const token = await actor.getTokenDocument({ actorLink: true, x: 400, y: 700, sight: { enabled: true },
        flags: { [MODULE]: { liveTestRun: run } } });
      const source = token.toObject(); delete source._id;
      const [created] = await scene.createEmbeddedDocuments('Token', [source]);
      await scene.setFlag(MODULE, 'qaFutureObserverId', created.id);
      break;
    }
    case 'prep-walls': {
      await scene.createEmbeddedDocuments('Wall', [{ c: [300, 100, 500, 100], sight: 20, move: 20, sound: 20,
        flags: { [MODULE]: { liveTestRun: run, hiddenWall: true } } }]);
      break;
    }
    case 'manager-walls': {
      await scene.createEmbeddedDocuments('Wall', ['Alpha', 'Beta'].map((name, i) => ({
        c: [300 + i * 100, 100, 400 + i * 100, 100], sight: 20, move: 20, sound: 20,
        flags: { [MODULE]: { liveTestRun: run, wallIdentifier: `QA ${name}` } },
      })));
      break;
    }
    case 'wall-manager': {
      const { VisionerWallManager } = await import('../../scripts/managers/wall-manager/WallManager.js');
      await new VisionerWallManager().render(true); break;
    }
    case 'terrain': {
      for (const region of scene.regions.filter(r => r.name === 'QA Terrain')) await region.delete();
      if (value.difficulty) await scene.createEmbeddedDocuments('Region', [{ name: 'QA Terrain',
        flags: { [MODULE]: { liveTestRun: run } },
        shapes: [{ type: 'rectangle', x: 300, y: 400, width: 500, height: 300, rotation: 0, hole: false }],
        behaviors: [{ type: 'modifyMovementCost', system: { difficulties: Object.fromEntries(
          Object.keys(CONFIG.RegionBehavior.dataModels.modifyMovementCost.schema.fields.difficulties.fields)
            .map(action => [action, value.difficulty]),
        ) } }],
      }]);
      break;
    }
    case 'token-config': await observer.document.sheet.render(true); break;
    case 'remove-observer-combatant': {
      const combat = game.combat;
      if (combat?.getFlag(MODULE, 'liveTestRun') !== run) throw Error('Owned encounter required');
      await combat.deleteEmbeddedDocuments('Combatant', combat.combatants.filter(c => c.tokenId === observer.id).map(c => c.id));
      break;
    }
    case 'manual-pairs': {
      const { default: Overrides } = await import('../../scripts/chat/services/infra/AvsOverrideManager.js');
      const second = canvas.tokens.get(fixture.secondObserver);
      if (!second || second.document.getFlag(MODULE, 'liveTestRun') !== run) throw Error('Owned second observer required');
      for (const source of [observer, second]) await Overrides.applyOverrides(source,
        new Map([[target.id, { target, state: 'hidden' }]]), { source: 'manual_action' });
      break;
    }
    case 'timer': {
      const config = { ...value.config };
      if (value.turn) config.expiresOnTurn = { actorId: game.combat.combatant.actorId, timing: value.turn };
      if (!await Timers.createTimedOverride(observer, target, 'hidden', config)) throw Error('Timer was not created');
      break;
    }
    case 'cancel-timer': if (!await Timers.cancelTimer(observer.id, target.id)) throw Error('Timer cancellation failed'); break;
    case 'timer-dialog': {
      const { TimerDurationDialog } = await import('../../scripts/ui/TimerDurationDialog.js');
      await new TimerDurationDialog({ observerToken: observer, targetToken: target, newState: 'hidden',
        onApply: config => Timers.createTimedOverride(observer, target, 'hidden', config),
      }).render(true); break;
    }
    case 'scene-data': await scene.update(value.data); break;
    case 'peek-wall': {
      await scene.deleteEmbeddedDocuments('Wall', scene.walls.map(w => w.id));
      await scene.createEmbeddedDocuments('Wall', [{ c: value.corner ? [500, 500, 500, 1400] : [550, 500, 550, 600],
        sight: 20, move: 20, sound: 20, door: value.corner ? 0 : 1, ds: 0,
        flags: { [MODULE]: { liveTestRun: run, peekAllowed: true } },
      }]);
      if (!value.corner) await scene.createEmbeddedDocuments('Wall', [
        [550, 0, 550, 500], [550, 600, 550, 1400],
      ].map(c => ({ c, sight: 20, move: 20, sound: 20, flags: { [MODULE]: { liveTestRun: run } } })));
      break;
    }
    default: throw Error(`Unknown audit mutation: ${action}`);
  }
}

export async function inspectAudit(fixture) {
  const { observer, target } = auditTokens(fixture);
  const { TimedOverrideManager: Timers } = await import('../../scripts/services/TimedOverrideManager.js');
  const timer = Timers.getTimerData(observer.id, target.id);
  const peek = game.modules.get(MODULE).api.peekManager.getActivePeek(observer.id);
  const pending = game.modules.get(MODULE).api.peekManager._pendingDoorApprovals;
  const { isTokenInEncounter } = await import('../../scripts/chat/services/infra/shared-utils.js');
  const { default: templates } = await import('../../scripts/cover/auto-cover/TemplateManager.js');
  const template = templates.getLatestTemplateForTarget(target.id);
  const save = game.messages.contents.findLast(m => m.getFlag(MODULE, 'liveTestRun') === canvas.scene.getFlag(MODULE, 'liveTestRun') && m.flags.pf2e?.context?.type === 'saving-throw');
  const measurement = fixture.measurePath ? observer.measureMovementPath(observer.createTerrainMovementPath([
    { x: 400, y: 500, elevation: 0, action: 'walk' }, { x: 600, y: 500, elevation: 0, action: 'walk' },
  ])) : null;
  return {
    futureObserver: canvas.scene.getFlag(MODULE, 'qaFutureObserverId') ?? null,
    templateCover: template?.data.targets[target.id]?.state ?? null,
    templateCreator: template?.data.creatorId === observer.id,
    templateCount: canvas.scene.regions.filter(r => r.name === 'QA Spell Area').length,
    templateDiagnostics: { userId: game.userId, cache: [...templates.getTemplatesData().values()],
      createHooks: Hooks.events.createMeasuredTemplate?.length ?? 0,
      documents: canvas.scene.regions.filter(r => r.name === 'QA Spell Area').map(t => ({ shapes: t.shapes.map(s => s.toObject()) })) },
    saveModifier: save?.rolls[0]?.options?.totalModifier ?? null,
    saveDiagnostics: save ? { context: save.flags.pf2e?.context, modifiers: save.flags.pf2e?.modifiers, rollOptions: save.rolls[0]?.options } : null,
    targetPrep: target.document.getFlag(MODULE, 'defaultPlayerVisibility') ?? null,
    targetFoundryHidden: target.document.hidden,
    observerHiddenWalls: Object.values(observer.document.getFlag(MODULE, 'walls') ?? {}).filter(v => v === 'hidden').length,
    observerDiscoveredWalls: Object.values(observer.document.getFlag(MODULE, 'walls') ?? {}).filter(v => v === 'observed').length,
    secondDiscoveredWalls: Object.values(canvas.tokens.get(fixture.secondObserver)?.document.getFlag(MODULE, 'walls') ?? {}).filter(v => v === 'observed').length,
    hiddenWalls: canvas.scene.walls.filter(w => w.getFlag(MODULE, 'hiddenWall')).length,
    standardWalls: canvas.scene.walls.filter(w => w.getFlag(MODULE, 'coverOverride') === 'standard').length,
    noCoverWalls: canvas.scene.walls.filter(w => w.getFlag(MODULE, 'coverOverride') === 'none').length,
    pathDistance: measurement?.distance ?? null, pathCost: measurement?.cost ?? null,
    movementDiagnostics: measurement ? {
      regions: canvas.scene.regions.map(r => ({ levels: [...r.levels], behaviors: r.behaviors.map(b => ({ viewed: b.viewed, system: b.system.toObject() })) })),
      segments: measurement.segments?.map(s => ({ action: s.action, terrain: s.terrain, cost: s.cost })),
    } : null,
    observerInEncounter: isTokenInEncounter(observer),
    storedAutoCover: observer.document.getFlag(MODULE, 'autoCoverMap')?.[target.id] ?? 'none',
    encounterMaster: observer.document.getFlag(MODULE, 'encounterMasterTokenId') || null,
    timerActive: Timers.hasActiveTimer(observer.id, target.id),
    timerType: timer?.type ?? null, timerRounds: timer?.roundsRemaining ?? null,
    pairOverride: !!target.document.getFlag(MODULE, `avs-override-from-${observer.id}`),
    secondPairOverride: !!target.document.getFlag(MODULE, `avs-override-from-${fixture.secondObserver}`),
    targetSystemConditions: target.actor.itemTypes.condition.filter(i => ['hidden', 'concealed', 'undetected'].includes(i.slug)).map(i => i.slug).sort().join(','),
    pairOverrideSource: target.document.getFlag(MODULE, `avs-override-from-${observer.id}`)?.source ?? null,
    peekActive: !!peek, peekRange: peek?.range ?? null, peekFov: peek?.fov ?? null,
    peekPending: [...pending.values()].filter(p => p.token?.id === observer.id).length,
    peekIgnoresDoor: !!peek?.ignoredWallIds?.length,
    peekDiagnostics: peek ? {
      origin: peek.origin, direction: peek.direction,
      losContainsTarget: observer.vision?.los?.contains(target.center.x, target.center.y),
      fovContainsTarget: observer.vision?.fov?.contains(target.center.x, target.center.y),
      walls: canvas.walls.placeables.map(w => ({ id: w.id, c: w.document.c, door: w.document.door,
        sight: w.edge?.sight, edgeTypes: w.edge?.types })),
    } : null,
  };
}

export async function peekAudit({ fixture, action, point }) {
  const { observer, target, scene } = auditTokens(fixture);
  if (!observer.isOwner || !observer.controlled) throw Error('Controlled owned observer required for peeking');
  const manager = game.modules.get(MODULE).api.peekManager;
  if (action === 'corner') manager.toggleCornerPeek(observer, point ?? { x: 475, y: 450 });
  else if (action === 'door') await manager.tryStartDoorPeek(observer, scene.walls.contents[0], point ?? target.center);
  else if (action === 'aim') manager.updatePeek(observer.id, point);
  else if (action === 'end') manager.endPeek(observer.id, 'qa-cleanup');
  else throw Error('Unsupported peek audit action');
}

export async function cleanupAuditTransients(runId) {
  if (canvas.scene?.getFlag(MODULE, 'liveTestRun') !== runId) return;
  const manager = game.modules.get(MODULE)?.api?.peekManager;
  const { default: templates } = await import('../../scripts/cover/auto-cover/TemplateManager.js');
  const ownedTokens = new Set(canvas.tokens.placeables.filter(t => t.document.getFlag(MODULE, 'liveTestRun') === runId).map(t => t.id));
  for (const [id, data] of templates.getTemplatesData()) {
    if (ownedTokens.has(data.creatorId) || canvas.scene.regions.get(id)?.getFlag(MODULE, 'liveTestRun') === runId) templates.removeTemplateData(id);
  }
  for (const id of ownedTokens) templates._templatesOrigins.delete(id);
  for (const [requestId, request] of manager?._pendingDoorApprovals ?? []) {
    if (ownedTokens.has(request.token?.id)) await manager.handleDoorPeekApprovalResponse({ requestId, approved: false });
  }
  for (const token of canvas.tokens.placeables) {
    if (token.document.getFlag(MODULE, 'liveTestRun') !== runId) continue;
    manager?.endPeek(token.id, 'qa-cleanup');
    if (manager?.getActivePeek(token.id)) throw Error('QA peek was not cleared');
  }
}
