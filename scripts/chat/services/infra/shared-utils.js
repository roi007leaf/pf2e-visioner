/**
 * Shared utilities for chat automation
 * Common functions used by both Seek and Point Out logic
 */

import { COVER_STATES, MODULE_ID, MODULE_TITLE } from '../../../constants.js';
import { CoverModifierService } from '../../../services/CoverModifierService.js';
import { refreshEveryonesPerception } from '../../../services/socket.js';
import { updateTokenVisuals } from '../../../services/visual-effects.js';
import { setVisibilityBetween } from '../../../utils.js';
import { notify } from './notifications.js';
import AvsOverrideManager from './avs-override-manager.js';

/**
 * Set AVS pair overrides to prevent automatic recalculation of manually set visibility states
 * This is crucial for actions like sneak where we don't want AVS to override our manual changes
 * @param {Token} observer - The observing token
 * @param {Map} changesByTarget - Map of target changes
 * @param {Object} options - Application options
 */
// setAVSPairOverrides has moved to AvsOverrideManager. Keep a thin delegate for backward compatibility.
export async function setAVSPairOverrides(observer, changesByTarget, options = {}) {
  return AvsOverrideManager.setPairOverrides(observer, changesByTarget, options);
}

/**
 * Validate if a token is a valid Seek target
 * @param {Token} token - Potential target token
 * @param {Token} seeker - The seeking token
 * @returns {boolean} Whether the token is a valid target
 */
export function isValidSeekTarget(token, seeker) {
  if (!token || !seeker || token === seeker) return false;
  if (token.actor?.type !== 'npc' && token.actor?.type !== 'character') return false;
  if (token.actor?.alliance === seeker.actor?.alliance) return false;
  return true;
}

/**
 * Extract Stealth DC from token using the definite path
 * @param {Token} token - The token to extract DC from
 * @returns {number} The Stealth DC or 0 if not found
 */
export function extractStealthDC(token) {
  if (!token?.actor) return 0;
  // Loot actors use token override or world default; others use actor stealth DC
  if (token.actor?.type === 'loot') {
    const override =
      Number(token.document?.getFlag?.(MODULE_ID, 'stealthDC')) ||
      Number(token.document?.flags?.[MODULE_ID]?.stealthDC);
    if (Number.isFinite(override) && override > 0) return override;
    const fallback = Number(game.settings.get(MODULE_ID, 'lootStealthDC'));
    return Number.isFinite(fallback) ? fallback : 15;
  } else if (token.actor?.type === 'hazard') {
    return token.actor.system.attributes.stealth.dc;
  } else {
    // For both PCs and NPCs: actor.system.skills.stealth.dc
    return token.actor.system?.skills?.stealth?.dc || 0;
  }
}

/**
 * Calculate distance between tokens for sorting
 * @param {Token} token1 - First token
 * @param {Token} token2 - Second token
 * @returns {number} Distance in feet
 */
export function calculateTokenDistance(token1, token2) {
  // Try to use token's distanceTo method if available (PF2e system provides this)
  if (token1.distanceTo) {
    try {
      // Use token's direct distanceTo method
      return token1.distanceTo(token2);
    } catch (error) {
      console.error(
        `${MODULE_TITLE}: Error calculating distance between tokens, using fallback methods:`,
        error,
      );
    }
  }

  // Try to use PF2e system's distance calculation if available
  if (game.system.id === 'pf2e' && game.pf2e?.utils?.distance) {
    try {
      // Use PF2e's distance calculation
      return game.pf2e.utils.distance.getDistance(token1, token2);
    } catch (error) {
      // Fall back to other methods if PF2e's function fails
    }
  }

  // Try using Foundry's built-in measurement
  if (canvas.grid && canvas.grid.measureDistance) {
    try {
      // Try to use Foundry's built-in distance calculation
      return canvas.grid.measureDistance(token1.center, token2.center);
    } catch (error) {
      // Fall back to manual calculation if the built-in one fails
    }
  }

  // Fallback manual calculation
  // Get the center points of each token
  const t1Center = {
    x: token1.x + (token1.width * canvas.grid.size) / 2,
    y: token1.y + (token1.height * canvas.grid.size) / 2,
  };

  const t2Center = {
    x: token2.x + (token2.width * canvas.grid.size) / 2,
    y: token2.y + (token2.height * canvas.grid.size) / 2,
  };

  // Calculate distance between centers in pixels
  const dx = t1Center.x - t2Center.x;
  const dy = t1Center.y - t2Center.y;
  const pixelDistance = Math.sqrt(dx * dx + dy * dy);

  // Convert to feet (assuming 5ft grid)
  return (pixelDistance / canvas.grid.size) * 5;
}

/**
 * Check if there's an active encounter
 * @returns {boolean} True if there's an active encounter with combatants
 */
export function hasActiveEncounter() {
  return game.combat?.started && game.combat?.combatants?.size > 0;
}

/**
 * Check if a token is in the current encounter
 * @param {Token} token - The token to check
 * @returns {boolean} True if the token is in the encounter
 */
export function isTokenInEncounter(token) {
  if (!hasActiveEncounter()) return false;
  try {
    // Include companions/familiars/eidolons that are tied to combatants even if not listed in tracker
    const id = token?.id ?? token?.document?.id;
    const direct = game.combat.combatants.find((c) => c.tokenId === id);
    if (direct) return true;

    // Check actor and actor's master (for familiar/eidolon) or companions linked to a combatant
    const actor = token?.actor;
    const actorId = actor?.id;
    const isFamiliar = actor?.type === 'familiar';
    const isEidolon = actor?.type === 'eidolon' || actor?.isOfType?.('eidolon');

    // Check if familiar's master is in the encounter
    if (isFamiliar) {
      const masterId = actor?.system?.master?.id;
      if (masterId && game.combat.combatants.some((c) => c.actorId === masterId)) {
        return true;
      }
    }

    // Try PF2e master linkage on eidolon
    const master = isEidolon ? actor?.system?.eidolon?.master : null;
    const masterTokenId = master?.getActiveTokens?.(true, true)?.[0]?.id;
    if (masterTokenId && game.combat.combatants.some((c) => c.tokenId === masterTokenId))
      return true;

    // Try linked actor id
    if (actorId && game.combat.combatants.some((c) => c.actorId === actorId)) return true;

    // As a final pass, include any token that is within the combat scene and owned by a combatant's actor (party minions)
    return game.combat.combatants.some((c) => {
      try {
        const cActor = c.actor;
        if (!cActor) return false;
        // Companions/minions may have their actor's master/party as owner
        const ownerIds = new Set(
          [cActor.id, cActor.master?.id, cActor?.system?.eidolon?.master?.id].filter(Boolean),
        );
        return ownerIds.has(actorId);
      } catch (_) {
        return false;
      }
    });
  } catch (_) {
    const combatant = game.combat.combatants.find((c) => c.tokenId === token.id);
    return !!combatant;
  }
}

/**
 * Modern degree of success determination with natural 20/1 handling
 * @param {number} total - Roll total
 * @param {number} die - Natural die result
 * @param {number} dc - Difficulty class
 * @returns {string} Outcome string
 */
export function determineOutcome(total, die, dc) {
  const margin = total - dc;
  // Determine base outcome by margin
  let outcome;
  if (margin >= 10) outcome = 'critical-success';
  else if (margin >= 0) outcome = 'success';
  else if (margin >= -10) outcome = 'failure';
  else outcome = 'critical-failure';

  // Natural 20/1 step adjustment across the board with extremes clamped
  const ladder = ['critical-failure', 'failure', 'success', 'critical-success'];
  const idx = ladder.indexOf(outcome);
  const natural = Number(die);
  
  if (natural === 20) {
    // Promote by one step unless already crit success
    return ladder[Math.min(idx + 1, ladder.length - 1)];
  }
  if (natural === 1) {
    // Demote by one step unless already crit failure
    return ladder[Math.max(idx - 1, 0)];
  }
  
  return outcome;
}

/**
 * Apply visibility changes atomically with error handling
 * This is a unified function that replaces individual dialog-specific implementations
 * @param {Token} observer - The observer token (usually the seeker, pointer, etc.)
 * @param {Array} changes - Array of change objects
 * @param {Object} options - Additional options
 * @param {string} options.direction - Direction of visibility check ('observer_to_target' or 'target_to_observer')
 * @param {boolean} options.updateVisuals - Whether to update token visuals (default: true)
 * @param {boolean} options.refreshPerception - Whether to refresh everyone's perception (default: true)
 * @param {number} options.durationRounds - Duration in rounds (default: undefined)
 * @param {boolean} options.initiative - Whether to use initiative (default: undefined)
 * @returns {Promise} Promise that resolves when all changes are applied
 */
export async function applyVisibilityChanges(observer, changes, options = {}) {
  if (!changes || changes.length === 0 || !observer) return;

  // Default options
  const direction = options.direction || 'observer_to_target';

  try {
    // Group changes by target to reduce map updates
    const changesByTarget = new Map();

    // Process and group changes
    for (const change of changes) {
      if (!change?.target) continue;

      // Get the effective new visibility state
      const effectiveNewState = change.overrideState || change.newVisibility;
      if (!effectiveNewState) continue;

      // Handle special case for Point Out where target might be in change.targetToken
      let targetToken = change.target;
      if (change.targetToken) {
        targetToken = change.targetToken;
      }

      // Store in map with target ID as key
      if (targetToken?.document?.id) {
        changesByTarget.set(targetToken.document.id, {
          target: targetToken,
          state: effectiveNewState,
        });
      }
    }

    // Set AVS pair overrides to prevent automatic recalculation of these visibility states
    // This is crucial for sneak actions - we don't want AVS to override our manual visibility changes
    if (options.setAVSOverrides !== false) { // Default to true unless explicitly disabled
      
      if (changesByTarget.size === 0) {
        console.warn('PF2E Visioner | No changes found - cannot set AVS overrides');
      } else {
        try {
          await AvsOverrideManager.setPairOverrides(observer, changesByTarget, options);
        } catch (avsError) {
          console.warn('PF2E Visioner | Failed to set AVS pair overrides:', avsError);
        }
      }
    }

    // Process changes in batches to avoid overwhelming the system
    const batchSize = 5;
    const targetIds = Array.from(changesByTarget.keys());

    for (let i = 0; i < targetIds.length; i += batchSize) {
      const batchIds = targetIds.slice(i, i + batchSize);
      await Promise.all(
        batchIds.map(async (targetId) => {
          const changeData = changesByTarget.get(targetId);
          if (!changeData) return;

          try {
            await setVisibilityBetween(observer, changeData.target, changeData.state, {
              direction: direction,
              durationRounds: options.durationRounds,
              initiative: options.initiative,
              skipEphemeralUpdate: options.skipEphemeralUpdate,
              skipCleanup: options.skipCleanup,
            });
          } catch (error) {
            console.error(`${MODULE_TITLE}: Error applying visibility change:`, error);
          }
        }),
      );
    }

    // Update token visuals if requested
    try {
      // Update observer visuals once
      await updateTokenVisuals(observer);

      // Update target visuals in batches
      const uniqueTargets = new Set();
      for (const change of changes) {
        if (change?.target?.id) {
          uniqueTargets.add(change.target);
        }
      }

      const targetsArray = Array.from(uniqueTargets);
      for (let i = 0; i < targetsArray.length; i += batchSize) {
        const batchTargets = targetsArray.slice(i, i + batchSize);
        await Promise.all(batchTargets.map((target) => updateTokenVisuals(target)));
      }
    } catch (error) {
      console.warn(`${MODULE_TITLE}: Error updating token visuals:`, error);
    }

    // Refresh everyone's perception if requested
    refreshEveryonesPerception();
  } catch (error) {
    console.error(`${MODULE_TITLE}: Error applying visibility changes:`, error);
    notify.error(`${MODULE_TITLE}: Failed to apply visibility changes - ${error.message}`);
  }
}

/**
 * Mark automation panel as complete
 * @param {jQuery} panel - The automation panel
 * @param {Array} changes - Applied changes
 */
export function markPanelComplete(panel, changes) {
  if (!panel || !panel.length) return;

  try {
    // Update panel appearance
    panel.addClass('completed');

    // Update button text and disable
    const button = panel.find('.preview-results');
    if (button.length) {
      button
        .prop('disabled', true)
        .html('<i class="fas fa-check"></i> Changes Applied')
        .removeClass('visioner-btn-primary')
        .addClass('visioner-btn-success');
    }

    // Add completion message
    const completionMsg = `
            <div class="automation-completion">
                <i class="fas fa-check-circle"></i>
                <span>Applied ${changes.length} visibility change${
                  changes.length !== 1 ? 's' : ''
                }</span>
            </div>
        `;

    panel.find('.automation-actions').after(completionMsg);
  } catch (error) {
    console.error(`${MODULE_TITLE}: Error marking panel complete:`, error);
  }
}

/**
 * Check if a token should be filtered based on ally filtering settings
 * @param {Token} actingToken - The token performing the action
 * @param {Token} targetToken - The token being evaluated
 * @param {string} filterType - Type of filtering: 'enemies' (default), 'allies'
 * @returns {boolean} True if the token should be filtered out (excluded)
 */
export function shouldFilterAlly(
  actingToken,
  targetToken,
  filterType = 'enemies',
  preferIgnoreAllies = null,
) {
  // Non-token subjects (e.g., walls) should never be filtered by ally logic
  try {
    if (!targetToken?.actor) return false;
  } catch (_) {
    return false;
  }
  // When provided, prefer per-dialog/user choice; otherwise fall back to global setting
  // preferIgnoreAllies is authoritative when boolean; otherwise use the setting
  const ignoreAllies =
    typeof preferIgnoreAllies === 'boolean'
      ? preferIgnoreAllies
      : game.settings.get(MODULE_ID, 'ignoreAllies') === true;
  if (!ignoreAllies) return false;

  // Prefer PF2e alliance when available; fall back to token disposition; finally fall back to ownership/type.
  let sameSide = false;
  try {
    const aAlliance = actingToken?.actor?.alliance;
    const bAlliance = targetToken?.actor?.alliance;
    if (aAlliance && bAlliance) sameSide = aAlliance === bAlliance;
    else {
      const aDisp = actingToken?.document?.disposition;
      const bDisp = targetToken?.document?.disposition;
      if (Number.isFinite(aDisp) && Number.isFinite(bDisp)) sameSide = aDisp === bDisp;
      else {
        const aType = actingToken?.actor?.type;
        const bType = targetToken?.actor?.type;
        const aGroup = aType === 'character' || aType === 'familiar' ? 'pc' : 'npc';
        const bGroup = bType === 'character' || bType === 'familiar' ? 'pc' : 'npc';
        sameSide = aGroup === bGroup;
      }
    }
  } catch (_) {
    // Conservative fallback by actor type only (no ownership)
    const aType = actingToken?.actor?.type;
    const bType = targetToken?.actor?.type;
    const aGroup = aType === 'character' || aType === 'familiar' ? 'pc' : 'npc';
    const bGroup = bType === 'character' || bType === 'familiar' ? 'pc' : 'npc';
    sameSide = aGroup === bGroup;
  }

  if (filterType === 'enemies') return sameSide; // filter out allies
  if (filterType === 'allies') return !sameSide; // filter out enemies when looking for allies

  return false;
}

/**
 * Filter outcomes by ally relationship based on a live toggle.
 * @param {Array} outcomes
 * @param {Token} actorToken - The acting token for the dialog
 * @param {boolean|null} preferIgnoreAllies - If true, filter allies out; if false, keep all; if null, use setting
 * @param {string} tokenProperty - Property name holding the target token on each outcome
 * @returns {Array}
 */
export function filterOutcomesByAllies(
  outcomes,
  actorToken,
  preferIgnoreAllies,
  tokenProperty = 'target',
) {
  try {
    if (!Array.isArray(outcomes)) return outcomes;
    const doIgnore = preferIgnoreAllies === true;
    if (!doIgnore) return outcomes;
    return outcomes.filter((o) => {
      // Do not filter wall outcomes
      if (o?._isWall || o?.wallId) return true;
      const token = o?.[tokenProperty];
      if (!token) return false;
      return !shouldFilterAlly(actorToken, token, 'enemies', true);
    });
  } catch (_) {
    return outcomes;
  }
}

/**
 * Extract Perception DC from token using the definite path
 * @param {Token} token - The token to extract DC from
 * @returns {number} The Perception DC or 0 if not found
 */
export function extractPerceptionDC(token) {
  if (!token.actor) return 0;
  // Per-token override
  const override = Number(token.document?.getFlag?.(MODULE_ID, 'perceptionDC'));
  if (Number.isFinite(override) && override > 0) return override;
  // For both PCs and NPCs: actor.system.perception.dc
  return token.actor.system?.perception?.dc || 0;
}

/**
 * Check if a token has the 'concealed' condition on its actor
 * Works for both v13 itemTypes.condition and legacy collections
 * @param {Token} token
 * @returns {boolean}
 */
export function hasConcealedCondition(token) {
  try {
    const itemTypeConditions = token?.actor?.itemTypes?.condition || [];
    if (itemTypeConditions.some((c) => c?.slug === 'concealed')) return true;
    const legacyConditions = token?.actor?.conditions?.conditions || [];
    return legacyConditions.some((c) => c?.slug === 'concealed');
  } catch (_) {
    return false;
  }
}

/**
 * Filter outcomes based on encounter filter setting
 * @param {Array} outcomes - Array of outcomes to filter
 * @param {boolean} encounterOnly - Whether to filter for encounter only
 * @param {string} tokenProperty - The property name to check for token (e.g., 'target', 'token')
 * @returns {Array} Filtered outcomes
 */
export function filterOutcomesByEncounter(outcomes, encounterOnly, tokenProperty = 'target') {
  try {
    // If encounter filtering is not enabled or there's no active encounter, return all outcomes
    if (!encounterOnly || !hasActiveEncounter()) {
      return outcomes;
    }

    // Filter outcomes to only include tokens in the current encounter
    return outcomes.filter((outcome) => {
      // Always include wall outcomes
      if (outcome?._isWall || outcome?.wallId) return true;

      const token = outcome[tokenProperty];
      if (!token) return false;

      // Check if this specific token (by ID) is in the encounter
      // This fixes the issue where token copies were included just because
      // they shared the same actor as an encounter participant
      const tokenId = token?.id ?? token?.document?.id;
      if (!tokenId) return false;

      // Only check by token ID to ensure we get the exact token, not copies
      return game.combat.combatants.some((c) => c.tokenId === tokenId);
    });
  } catch (_) {
    return outcomes;
  }
}

/**
 * Filter outcomes by Seek distance settings. Applies combat or out-of-combat
 * limits based on whether there is an active encounter.
 * @param {Array} outcomes - Array of outcomes to filter
 * @param {Token} seeker - The seeking token (distance measured from this token)
 * @param {string} tokenProperty - Property name holding the target token in each outcome
 * @returns {Array} Filtered outcomes
 */
export function filterOutcomesBySeekDistance(outcomes, seeker, tokenProperty = 'target') {
  try {
    if (!Array.isArray(outcomes) || !seeker) return outcomes;

    const inCombat = hasActiveEncounter();
    const applyInCombat = !!game.settings.get(MODULE_ID, 'limitSeekRangeInCombat');
    const applyOutOfCombat = !!game.settings.get(MODULE_ID, 'limitSeekRangeOutOfCombat');
    const shouldApply = (inCombat && applyInCombat) || (!inCombat && applyOutOfCombat);
    if (!shouldApply) return outcomes;

    const maxDistance = Number(
      inCombat
        ? game.settings.get(MODULE_ID, 'customSeekDistance')
        : game.settings.get(MODULE_ID, 'customSeekDistanceOutOfCombat'),
    );
    if (!Number.isFinite(maxDistance) || maxDistance <= 0) return outcomes;

    return outcomes.filter((outcome) => {
      const token = outcome?.[tokenProperty];
      if (!token) return false;
      const dist = calculateTokenDistance(seeker, token);
      return Number.isFinite(dist) ? dist <= maxDistance : true;
    });
  } catch (_) {
    return outcomes;
  }
}

/**
 * Check whether a token's center lies within a circular template (in feet)
 * @param {{x:number,y:number}} center - Circle center in canvas coordinates (pixels)
 * @param {number} radiusFeet - Radius of the circle in feet
 * @param {Token} token - Token to test for inclusion
 * @returns {boolean}
 */
export function isTokenWithinTemplate(center, radiusFeet, token) {
  try {
    if (!center || !token) return false;
    const tokenCenter = token.center || {
      x: token.x + (token.w ?? token.width * canvas.grid.size) / 2,
      y: token.y + (token.h ?? token.height * canvas.grid.size) / 2,
    };
    const dx = tokenCenter.x - center.x;
    const dy = tokenCenter.y - center.y;
    const distancePixels = Math.hypot(dx, dy);
    const gridSize = canvas.grid?.size || 1;
    const gridDistance = canvas.grid?.distance || 5; // Foundry scene distance per grid space (PF2e defaults to 5 ft)
    const feetPerPixel = gridDistance / gridSize;
    const distanceFeet = distancePixels * feetPerPixel;
    return distanceFeet <= radiusFeet;
  } catch (_) {
    return false;
  }
}

/**
 * Filter outcomes to only those whose token lies within a circular template
 * @param {Array} outcomes
 * @param {{x:number,y:number}} center
 * @param {number} radiusFeet
 * @param {string} tokenProperty
 * @returns {Array}
 */
export function filterOutcomesByTemplate(outcomes, center, radiusFeet, tokenProperty = 'target') {
  try {
    if (!Array.isArray(outcomes) || !center || !Number.isFinite(radiusFeet) || radiusFeet <= 0)
      return outcomes;

    return outcomes.filter((outcome) => {
      // Special handling for walls - use wall center instead of target token
      if (outcome?._isWall && outcome?.wall) {
        const wallCenter = outcome.wall.center;
        if (wallCenter) {
          const dx = wallCenter.x - center.x;
          const dy = wallCenter.y - center.y;
          const distanceFeet = Math.sqrt(dx * dx + dy * dy) / (canvas.scene.grid.size / 5);
          return distanceFeet <= radiusFeet;
        }
        // If wall center is not accessible, exclude the wall
        return false;
      }

      // Standard token handling - only for non-wall outcomes
      const token = outcome?.[tokenProperty];
      if (!token) return false;

      // Calculate distance manually for tokens
      const dx = token.center.x - center.x;
      const dy = token.center.y - center.y;
      const distanceFeet = Math.sqrt(dx * dx + dy * dy) / (canvas.scene.grid.size / 5);
      return distanceFeet <= radiusFeet;
    });
  } catch (error) {
    console.error('Error in filterOutcomesByTemplate:', error);
    return outcomes;
  }
}

/**
 * Calculate stealth roll total adjustments based on cover state
 * Removes cover-specific stealth bonuses when cover doesn't justify them
 * @param {number} baseTotal - The original roll total
 * @param {Object} autoCoverResult - Auto-cover detection result for this observer
 * @param {Object} actionData - Action data containing context
 * @param {Array} allOutcomes - All outcomes to determine the highest cover detected (optional)
 * @returns {Object} { total, originalTotal } - Adjusted totals
 */
export function calculateStealthRollTotals(
  baseTotal,
  autoCoverResult,
  actionData,
  allOutcomes = [],
) {
  // Get the original cover bonus that was applied to the base roll
  const visionerContext = actionData?.context?._visionerStealth;
  let originalCoverBonus = Number(visionerContext?.bonus || 0);

  // Try to get original modifier from stored map if available
  const rollId =
    visionerContext?.rollId ||
    actionData?.context?._visionerRollId ||
    actionData?.flags?.['pf2e-visioner']?.rollId;
  let originalModifier = null;

  if (rollId && originalCoverBonus === 0) {
    try {
      originalModifier = CoverModifierService.getInstance().getOriginalCoverModifier(rollId);
      if (originalModifier) {
        originalCoverBonus = Number(originalModifier.finalBonus || originalModifier.bonus || 0);
      }
    } catch (e) {
      console.warn('PF2E Visioner | Failed to retrieve original cover modifier:', e);
    }
  }

  // Fallback: try roll modifiers if still no original bonus found
  if (originalCoverBonus === 0) {
    const rollModifiers = actionData?.roll?.options?.modifiers || [];
    
    const coverModifier = rollModifiers.find(
      (mod) => {
        const label = mod.label?.toLowerCase() || '';
        const slug = mod.slug?.toLowerCase() || '';
        // Only match modifiers that are specifically cover-related, not just containing "cover"
        return (
          slug === 'pf2e-visioner-cover' || // Our own cover modifier
          label.includes('cover bonus') ||
          label.includes('cover stealth') ||
          (label.includes('cover') && label.includes('stealth')) ||
          slug.includes('cover-stealth')
        );
      }
    );
    if (coverModifier) {
      originalCoverBonus = Number(coverModifier.modifier || 0);
    }
  }

  // Current cover state and bonus
  const currentCoverState = autoCoverResult?.state || 'none';
  const currentCoverBonus = Number(COVER_STATES?.[currentCoverState]?.bonusStealth || 0);

  // Check if this is an override case using the stored modifier data (more reliable)
  const wasOverridden = originalModifier?.isOverride || false;
  const isOverride = wasOverridden || autoCoverResult?.isOverride || false;

  let total = baseTotal;
  let originalTotal = null;

  if (isOverride && (autoCoverResult?.overrideDetails || originalModifier)) {
    // OVERRIDE CASE: Main total shows the override result, brackets show detected result
    const overrideDetails = autoCoverResult?.overrideDetails || originalModifier;
    const originalState = overrideDetails.originalState || 'none';
    const finalState = overrideDetails.finalState || 'none';

    const originalStateBonus = Number(COVER_STATES?.[originalState]?.bonusStealth || 0);
    const finalStateBonus = Number(COVER_STATES?.[finalState]?.bonusStealth || 0);

    // Main total: Show the OVERRIDE result (what was actually applied)
    total = baseTotal - originalCoverBonus + finalStateBonus;

    // Brackets: Show what this specific observer DETECTED (before override)
    originalTotal = baseTotal - originalCoverBonus + originalStateBonus;
  } else {
    // NORMAL CASE: No override, use the roll as it was made
    // The baseTotal already includes the original cover bonus that was applied when the roll was made
    // We should only adjust if there's actually a detected difference between what was applied and current cover
    
    // If we have current cover detected and it matches what was originally applied, no adjustment needed
    if (originalCoverBonus === currentCoverBonus) {
      total = baseTotal;
    } else {
      // Safety check: if current cover is 'none' and we detect a large original bonus,
      // it might be a detection error. Cap the adjustment to prevent unreasonable results.
      if (currentCoverState === 'none' && originalCoverBonus > 4) {
        console.warn('PF2E Visioner | Large cover bonus detected for no-cover situation. Limiting adjustment.');
        total = baseTotal;
      } else {
        // There's a mismatch - the roll was made with different cover than what we detect now
        // This can happen if the player moved between rolling and dialog opening
        // Show the adjusted total based on current cover detection
        total = baseTotal - originalCoverBonus + currentCoverBonus;
        
        // Show the original roll in brackets if there's a difference
        originalTotal = baseTotal;
      }
    }
  }

  // Calculate base roll total (without any cover modifiers) for override display
  let baseRollTotal = null;
  if (wasOverridden || isOverride) {
    baseRollTotal = baseTotal - originalCoverBonus;
  }

  return { total, originalTotal, baseRollTotal };
}
