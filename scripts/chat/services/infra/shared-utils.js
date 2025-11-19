/**
 * Shared utilities for chat automation
 * Common functions used by both Seek and Point Out logic
 */

import { COVER_STATES, MODULE_ID, MODULE_TITLE } from '../../../constants.js';
import { CoverModifierService } from '../../../services/CoverModifierService.js';
import { refreshEveryonesPerception } from '../../../services/socket.js';
import { updateTokenVisuals } from '../../../services/visual-effects.js';
import { setVisibilityBetween } from '../../../utils.js';
import { VisionAnalyzer } from '../../../visibility/auto-visibility/VisionAnalyzer.js';
import AvsOverrideManager from './AvsOverrideManager.js';
import { notify } from './notifications.js';

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
 * Uses standardized distance calculation with proper PF2e grid-to-feet conversion
 * @param {Token} token1 - First token
 * @param {Token} token2 - Second token
 * @returns {number} Distance in feet
 */
export function calculateTokenDistance(token1, token2) {
  try {
    // Use standardized VisionAnalyzer distance calculation
    const visionAnalyzer = VisionAnalyzer.getInstance();
    const result = visionAnalyzer.distanceFeet(token1, token2);

    return result;
  } catch (error) {
    console.error(
      `${MODULE_TITLE}: Error calculating distance between tokens using VisionAnalyzer:`,
      error,
    );

    // Fallback to simple distance calculation
    try {
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

      // Convert to feet using same logic as VisionAnalyzer (5ft grid with rounding)
      const gridUnits = global.canvas?.scene?.grid?.distance || 5;
      const gridDistance = pixelDistance / (canvas.grid.size || 1);
      const feetDistance = gridDistance * gridUnits;
      return Math.floor(feetDistance / 5) * 5;
    } catch (fallbackError) {
      console.error(`${MODULE_TITLE}: Fallback distance calculation failed:`, fallbackError);
      return Infinity;
    }
  }
}

/**
 * Check if there's an active encounter
 * @returns {boolean} True if there's an active encounter with combatants
 */
export function hasActiveEncounter() {
  return !!(game.combat?.started && game.combat?.combatants?.size > 0);
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
    if (options.setAVSOverrides !== false) {
      // Default to true unless explicitly disabled

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
                <span>Applied ${changes.length} visibility change${changes.length !== 1 ? 's' : ''
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
      // Do not filter hazards and loot - they should always appear in seek results
      if (o?._isHazard || o?._isLoot) return true;
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
    if (!Array.isArray(outcomes) || !seeker) {
      return outcomes;
    }

    const inCombat = hasActiveEncounter();
    const applyInCombat = !!game.settings.get(MODULE_ID, 'limitSeekRangeInCombat');
    const applyOutOfCombat = !!game.settings.get(MODULE_ID, 'limitSeekRangeOutOfCombat');
    const shouldApply = (inCombat && applyInCombat) || (!inCombat && applyOutOfCombat);


    if (!shouldApply) {
      return outcomes;
    }

    const maxDistance = Number(
      inCombat
        ? game.settings.get(MODULE_ID, 'customSeekDistance')
        : game.settings.get(MODULE_ID, 'customSeekDistanceOutOfCombat'),
    );


    if (!Number.isFinite(maxDistance) || maxDistance <= 0) {
      console.warn(`${MODULE_TITLE} | filterOutcomesBySeekDistance: Invalid max distance (${maxDistance}) - returning all outcomes`);
      return outcomes;
    }

    const filtered = outcomes.filter((outcome) => {
      const token = outcome?.[tokenProperty];
      if (!token) {
        return false;
      }
      const dist = calculateTokenDistance(seeker, token);
      const isWithinRange = Number.isFinite(dist) ? dist <= maxDistance : true;


      return isWithinRange;
    });


    return filtered;
  } catch (error) {
    console.error(`${MODULE_TITLE} | filterOutcomesBySeekDistance: Error filtering by distance:`, error);
    return outcomes;
  }
}

/**
 * Check whether a token's center lies within a template
 * @param {{x:number,y:number}} center - Template center/start in canvas coordinates (pixels)
 * @param {number} radiusFeet - Template size in feet (radius for circle, distance for others)
 * @param {Token|Wall} token - Token or wall to test for inclusion
 * @param {string} templateType - Template type: 'circle', 'cone', 'rect', 'ray'
 * @param {string} messageId - Optional message ID to find the actual template object
 * @param {string} actorTokenId - Optional actor token ID to find the actual template object
 * @returns {boolean}
 */
export function isTokenWithinTemplate(center, radiusFeet, token, templateType = 'circle', messageId = null, actorTokenId = null) {
  try {
    if (!center || !token) return false;

    if (messageId && actorTokenId) {
      let template = canvas.scene?.templates?.find?.((t) => {
        const f = t?.flags?.['pf2e-visioner'];
        return (
          (f?.seekPreviewManual || f?.seekTemplate) &&
          f?.messageId === messageId &&
          f?.actorTokenId === actorTokenId
        );
      });
      if (!template) {
        template = canvas.templates?.placeables?.find?.((t) => {
          const f = t?.flags?.['pf2e-visioner'];
          return (
            (f?.seekPreviewManual || f?.seekTemplate) &&
            f?.messageId === messageId &&
            f?.actorTokenId === actorTokenId
          );
        });
      }

      if (template && template.shape) {
        const tokenCenter = token.center || {
          x: token.x + (token.w ?? token.width * canvas.grid.size) / 2,
          y: token.y + (token.h ?? token.height * canvas.grid.size) / 2,
        };
        const localX = tokenCenter.x - template.x;
        const localY = tokenCenter.y - template.y;
        return template.shape.contains(localX, localY);
      }
    }

    if (templateType === 'circle') {
      const tokenCenter = token.center || {
        x: token.x + (token.w ?? token.width * canvas.grid.size) / 2,
        y: token.y + (token.h ?? token.height * canvas.grid.size) / 2,
      };
      const dx = tokenCenter.x - center.x;
      const dy = tokenCenter.y - center.y;
      const distancePixels = Math.hypot(dx, dy);
      const gridSize = canvas.grid?.size || 1;
      const gridDistance = canvas.grid?.distance || 5;
      const feetPerPixel = gridDistance / gridSize;
      const distanceFeet = distancePixels * feetPerPixel;
      return distanceFeet <= radiusFeet;
    }

    return false;
  } catch (_) {
    return false;
  }
}

/**
 * Filter outcomes to only those whose token lies within a template
 * @param {Array} outcomes
 * @param {{x:number,y:number}} center
 * @param {number} radiusFeet
 * @param {string} tokenProperty
 * @param {string} templateType - Template type: 'circle', 'cone', 'rect', 'ray'
 * @param {string} messageId - Optional message ID to find the actual template object
 * @param {string} actorTokenId - Optional actor token ID to find the actual template object
 * @returns {Array}
 */
export function filterOutcomesByTemplate(outcomes, center, radiusFeet, tokenProperty = 'target', templateType = 'circle', messageId = null, actorTokenId = null) {
  try {
    if (!Array.isArray(outcomes) || !center || !Number.isFinite(radiusFeet) || radiusFeet <= 0)
      return outcomes;

    let template = null;
    if (messageId && actorTokenId) {
      template = canvas.scene?.templates?.find?.((t) => {
        const f = t?.flags?.['pf2e-visioner'];
        return (
          (f?.seekPreviewManual || f?.seekTemplate) &&
          f?.messageId === messageId &&
          f?.actorTokenId === actorTokenId
        );
      });
      if (!template) {
        template = canvas.templates?.placeables?.find?.((t) => {
          const f = t?.flags?.['pf2e-visioner'];
          return (
            (f?.seekPreviewManual || f?.seekTemplate) &&
            f?.messageId === messageId &&
            f?.actorTokenId === actorTokenId
          );
        });
      }
    }

    return outcomes.filter((outcome) => {
      if (outcome?.changed === false && messageId) {
        return false;
      }

      if (template && template.shape) {
        if (outcome?._isWall && outcome?.wall) {
          const wallCenter = outcome.wall.center;
          if (wallCenter) {
            const localX = wallCenter.x - template.x;
            const localY = wallCenter.y - template.y;
            return template.shape.contains(localX, localY);
          }
          return false;
        }

        const token = outcome?.[tokenProperty];
        if (!token) return false;
        const tokenCenter = token.center || {
          x: token.x + (token.w ?? token.width * canvas.grid.size) / 2,
          y: token.y + (token.h ?? token.height * canvas.grid.size) / 2,
        };
        const localX = tokenCenter.x - template.x;
        const localY = tokenCenter.y - template.y;
        return template.shape.contains(localX, localY);
      }

      if (templateType === 'circle') {
        if (outcome?._isWall && outcome?.wall) {
          const wallCenter = outcome.wall.center;
          if (wallCenter) {
            const dx = wallCenter.x - center.x;
            const dy = wallCenter.y - center.y;
            const distanceFeet = Math.sqrt(dx * dx + dy * dy) / (canvas.scene.grid.size / 5);
            return distanceFeet <= radiusFeet;
          }
          return false;
        }

        const token = outcome?.[tokenProperty];
        if (!token) return false;
        const dx = token.center.x - center.x;
        const dy = token.center.y - center.y;
        const distanceFeet = Math.sqrt(dx * dx + dy * dy) / (canvas.scene.grid.size / 5);
        return distanceFeet <= radiusFeet;
      }

      return false;
    });
  } catch (error) {
    console.error('Error in filterOutcomesByTemplate:', error);
    return outcomes;
  }
}

/**
 * Filter outcomes by viewport visibility.
 * - Keeps tokens that are within the current viewport bounds
 * - By default keeps non-token subjects (e.g., walls) unfiltered.
 * @param {Array} outcomes - Array of outcome rows
 * @param {Token} observer - Acting/observer token (unused but kept for API compatibility)
 * @param {string} tokenProperty - Property on each outcome that holds the counterpart token (default: 'target')
 * @param {boolean} filterWalls - Whether to apply viewport filtering to walls (default: false)
 * @param {boolean} filterTokens - Whether to apply viewport filtering to tokens (default: true)
 * @param {string} detectionDirection - Unused but kept for API compatibility
 * @returns {Array} Filtered outcomes where tokens are within viewport
 */
export async function filterOutcomesByDetection(
  outcomes,
  observer,
  tokenProperty = 'target',
  filterWalls = false,
  filterTokens = true,
) {
  try {

    if (!Array.isArray(outcomes)) {
      return outcomes;
    }

    // Use the existing ViewportFilterService for proper viewport filtering
    const { ViewportFilterService } = await import(
      '../../../visibility/auto-visibility/core/ViewportFilterService.js'
    );
    const viewportService = new ViewportFilterService();

    // Get viewport bounds and token set
    const viewportBounds = viewportService.getViewportBounds(64); // 64px padding
    const viewportTokenIds = viewportService.getViewportTokenIdSet(64);

    if (!viewportBounds && !viewportTokenIds) {
      // If viewport detection fails, return all outcomes
      return outcomes;
    }

    const filtered = outcomes
      .map((o) => {
        try {
          // Handle wall outcomes
          if (o?._isWall || o?.wallId) {
            if (!filterWalls) {
              return o;
            }

            // For walls, check if wall intersects with viewport
            if (viewportBounds) {
              try {
                const wall = canvas.walls?.get?.(o.wallId) || o.wall;
                if (wall && wall.document) {
                  const [x1, y1, x2, y2] = wall.document.c;

                  // Check if wall intersects viewport bounds
                  const wallInViewport = !(
                    Math.max(x1, x2) < viewportBounds.minX ||
                    Math.min(x1, x2) > viewportBounds.maxX ||
                    Math.max(y1, y2) < viewportBounds.minY ||
                    Math.min(y1, y2) > viewportBounds.maxY
                  );

                  return wallInViewport ? o : null;
                }
              } catch (err) {
                // If we can't check the wall, keep it by default
                return o;
              }
            }
            return o;
          }

          const token = o?.[tokenProperty];
          if (!token) {
            return null;
          }

          // Only filter tokens if filterTokens is enabled
          if (filterTokens) {
            // Use the viewport service to check if token is in viewport
            if (viewportTokenIds) {
              const tokenId = token.document?.id;
              if (tokenId && !viewportTokenIds.has(tokenId)) {
                return null;
              }
            } else if (viewportBounds) {
              // Fallback to bounds checking if token ID set is unavailable
              const tokenInViewport =
                token.x >= viewportBounds.minX &&
                token.x <= viewportBounds.maxX &&
                token.y >= viewportBounds.minY &&
                token.y <= viewportBounds.maxY;

              if (!tokenInViewport) {
                return null;
              }
            }
          }

          // If wall filtering is enabled, also filter walls within this outcome
          if (filterWalls && o.walls && Array.isArray(o.walls) && viewportBounds) {
            const filteredWalls = o.walls.filter((wall) => {
              try {
                if (!wall || !wall.document || !wall.document.c) return true;

                const [x1, y1, x2, y2] = wall.document.c;

                // Check if wall intersects viewport bounds
                const wallInViewport = !(
                  Math.max(x1, x2) < viewportBounds.minX ||
                  Math.min(x1, x2) > viewportBounds.maxX ||
                  Math.max(y1, y2) < viewportBounds.minY ||
                  Math.min(y1, y2) > viewportBounds.maxY
                );

                return wallInViewport;
              } catch (err) {
                console.error('Viewport Filter: Error checking wall viewport in outcome:', err);
                return true; // Keep wall if we can't check viewport
              }
            });

            return {
              ...o,
              walls: filteredWalls,
            };
          }

          return o;
        } catch (err) {
          return o;
        }
      })
      .filter((o) => o !== null);

    const removedCount = outcomes.length - filtered.length;

    if (removedCount > 0) {
      const removed = outcomes.filter(o => !filtered.includes(o));
    }

    return filtered;
  } catch (err) {
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

    const coverModifier = rollModifiers.find((mod) => {
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
    });
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
        console.warn(
          'PF2E Visioner | Large cover bonus detected for no-cover situation. Limiting adjustment.',
        );
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

/**
 * Check if a token is defeated, unconscious, dead, or dying
 * @param {Token} token - The token to check
 * @returns {boolean} True if the token is defeated
 */
export function isTokenDefeated(token) {
  try {
    const actor = token?.actor;
    if (!actor) return false;

    if (token.actor.isDead) {
      return true;
    }

    // HP based check (covers 0 or negative)
    const hpValue = actor.hitPoints?.value ?? actor.system?.attributes?.hp?.value;
    if (typeof hpValue === 'number' && hpValue <= 0) {
      return true;
    }

    // Condition-based check (PF2e conditions can be stored in multiple places)
    const conditionSlugs = new Set();

    // Check itemTypes.condition array
    if (Array.isArray(actor.itemTypes?.condition)) {
      for (const c of actor.itemTypes.condition) {
        if (c?.slug) conditionSlugs.add(c.slug);
        else if (typeof c?.name === 'string') conditionSlugs.add(c.name.toLowerCase());
      }
    }

    // Check actor.conditions array
    if (Array.isArray(actor.conditions)) {
      for (const c of actor.conditions) {
        if (c?.slug) conditionSlugs.add(c.slug);
        else if (typeof c?.name === 'string') conditionSlugs.add(c.name.toLowerCase());
      }
    }

    // Check actor.appliedConditions (PF2e specific)
    if (Array.isArray(actor.appliedConditions)) {
      for (const c of actor.appliedConditions) {
        if (typeof c === 'string') conditionSlugs.add(c);
        else if (c?.slug) conditionSlugs.add(c.slug);
        else if (typeof c?.name === 'string') conditionSlugs.add(c.name.toLowerCase());
      }
    }

    // Check system.attributes.conditions (another possible location)
    if (actor.system?.attributes?.conditions) {
      const sysConditions = actor.system.attributes.conditions;
      if (Array.isArray(sysConditions)) {
        for (const c of sysConditions) {
          if (typeof c === 'string') conditionSlugs.add(c);
          else if (c?.slug) conditionSlugs.add(c.slug);
          else if (typeof c?.name === 'string') conditionSlugs.add(c.name.toLowerCase());
        }
      } else if (typeof sysConditions === 'object') {
        // Check if conditions are stored as properties
        for (const [key, value] of Object.entries(sysConditions)) {
          if (value === true || (typeof value === 'object' && value?.active)) {
            conditionSlugs.add(key);
          }
        }
      }
    }

    // Check token document effects/status effects
    if (token?.document?.statusEffects || token?.statusEffects) {
      const statusEffects = token.document?.statusEffects || token.statusEffects;
      if (Array.isArray(statusEffects)) {
        for (const effect of statusEffects) {
          if (typeof effect === 'string') {
            conditionSlugs.add(effect);
          }
        }
      }
    }

    // Check for defeated conditions
    const defeatedSlugs = ['unconscious', 'dead', 'dying'];
    for (const slug of defeatedSlugs) {
      if (conditionSlugs.has(slug)) {
        return true;
      }
    }

    return false;
  } catch (err) {
    console.error(`[isTokenDefeated] Error checking token ${token?.name}:`, err);
    return false;
  }
}

/**
 * Filter outcomes by excluding defeated tokens
 * @param {Array} outcomes - Array of outcome rows
 * @param {string} tokenProperty - Property on each outcome that holds the token (default: 'target')
 * @returns {Array} Filtered outcomes excluding defeated tokens
 */
export function filterOutcomesByDefeated(outcomes, tokenProperty = 'target') {
  if (!Array.isArray(outcomes)) {
    return outcomes;
  }

  return outcomes.filter((outcome) => {
    try {
      const token = outcome?.[tokenProperty];
      if (!token) return true; // Keep non-token outcomes

      // Always keep hazards and loot regardless of HP/defeated status
      if (token?.actor?.type === 'hazard' || token?.actor?.type === 'loot') {
        return true;
      }

      // Filter out defeated tokens (for characters/NPCs only)
      return !isTokenDefeated(token);
    } catch {
      return true; // Keep outcome if we can't determine defeated status
    }
  });
}
