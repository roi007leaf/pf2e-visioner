// Facade around seek template helpers to keep UI layer clean

export async function setupSeekTemplate(actionData) {
  const { notify } = await import('../infra/notifications.js');

  notify.info(game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.SETUP_TEMPLATE_TOOLTIP'));

  // Clean up any existing seek templates for this actor before creating a new one
  await cleanupOrphanedSeekTemplates(actionData.actor?.id, game.userId);

  const distance = 15;
  if (game.user.isGM) {
    const tplData = {
      t: 'circle',
      user: game.userId,
      distance,
      fillColor: game.user?.color || '#ff9800',
      borderColor: game.user?.color || '#ff9800',
      texture: null,
      flags: {
        'pf2e-visioner': {
          seekPreviewManual: true,
          messageId: actionData.messageId,
          actorTokenId: actionData.actor.id,
        },
        'pf2e-toolbelt': { betterTemplate: { skip: true } },
      },
    };
    let dispatched = false;
    await new Promise((resolve) => {
      const createHookId = Hooks.on('createMeasuredTemplate', async (doc) => {
        if (!doc || doc.user?.id !== game.userId) return;
        try {
          Hooks.off('createMeasuredTemplate', createHookId);
          try {
            await doc.update({
              [`flags.pf2e-visioner.seekPreviewManual`]: true,
              [`flags.pf2e-visioner.messageId`]: actionData.messageId,
              [`flags.pf2e-visioner.actorTokenId`]: actionData.actor.id,
            });
          } catch (_) { }
          actionData.seekTemplateCenter = { x: doc.x, y: doc.y };
          actionData.seekTemplateRadiusFeet = Number(doc.distance) || distance;
          // Determine presence of potential targets within template by proximity
          const tokens = canvas?.tokens?.placeables || [];
          const targets = tokens.filter((t) => t && t !== actionData.actor && t.actor);
          if (!dispatched && targets.length > 0) {
            dispatched = true;
            const { previewActionResults } = await import('../preview/preview-service.js');
            await previewActionResults({ ...actionData, actionType: 'seek' });
          }
          updateSeekTemplateButton(actionData, true);
        } finally {
          resolve();
        }
      });
      const layer = canvas?.templates;
      if (typeof layer?.createPreview === 'function') layer.createPreview(tplData);
      else if (typeof MeasuredTemplate?.createPreview === 'function')
        MeasuredTemplate.createPreview(tplData);
      else {
        const pointerHandler = async (event) => {
          canvas.stage.off('pointerdown', pointerHandler);
          try {
            const local = event.data.getLocalPosition(canvas.stage);
            const snapped = canvas.grid?.getSnappedPosition?.(local.x, local.y, 2) || {
              x: local.x,
              y: local.y,
            };
            const [created] = await canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [
              { ...tplData, x: snapped.x, y: snapped.y },
            ]);
            if (created) {
              try {
                await canvas.scene.updateEmbeddedDocuments('MeasuredTemplate', [
                  {
                    _id: created.id,
                    [`flags.pf2e-visioner.seekPreviewManual`]: true,
                    [`flags.pf2e-visioner.messageId`]: actionData.messageId,
                    [`flags.pf2e-visioner.actorTokenId`]: actionData.actor.id,
                  },
                ]);
              } catch (_) { }
              actionData.seekTemplateCenter = { x: created.x, y: created.y };
              actionData.seekTemplateRadiusFeet = Number(created.distance) || distance;
              const tokens = canvas?.tokens?.placeables || [];
              const targets = tokens.filter((t) => t && t !== actionData.actor && t.actor);
              if (targets.length > 0) {
                const { previewActionResults } = await import('../preview/preview-service.js');
                await previewActionResults({ ...actionData, actionType: 'seek' });
              }
              updateSeekTemplateButton(actionData, true);
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
  // Player path
  const tplData = {
    t: 'circle',
    user: game.userId,
    distance,
    fillColor: game.user?.color || '#ff9800',
    borderColor: game.user?.color || '#ff9800',
    texture: null,
    flags: { 'pf2e-toolbelt': { betterTemplate: { skip: true } } },
  };
  let usedPreview = false;
  await new Promise((resolve) => {
    const createHookId = Hooks.on('createMeasuredTemplate', async (doc) => {
      if (!doc || doc.user?.id !== game.userId) return;
      try {
        Hooks.off('createMeasuredTemplate', createHookId);
        usedPreview = true;
        const center = { x: doc.x, y: doc.y };
        const radius = Number(doc.distance) || distance;
        actionData.seekTemplateCenter = center;
        actionData.seekTemplateRadiusFeet = radius;
        // Keep the player's template on the scene so the GM can reuse it
        try {
          await doc.update({
            ['flags.pf2e-visioner.seekPreviewManual']: true,
            ['flags.pf2e-visioner.messageId']: actionData.messageId,
            ['flags.pf2e-visioner.actorTokenId']: actionData.actor.id,
          });
        } catch (_) { }
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
            await msg.update({
              ['flags.pf2e-visioner.seekTemplate']: {
                center,
                radiusFeet: radius,
                actorTokenId: actionData.actor.id,
                rollTotal: actionData.roll?.total ?? null,
                dieResult:
                  actionData.roll?.dice?.[0]?.total ?? actionData.roll?.terms?.[0]?.total ?? null,
                fromUserId: game.userId,
                hasTargets,
              },
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
        );
      } finally {
        resolve();
      }
    });
    const layer = canvas?.templates;
    if (typeof layer?.createPreview === 'function') layer.createPreview(tplData);
    else if (typeof MeasuredTemplate?.createPreview === 'function')
      MeasuredTemplate.createPreview(tplData);
    else {
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
              await msg.update({
                ['flags.pf2e-visioner.seekTemplate']: {
                  center: actionData.seekTemplateCenter,
                  radiusFeet: distance,
                  actorTokenId: actionData.actor.id,
                  rollTotal: actionData.roll?.total ?? null,
                  dieResult:
                    actionData.roll?.dice?.[0]?.total ?? actionData.roll?.terms?.[0]?.total ?? null,
                  fromUserId: game.userId,
                  hasTargets,
                },
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

    // Get all templates on the scene
    const allTemplates = canvas.scene.templates;

    // First, try to remove templates by exact message ID match (most specific)
    let toRemove = allTemplates
      .filter((t) => {
        const flags = t?.flags?.['pf2e-visioner'];
        const isSeekTemplate = flags?.seekPreviewManual || flags?.seekTemplate;
        const matchesMessage = flags?.messageId === actionData.messageId;
        const matchesActor = flags?.actorTokenId === actionData.actor?.id;
        const matchesUser = t?.user?.id === game.userId;

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
          const matchesUser = t?.user?.id === game.userId;

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
          const matchesUser = t?.user?.id === game.userId;

          // User fallback: any seek template by the current user
          return isSeekTemplate && matchesUser;
        })
        .map((t) => t.id);
    }

    if (toRemove.length) {
      await canvas.scene.deleteEmbeddedDocuments('MeasuredTemplate', toRemove);
    }

    // Clear the action data
    delete actionData.seekTemplateCenter;
    delete actionData.seekTemplateRadiusFeet;

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
    const allTemplates = canvas.scene.templates;
    const orphanedTemplates = allTemplates
      .filter((t) => {
        const flags = t?.flags?.['pf2e-visioner'];
        const isSeekTemplate = flags?.seekPreviewManual || flags?.seekTemplate;
        const matchesActor = flags?.actorTokenId === actorId;
        const matchesUser = t?.user?.id === userId;

        // Check if the message still exists
        const messageExists = game.messages.has(flags?.messageId);

        return isSeekTemplate && matchesActor && matchesUser && !messageExists;
      })
      .map((t) => t.id);

    if (orphanedTemplates.length > 0) {
      await canvas.scene.deleteEmbeddedDocuments('MeasuredTemplate', orphanedTemplates);
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
