// Facade around seek template helpers to keep UI layer clean

function getRegionDocumentClass() {
  return (
    globalThis.CONFIG?.Region?.documentClass ||
    globalThis.foundry?.documents?.RegionDocument ||
    globalThis.getDocumentClass?.('Region') ||
    null
  );
}

function getBaseRegionClass() {
  return globalThis.foundry?.documents?.BaseRegion || null;
}

function getSceneRegionCollection() {
  return Array.from(canvas?.scene?.regions || []);
}

function getSeekTemplateRegions({ actorId = null, messageId = null, userId = null } = {}) {
  return getSceneRegionCollection().filter((region) => {
    const flags = region?.flags?.['pf2e-visioner'];
    const isTemplate = region?.getFlag?.('core', 'MeasuredTemplate') || flags?.seekPreviewManual;
    if (!isTemplate) return false;
    if (actorId && flags?.actorTokenId !== actorId) return false;
    if (messageId && flags?.messageId !== messageId) return false;
    if (userId && flags?.userId !== userId) return false;
    return true;
  });
}

function buildRegionDataFromTemplate(template) {
  const BaseRegion = getBaseRegionClass();
  const grid = canvas?.scene?.grid || canvas?.grid?.grid;
  const users = (game?.users?.contents || []).map((user) => ({ _id: user.id, name: user.name }));
  const regionData = BaseRegion._migrateMeasuredTemplateData(template, {
    grid,
    gridTemplates: false,
    coneTemplateType: 'round',
    users,
  });
  regionData.levels = Array.isArray(template.levels) ? template.levels : [];
  regionData.flags = foundry.utils.mergeObject(regionData.flags || {}, {
    core: { MeasuredTemplate: true },
    'pf2e-visioner': {
      ...(template.flags?.['pf2e-visioner'] || {}),
      userId: template.flags?.['pf2e-visioner']?.userId || game.userId,
    },
    'pf2e-toolbelt': template.flags?.['pf2e-toolbelt'] || {},
  });
  return regionData;
}

async function createTemplateRegions(data) {
  const cls = getRegionDocumentClass();
  const migrated = data.map((item) => buildRegionDataFromTemplate(item));
  const created = cls?.createDocuments
    ? await cls.createDocuments(migrated, { parent: canvas.scene })
    : await canvas.scene.createEmbeddedDocuments('Region', migrated);

  for (let i = 0; i < created.length; i += 1) {
    const region = created[i];
    const levels = migrated[i]?.levels || [];
    if (levels.length > 0 && (!region?.levels || region.levels.size === 0)) {
      await region.update({ levels });
    }
  }

  return created;
}

function getTemplateStateFromRegion(region) {
  const shape = region?.shapes?.[0];
  const grid = canvas?.scene?.grid || canvas?.grid?.grid;
  const distancePixels = (grid?.size || 100) / (grid?.distance || 5);
  let templateType = 'circle';
  let center = { x: 0, y: 0 };
  let radiusFeet = 0;

  switch (shape?.type) {
    case 'cone':
      templateType = 'cone';
      center = { x: shape.x, y: shape.y };
      radiusFeet = (shape.radius || 0) / distancePixels;
      break;
    case 'line':
      templateType = 'ray';
      center = { x: shape.x, y: shape.y };
      radiusFeet = (shape.length || 0) / distancePixels;
      break;
    case 'circle':
    default:
      templateType = 'circle';
      center = { x: shape?.x || 0, y: shape?.y || 0 };
      radiusFeet = (shape?.radius || 0) / distancePixels;
      break;
  }

  return {
    center,
    radiusFeet,
    templateType,
    levels: Array.from(region?.levels || []),
  };
}

async function launchSeekTemplatePreview(layer, tplData) {
  if (typeof layer?.createPreview === 'function') {
    layer.createPreview(tplData);
    return true;
  }
  if (typeof MeasuredTemplate?.createPreview === 'function') {
    MeasuredTemplate.createPreview(tplData);
    return true;
  }
  if (typeof layer?._createPreview !== 'function') {
    return false;
  }

  const preview = await layer._createPreview(
    {
      ...tplData,
      x: tplData.x ?? 0,
      y: tplData.y ?? 0,
    },
    { renderSheet: false },
  );
  if (!preview) return false;

  const getSnapped = (event) => {
    const local = event.data.getLocalPosition(canvas.stage);
    return canvas.grid?.getSnappedPosition?.(local.x, local.y, 2) || {
      x: local.x,
      y: local.y,
    };
  };

  const destroyPreview = () => {
    try {
      canvas.stage.off('pointermove', moveHandler);
      canvas.stage.off('pointerdown', downHandler);
      preview?.destroy?.({ children: true });
    } catch (_) {}
  };

  const moveHandler = (event) => {
    const snapped = getSnapped(event);
    preview.document.updateSource({ x: snapped.x, y: snapped.y });
    preview.renderFlags?.set?.({ refreshPosition: true, refreshShape: true });
  };

  const downHandler = async (event) => {
    const snapped = getSnapped(event);
    destroyPreview();
    await createTemplateRegions([{ ...tplData, x: snapped.x, y: snapped.y }]);
  };

  canvas.stage.on('pointermove', moveHandler);
  canvas.stage.on('pointerdown', downHandler, { once: true });
  return true;
}

async function persistSeekTemplateFlag(actionData, data) {
  const msg = game.messages.get(actionData.messageId);
  if (!msg) return;

  await msg.update({
    ['flags.pf2e-visioner.seekTemplate']: data,
  });
  try {
    await msg.render(true);
  } catch (_) { }
}

async function clearSeekTemplateFlag(messageId) {
  const msg = game.messages.get(messageId);
  if (!msg) return;

  await msg.update({
    ['flags.pf2e-visioner.-=seekTemplate']: null,
  });
  try {
    await msg.render(true);
  } catch (_) { }
}

async function consumeSeekTemplateAfterDialog(actionData, regionId) {
  try {
    if (regionId && canvas?.scene) {
      await canvas.scene.deleteEmbeddedDocuments('Region', [regionId]);
    }
  } catch (_) { }

  try {
    await clearSeekTemplateFlag(actionData.messageId);
  } catch (_) { }

  try {
    updateSeekTemplateButton(actionData, false);
  } catch (_) { }
}

export async function setupSeekTemplate(actionData, skipDialog = false) {
  const { notify } = await import('../infra/notifications.js');
  const { MODULE_ID } = await import('../../../constants.js');

  let config = null;
  if (!skipDialog && !game.settings.get(MODULE_ID, 'seekTemplateSkipDialog')) {
    const { SeekTemplateConfigDialog } = await import('../../dialogs/SeekTemplateConfigDialog.js');
    config = await SeekTemplateConfigDialog.choose();
    if (!config) {
      return;
    }
  }

  const templateType = config?.templateType || 'circle';
  const radius = config?.radius || 15;
  const levels = Array.isArray(config?.levels) ? config.levels.filter(Boolean) : [];
  const distance = radius;

  notify.info(game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.SETUP_TEMPLATE_TOOLTIP'));

  await cleanupOrphanedSeekTemplates(actionData.actor?.id, game.userId);
  if (game.user.isGM) {
    const tplData = {
      t: templateType,
      author: game.userId,
      distance,
      fillColor: game.user?.color || '#ff9800',
      borderColor: game.user?.color || '#ff9800',
      texture: null,
      flags: {
        'pf2e-visioner': {
          seekPreviewManual: true,
          messageId: actionData.messageId,
          actorTokenId: actionData.actor.id,
          userId: game.userId,
        },
        'pf2e-toolbelt': { betterTemplate: { skip: true } },
      },
    };
    if (levels.length > 0) tplData.levels = levels;

    if (templateType === 'cone') {
      tplData.angle = 90;
      tplData.direction = 0;
    } else if (templateType === 'ray') {
      tplData.width = 5;
    }
    let dispatched = false;
    const layer = canvas?.templates;
    const launchedPreview = await launchSeekTemplatePreview(layer, tplData);
    await new Promise((resolve) => {
      const createHookId = Hooks.on('createRegion', async (doc) => {
        if (!doc?.getFlag?.('core', 'MeasuredTemplate')) return;
        if (doc.getFlag('pf2e-visioner', 'userId') !== game.userId) return;
        try {
          Hooks.off('createRegion', createHookId);
          const templateState = getTemplateStateFromRegion(doc);
          actionData.seekTemplateCenter = templateState.center;
          actionData.seekTemplateRadiusFeet = Number(templateState.radiusFeet) || distance;
          actionData.seekTemplateType = templateState.templateType || templateType;
          actionData.seekTemplateLevels = templateState.levels;
          let dialogOpened = false;
          // Determine presence of potential targets within template by proximity
          const tokens = canvas?.tokens?.placeables || [];
          const targets = tokens.filter((t) => t && t !== actionData.actor && t.actor);
          if (!dispatched && targets.length > 0) {
            dispatched = true;
            const { previewActionResults } = await import('../preview/preview-service.js');
            await previewActionResults({ ...actionData, actionType: 'seek' });
            const { SeekPreviewDialog } = await import('../../dialogs/SeekPreviewDialog.js');
            dialogOpened = !!SeekPreviewDialog.currentSeekDialog;
            if (dialogOpened) {
              await consumeSeekTemplateAfterDialog(actionData, doc.id);
            }
          }
          if (!dialogOpened) {
            await persistSeekTemplateFlag(actionData, {
              center: actionData.seekTemplateCenter,
              radiusFeet: actionData.seekTemplateRadiusFeet,
              templateType: actionData.seekTemplateType,
              levels: actionData.seekTemplateLevels,
              actorTokenId: actionData.actor.id,
              rollTotal: actionData.roll?.total ?? null,
              dieResult:
                actionData.roll?.dice?.[0]?.total ?? actionData.roll?.terms?.[0]?.total ?? null,
              fromUserId: game.userId,
              hasTargets: targets.length > 0,
            });
            updateSeekTemplateButton(actionData, true);
          }
        } finally {
          resolve();
        }
      });
      if (!launchedPreview) {
        const pointerHandler = async (event) => {
          canvas.stage.off('pointerdown', pointerHandler);
          try {
            const local = event.data.getLocalPosition(canvas.stage);
            const snapped = canvas.grid?.getSnappedPosition?.(local.x, local.y, 2) || {
              x: local.x,
              y: local.y,
            };
            const [created] = await createTemplateRegions([
              { ...tplData, x: snapped.x, y: snapped.y },
            ]);
            if (created) {
              const templateState = getTemplateStateFromRegion(created);
              actionData.seekTemplateCenter = templateState.center;
              actionData.seekTemplateRadiusFeet = Number(templateState.radiusFeet) || distance;
              actionData.seekTemplateType = templateState.templateType || templateType;
              actionData.seekTemplateLevels = templateState.levels;
              let dialogOpened = false;
              const tokens = canvas?.tokens?.placeables || [];
              const targets = tokens.filter((t) => t && t !== actionData.actor && t.actor);
              if (targets.length > 0) {
                const { previewActionResults } = await import('../preview/preview-service.js');
                await previewActionResults({ ...actionData, actionType: 'seek' });
                const { SeekPreviewDialog } = await import('../../dialogs/SeekPreviewDialog.js');
                dialogOpened = !!SeekPreviewDialog.currentSeekDialog;
                if (dialogOpened) {
                  await consumeSeekTemplateAfterDialog(actionData, created.id);
                }
              }
              if (!dialogOpened) {
                await persistSeekTemplateFlag(actionData, {
                  center: actionData.seekTemplateCenter,
                  radiusFeet: actionData.seekTemplateRadiusFeet,
                  templateType: actionData.seekTemplateType,
                  levels: actionData.seekTemplateLevels,
                  actorTokenId: actionData.actor.id,
                  rollTotal: actionData.roll?.total ?? null,
                  dieResult:
                    actionData.roll?.dice?.[0]?.total ?? actionData.roll?.terms?.[0]?.total ?? null,
                  fromUserId: game.userId,
                  hasTargets: targets.length > 0,
                });
                updateSeekTemplateButton(actionData, true);
              }
            }
          } finally {
            resolve();
          }
        };
        canvas.stage.on('pointerdown', pointerHandler, { once: true });
      }
    });
    return;
  }
  const tplData = {
    t: templateType,
    author: game.userId,
    distance,
    fillColor: game.user?.color || '#ff9800',
    borderColor: game.user?.color || '#ff9800',
    texture: null,
    flags: {
      'pf2e-visioner': {
        seekPreviewManual: true,
        messageId: actionData.messageId,
        actorTokenId: actionData.actor.id,
        userId: game.userId,
      },
      'pf2e-toolbelt': { betterTemplate: { skip: true } },
    },
  };
  if (levels.length > 0) tplData.levels = levels;

  if (templateType === 'cone') {
    tplData.angle = 90;
    tplData.direction = 0;
  } else if (templateType === 'ray') {
    tplData.width = 5;
  }
  let usedPreview = false;
  const layer = canvas?.templates;
  const launchedPreview = await launchSeekTemplatePreview(layer, tplData);
  await new Promise((resolve) => {
    const createHookId = Hooks.on('createRegion', async (doc) => {
      if (!doc?.getFlag?.('core', 'MeasuredTemplate')) return;
      if (doc.getFlag('pf2e-visioner', 'userId') !== game.userId) return;
      try {
        Hooks.off('createRegion', createHookId);
        usedPreview = true;
        const templateState = getTemplateStateFromRegion(doc);
        const center = templateState.center;
        const radius = Number(templateState.radiusFeet) || distance;
        actionData.seekTemplateCenter = center;
        actionData.seekTemplateRadiusFeet = radius;
        actionData.seekTemplateType = templateState.templateType || templateType;
        actionData.seekTemplateLevels = templateState.levels;
        updateSeekTemplateButton(actionData, true);
        const { requestGMOpenSeekWithTemplate } = await import('../../socket.js');
        try {
          // Best-effort: annotate the chat message flags immediately so GM panel can switch without relying solely on sockets
          const msg = game.messages.get(actionData.messageId);
          if (msg) {
            const all = canvas?.tokens?.placeables || [];
            const targets = all.filter((t) => t && t !== actionData.actor && t.actor);
            const { isTokenWithinTemplate } = await import('../infra/shared-utils.js');
            const hasTargets = targets.some((t) => isTokenWithinTemplate(center, radius, t));
            await persistSeekTemplateFlag(actionData, {
              center,
              radiusFeet: radius,
              templateType: actionData.seekTemplateType,
              levels: actionData.seekTemplateLevels,
              actorTokenId: actionData.actor.id,
              rollTotal: actionData.roll?.total ?? null,
              dieResult:
                actionData.roll?.dice?.[0]?.total ?? actionData.roll?.terms?.[0]?.total ?? null,
              fromUserId: game.userId,
              hasTargets,
            });
          }
        } catch (_) { }
        const roll = actionData.roll || game.messages.get(actionData.messageId)?.rolls?.[0] || null;
        const rollTotal = roll?.total ?? null;
        const dieResult = roll?.dice?.[0]?.total ?? roll?.terms?.[0]?.total ?? null;
        requestGMOpenSeekWithTemplate(
          actionData.actor.id,
          center,
          radius,
          actionData.messageId,
          rollTotal,
          dieResult,
          actionData.seekTemplateType,
          actionData.seekTemplateLevels,
        );
      } finally {
        resolve();
      }
    });
    if (!launchedPreview) {
      resolve();
    }
  });
  if (!usedPreview) {
    await new Promise((resolve) => {
      const pointerHandler = async (event) => {
        canvas.stage.off('pointerdown', pointerHandler);
        try {
          const local = event.data.getLocalPosition(canvas.stage);
          const snapped = canvas.grid?.getSnappedPosition?.(local.x, local.y, 2) || {
            x: local.x,
            y: local.y,
          };
          actionData.seekTemplateCenter = { x: snapped.x, y: snapped.y };
          actionData.seekTemplateRadiusFeet = distance;
          actionData.seekTemplateType = templateType;
          actionData.seekTemplateLevels = levels;
          const { requestGMOpenSeekWithTemplate } = await import('../../socket.js');
          try {
            // Best-effort: annotate chat message flags immediately
            const msg = game.messages.get(actionData.messageId);
            if (msg) {
              const all = canvas?.tokens?.placeables || [];
              const targets = all.filter((t) => t && t !== actionData.actor && t.actor);
              const { isTokenWithinTemplate } = await import('../infra/shared-utils.js');
              const hasTargets = targets.some((t) =>
                isTokenWithinTemplate(actionData.seekTemplateCenter, distance, t),
              );
              await persistSeekTemplateFlag(actionData, {
                center: actionData.seekTemplateCenter,
                radiusFeet: distance,
                templateType,
                levels,
                actorTokenId: actionData.actor.id,
                rollTotal: actionData.roll?.total ?? null,
                dieResult:
                  actionData.roll?.dice?.[0]?.total ?? actionData.roll?.terms?.[0]?.total ?? null,
                fromUserId: game.userId,
                hasTargets,
              });
            }
          } catch (_) { }
          const roll =
            actionData.roll || game.messages.get(actionData.messageId)?.rolls?.[0] || null;
          const rollTotal = roll?.total ?? null;
          const dieResult = roll?.dice?.[0]?.total ?? roll?.terms?.[0]?.total ?? null;
          requestGMOpenSeekWithTemplate(
            actionData.actor.id,
            actionData.seekTemplateCenter,
            actionData.seekTemplateRadiusFeet,
            actionData.messageId,
            rollTotal,
            dieResult,
            templateType,
            levels,
          );
          const tokens = canvas?.tokens?.placeables || [];
          const targets = tokens.filter((t) => t && t !== actionData.actor && t.actor);
          if (targets.length === 0) {
            const { notify } = await import('../infra/notifications.js');
            notify.info('No valid targets within template');
          }
        } finally {
          resolve();
        }
      };
      canvas.stage.on('pointerdown', pointerHandler, { once: true });
    });
  }
}

export async function removeSeekTemplate(actionData) {
  if (!canvas?.scene?.templates) return;
  try {
    // First, clean up any orphaned seek templates for this actor/user
    await cleanupOrphanedSeekTemplates(actionData.actor?.id, game.userId);

    // Get all seek template regions on the scene
    const allTemplates = getSeekTemplateRegions();

    // First, try to remove templates by exact message ID match (most specific)
    let toRemove = allTemplates
      .filter((t) => {
        const flags = t?.flags?.['pf2e-visioner'];
        const isSeekTemplate = flags?.seekPreviewManual || flags?.seekTemplate;
        const matchesMessage = flags?.messageId === actionData.messageId;
        const matchesActor = flags?.actorTokenId === actionData.actor?.id;
        const matchesUser = flags?.userId === game.userId;

        // Exact match: seek template, same message, same actor, same user
        return isSeekTemplate && matchesMessage && matchesActor && matchesUser;
      })
      .map((t) => t.id);

    // If no exact matches found, try to remove by actor ID (for reroll scenarios)
    if (toRemove.length === 0) {
      toRemove = allTemplates
        .filter((t) => {
          const flags = t?.flags?.['pf2e-visioner'];
          const isSeekTemplate = flags?.seekPreviewManual || flags?.seekTemplate;
          const matchesActor = flags?.actorTokenId === actionData.actor?.id;
          const matchesUser = flags?.userId === game.userId;

          // Actor match: seek template, same actor, same user (message ID might be different due to reroll)
          return isSeekTemplate && matchesActor && matchesUser;
        })
        .map((t) => t.id);
    }

    // If still no matches, try to remove any seek templates by the current user (fallback)
    if (toRemove.length === 0) {
      toRemove = allTemplates
        .filter((t) => {
          const flags = t?.flags?.['pf2e-visioner'];
          const isSeekTemplate = flags?.seekPreviewManual || flags?.seekTemplate;
          const matchesUser = flags?.userId === game.userId;

          // User fallback: any seek template by the current user
          return isSeekTemplate && matchesUser;
        })
        .map((t) => t.id);
    }

    if (toRemove.length) {
      await canvas.scene.deleteEmbeddedDocuments('Region', toRemove);
    }

    // Clear the action data
    delete actionData.seekTemplateCenter;
    delete actionData.seekTemplateRadiusFeet;
    delete actionData.seekTemplateLevels;

    try {
      await clearSeekTemplateFlag(actionData.messageId);
    } catch (_) { }

    const { notify } = await import('../infra/notifications.js');
    notify.info(game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.REMOVE_TEMPLATE'));

    // Button state update is now handled in the event binder after UI re-injection

    // Force a small delay to ensure UI updates are processed
    await new Promise((resolve) => setTimeout(resolve, 50));
  } catch (error) {
    const { log } = await import('../infra/notifications.js');
    log.error('Failed to remove Seek template:', error);
  }
}

/**
 * Clean up any orphaned seek templates for a specific actor/user combination
 * This helps with reroll scenarios where old templates might still exist
 */
async function cleanupOrphanedSeekTemplates(actorId, userId) {
  if (!canvas?.scene?.templates || !actorId || !userId) return;

  try {
    const allTemplates = getSeekTemplateRegions({ actorId, userId });
    const orphanedTemplates = allTemplates
      .filter((t) => {
        const flags = t?.flags?.['pf2e-visioner'];
        const isSeekTemplate = flags?.seekPreviewManual || flags?.seekTemplate;
        const matchesActor = flags?.actorTokenId === actorId;
        const matchesUser = flags?.userId === userId;

        // Check if the message still exists
        const messageExists = game.messages.has(flags?.messageId);

        return isSeekTemplate && matchesActor && matchesUser && !messageExists;
      })
      .map((t) => t.id);

    if (orphanedTemplates.length > 0) {
      await canvas.scene.deleteEmbeddedDocuments('Region', orphanedTemplates);
    }
  } catch (error) {
    console.warn('Failed to cleanup orphaned seek templates:', error);
  }
}

export function updateSeekTemplateButton(actionData, hasTemplate) {
  try {
    const panel = $(`.pf2e-visioner-automation-panel[data-message-id="${actionData.messageId}"]`);
    if (!panel?.length) {
      console.warn('No automation panel found for message:', actionData.messageId);
      return;
    }
    const btn = panel.find('button.setup-template');
    if (!btn?.length) {
      console.warn('No setup template button found in panel');
      return;
    }

    if (hasTemplate) {
      btn.attr('data-action', 'remove-seek-template');
      btn.attr('title', game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.SETUP_TEMPLATE_TOOLTIP'));
      btn.html(
        `<i class="fas fa-bullseye"></i> ${game.i18n.localize(
          'PF2E_VISIONER.SEEK_AUTOMATION.REMOVE_TEMPLATE',
        )}`,
      );
    } else {
      btn.attr('data-action', 'setup-seek-template');
      btn.attr('title', game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.SETUP_TEMPLATE_TOOLTIP'));
      btn.html(
        `<i class="fas fa-bullseye"></i> ${game.i18n.localize(
          'PF2E_VISIONER.SEEK_AUTOMATION.SETUP_TEMPLATE',
        )}`,
      );
    }
  } catch (error) {
    console.error('Error updating seek template button:', error);
  }
}
