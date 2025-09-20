import { extractActionData } from './action-extractor.js';
import { processedMessages } from './data/message-cache.js';

export async function handleRenderChatMessage(message, html) {
  // Always check for cover override indicators first, regardless of action data
  // Use singleton CoverUIManager instance
  const actionData = await extractActionData(message);
  if (!actionData) return;

  const hasPendingSeekTemplateForGM =
    actionData.actionType === 'seek' &&
    game.user.isGM &&
    !!message.flags?.['pf2e-visioner']?.seekTemplate;
  const hasPendingSeekTemplateForPlayerAuthor =
    actionData.actionType === 'seek' &&
    !game.user.isGM &&
    message.author?.id === game.user.id &&
    !!message.flags?.['pf2e-visioner']?.seekTemplate;
  const isPlayerPointOutAuthor =
    !game.user.isGM && actionData.actionType === 'point-out' && message.author?.id === game.user.id;

  const isGMPointOutAuthor =
    game.user.isGM && actionData.actionType === 'point-out' && message.author?.id === game.user.id;

  if (isPlayerPointOutAuthor) {
    try {
      let targetId = null;
      // Always prefer explicit PF2e target flag from the player's message; then their current target; then context
      try {
        targetId = message?.flags?.pf2e?.target?.token || null;
  } catch {}
      if (!targetId && game.user.targets?.size)
        targetId = Array.from(game.user.targets)[0]?.id || null;
      if (!targetId) targetId = actionData.context?.target?.token || null;

      // Check if this is a recent message (within last 5 seconds) to avoid showing dialog for old messages on reload
      const messageAge = Date.now() - (message.timestamp || 0);
      const isRecentMessage = messageAge < 5000; // 5 seconds

      // If no target found, show warning dialog to player (only for recent messages) and don't forward to GM
      if (!targetId) {
        if (isRecentMessage) {
          try {
            import('../../../scripts/chat/dialogs/point-out-warning-dialog.js').then(
              ({ showPointOutWarningDialog }) => {
                showPointOutWarningDialog();
              },
            );
          } catch (err) {
            console.warn('[PF2E Visioner] Point Out: Failed to show warning dialog:', err);
            // Fallback notification if dialog fails
            try {
              import('../infra/notifications.js').then(({ notify }) =>
                notify?.warn?.('Point Out requires a selected target token.'),
              );
            } catch {}
          }
        }
      } else {
        // Only forward to GM if we have a valid target
        import('../../services/socket.js').then(({ requestGMOpenPointOut }) =>
          requestGMOpenPointOut(actionData.actor.id, targetId, actionData.messageId),
        );
      }
    } catch (e) {
      try {
        console.warn('[PF2E Visioner] Failed to auto-forward Point Out to GM:', e);
  } catch {}
    }
    processedMessages.add(message.id);
    return;
  }

  // Handle GM-authored Point Out messages - show warning if GM used Point Out without target
  if (isGMPointOutAuthor) {
    try {
      let targetId = null;
      // Check for target using same logic as player messages
      try {
        targetId = message?.flags?.pf2e?.target?.token || null;
  } catch {}
      if (!targetId && game.user.targets?.size)
        targetId = Array.from(game.user.targets)[0]?.id || null;
      if (!targetId) targetId = actionData.context?.target?.token || null;

      // Check message age to only show warning for recent messages
      const messageAge = Date.now() - (message.timestamp || 0);
      const isRecentMessage = messageAge < 5000; // 5 seconds

      // If no target found, show warning dialog to GM
      if (!targetId && isRecentMessage) {
        try {
          import('../../../scripts/chat/dialogs/point-out-warning-dialog.js').then(
            ({ showPointOutWarningDialog }) => {
              showPointOutWarningDialog(false); // Pass isGM = false since it's for the GM's own action (show player-style message)
            },
          );
  } catch {
          try {
            import('../services/infra/notifications.js').then(({ notify }) =>
              notify?.warn?.('Point Out requires a selected target token.'),
            );
          } catch {}
        }
      } else if (targetId) {
        // GM has a valid target - set up message flags for button display (replicate socket handler logic)
        try {
          const targetToken = canvas.tokens.get(targetId);
          // Get the pointer token (GM's controlled token or first token they control)
          const pointerToken =
            canvas.tokens.controlled?.[0] ||
            (canvas?.tokens?.placeables || []).find((t) => t.isOwner);

          if (targetToken && pointerToken) {
            // Determine whether there are any allies that benefit from Point Out (copy socket handler logic)
            let hasTargets = false;
            try {
              const { getVisibilityBetween } = await import('../../utils.js');
              const allies = (canvas?.tokens?.placeables || []).filter(
                (t) =>
                  t &&
                  t.actor &&
                  t.actor?.type !== 'loot' &&
                  t.document.disposition === pointerToken.document.disposition, // Use POINTER disposition, not target
              );
              const cannotSee = allies.filter((ally) => {
                const vis = getVisibilityBetween(ally, targetToken);
                return vis === 'hidden' || vis === 'undetected';
              });
              hasTargets = cannotSee.length > 0;
            } catch {}

            // Update message flags to enable button display (match socket handler structure)
            await message.update({
              [`flags.pf2e-visioner.pointOut`]: {
                pointerTokenId: pointerToken.id,
                targetTokenId: targetId,
                hasTargets: hasTargets,
                fromUserId: game.user.id,
              },
            });

            // Re-render the message to show the automation buttons
            try {
              await message.render(true);
            } catch {}
          }
        } catch (e) {
          console.warn('[PF2E Visioner] Failed to set up GM Point Out flags:', e);
        }
      }
    } catch (e) {
      console.warn('[PF2E Visioner] Failed to process GM Point Out:', e);
    }
    // Don't return here - let normal UI injection proceed to show buttons
  }

  // Handle GM-side Point Out validation - show warning if player used Point Out without target
  const isGMProcessingPointOut =
    actionData.actionType === 'point-out' && game.user.isGM && message.author?.id !== game.user.id; // Only for messages from other players

  if (isGMProcessingPointOut) {
    try {
      // Check if this Point Out message has a valid target
      let hasValidTarget = false;
      try {
        hasValidTarget = !!message?.flags?.pf2e?.target?.token;
        if (!hasValidTarget && message?.flags?.['pf2e-visioner']?.pointOut?.targetTokenId) {
          hasValidTarget = true;
        }
  } catch {}

      // Check message age to only show warning for recent messages
      const messageAge = Date.now() - (message.timestamp || 0);
      const isRecentMessage = messageAge < 10000; // 10 seconds for GM (longer than player)

      // If no valid target found yet, wait a moment for socket processing before showing warning
      if (!hasValidTarget && isRecentMessage) {
        // Give socket handler time to process and update flags
        setTimeout(() => {
          // Re-check flags after socket processing
          const updatedMessage = game.messages.get(message.id);
          let stillNoTarget = true;
          try {
            stillNoTarget = !(
              updatedMessage?.flags?.pf2e?.target?.token ||
              updatedMessage?.flags?.['pf2e-visioner']?.pointOut?.targetTokenId
            );
          } catch {}

          if (stillNoTarget) {
            try {
              import('../../../scripts/chat/dialogs/point-out-warning-dialog.js').then(
                ({ showPointOutWarningDialog }) => {
                  showPointOutWarningDialog(true); // Pass isGM = true
                },
              );
            } catch (err) {
              console.warn('[PF2E Visioner] GM: Failed to show Point Out warning dialog:', err);
              try {
                import('../services/infra/notifications.js').then(({ notify }) =>
                  notify?.warn?.('Player used Point Out without selecting a target.'),
                );
              } catch {}
            }
          }
        }, 1000); // Wait 1 second for socket processing
      }
    } catch (e) {
      console.warn('[PF2E Visioner] Failed to process GM Point Out warning:', e);
    }
  }

  const hasPendingPointOutForGM =
    actionData.actionType === 'point-out' &&
    game.user.isGM &&
    !!message.flags?.['pf2e-visioner']?.pointOut;

  const isSeekTemplatePlayer =
    !game.user.isGM &&
    actionData.actionType === 'seek' &&
    game.settings.get('pf2e-visioner', 'seekUseTemplate') &&
    message.author?.id === game.user.id;

  // New: allow player-authored Sneak OR token owners to display the panel (for Start Sneak)
  const isSneakPlayerAuthor =
    !game.user.isGM && actionData.actionType === 'sneak' && message.author?.id === game.user.id;
  const isSneakTokenOwner =
    !game.user.isGM &&
    actionData.actionType === 'sneak' &&
    !!actionData.actor &&
    (actionData.actor.isOwner || actionData.actor?.document?.isOwner);

  // If this is a player-authored Sneak action (not GM) and sneak has not started yet for this message, add a waiting effect and lock movement
  try {
    if (actionData.actionType === 'sneak') {
      // Only apply waiting logic for non-GM authored Sneak rolls to avoid duplicating effects when GMs test or roll on behalf of players.
      const isGMAuthor = game.users?.get(message.author?.id || message.user)?.isGM;
      if (isGMAuthor) {
        // Ensure no stale waiting flag remains if GM previously forced a sneak
        try {
          const actorToken = actionData.actor;
          if (actorToken?.document?.getFlag('pf2e-visioner', 'waitingSneak')) {
            await actorToken.document.unsetFlag('pf2e-visioner', 'waitingSneak');
          }
        } catch {}
        // Skip effect creation entirely for GM-authored messages
        throw 'skip-waiting-effect';
      }

      const hasStartedSneak = message?.flags?.['pf2e-visioner']?.sneakStartStates;
      const actorToken = actionData.actor;
      const actor = actorToken?.actor || actorToken?.document?.actor || null;
      // Only the message author client should create the effect to prevent duplicates across connected players
      const isMessageAuthorClient = message.author?.id === game.user.id;
      if (actor && !hasStartedSneak && isMessageAuthorClient) {
        // Check for existing waiting effect by slug
        const existing = actor.itemTypes?.effect?.find?.(e => e?.system?.slug === 'waiting-for-sneak-start');
        if (!existing) {
          // Build minimal effect data (PF2E system requires certain fields)
          const effectData = {
            type: 'effect',
            name: 'Waiting to Start Sneak',
            system: {
              slug: 'waiting-for-sneak-start',
              tokenIcon: { show: true },
              duration: { value: -1, unit: 'unlimited', expiry: null, sustained: false },
              start: { value: game.time.worldTime },
              description: { value: 'Movement locked until Start Sneak is pressed or GM removes this effect.' },
              rules: [],
              level: { value: 0 },
              traits: { rarity: 'common', value: [] },
              // Mark as visioner generated
              source: { value: 'pf2e-visioner' },
            },
            flags: { core: { sourceId: null }, 'pf2e-visioner': { waitingSneak: true } },
          };
          try {
            await actor.createEmbeddedDocuments('Item', [effectData]);
          } catch (e) {
            console.warn('PF2E Visioner | Failed to create waiting-for-sneak-start effect:', e);
          }
          // Set token flag to make detection reliable across clients
          try {
            if (actorToken?.document) {
              await actorToken.document.setFlag('pf2e-visioner', 'waitingSneak', true);
            }
          } catch (e) {
            console.warn('PF2E Visioner | Failed to set waitingSneak flag on token:', e);
          }
          // Lock token movement client-side immediately (visual cue). Persistence is enforced by preUpdateToken hook.
          try {
            if (actorToken?.document?.id) {
              const tokenObj = canvas.tokens.get(actorToken.id);
              if (tokenObj) tokenObj.locked = true;
            }
          } catch {}
        } else {
          // Ensure token.locked reflects waiting state
            try {
              const tokenObj = canvas.tokens.get(actorToken.id);
              if (tokenObj) tokenObj.locked = true;
            } catch {}
          // Ensure flag exists if effect already did
          try {
            if (actorToken?.document && !actorToken.document.getFlag('pf2e-visioner', 'waitingSneak')) {
              await actorToken.document.setFlag('pf2e-visioner', 'waitingSneak', true);
            }
          } catch {}
        }
      }
    }
  } catch (e) {
    if (e !== 'skip-waiting-effect') {
      console.warn('PF2E Visioner | Error handling waiting-for-sneak-start effect:', e);
    }
  }

  if (!game.user.isGM && !isSeekTemplatePlayer && !isSneakPlayerAuthor && !isSneakTokenOwner)
    return;

  if (processedMessages.has(message.id)) {
    if (
      hasPendingSeekTemplateForGM ||
      hasPendingPointOutForGM ||
      hasPendingSeekTemplateForPlayerAuthor
    ) {
      try {
        processedMessages.delete(message.id);
  } catch {}
    } else {
      // Check if Visioner UI still exists in the DOM - if not, we need to re-inject it
      // This handles cases where message updates remove our injected panels
      const hasVisionerUI = html.find && html.find('.pf2e-visioner-automation-panel').length > 0;
      if (hasVisionerUI) {
        return; // UI still exists, no need to re-inject
      }
      // UI was removed by message update, allow re-injection
      try {
        processedMessages.delete(message.id);
  } catch {}
    }
  }

  import('./ui/ui-injector.js').then(({ injectAutomationUI }) =>
    injectAutomationUI(message, html, actionData),
  );
}
