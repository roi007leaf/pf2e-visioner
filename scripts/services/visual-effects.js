/**
 * Visual Effects Handler
 * Handles token/wall visual updates and refresh operations for both visibility and cover
 */

import { MODULE_ID } from '../constants.js';
import { getVisibilityBetween } from '../utils.js';

/**
 * Update token visuals - now mostly handled by detection wrapper
 * This function mainly serves to trigger a token refresh
 */
export async function updateTokenVisuals() {
  if (!canvas?.tokens) return;
  if (isDiceSoNiceAnimating()) {
    setTimeout(() => updateTokenVisuals(), 500);
    return;
  }
  // Minimal per-token refresh; token.visibility managed by PF2e detection wrapper
  for (const token of canvas.tokens.placeables) {
    try {
      if (token?.visible) token.refresh();
    } catch (_) {}
  }
}

/**
 * Targeted updates for performance and correctness. Only applies effects to the provided pairs.
 * @param {Array<{observerId:string,targetId:string,visibility?:string,cover?:string}>} pairs
 */
export async function updateSpecificTokenPairs(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) return;
  // Apply only changed visibility/cover per pair
  for (const p of pairs) {
    const observer = canvas.tokens.get(p.observerId);
    const target = canvas.tokens.get(p.targetId);
    if (!observer || !target) continue;
    // We do not draw custom visibility rings; detection/engine visuals will handle it
    // Effects are already applied by batch/single upsert paths; do not re-apply here
    // This function should only refresh visuals to avoid double-application of rules
    // Light refresh of the two tokens
    try {
      observer.refresh();
    } catch (_) {}
    try {
      target.refresh();
    } catch (_) {}
  }
}

/**
 * Check if Dice So Nice is currently animating
 * @returns {boolean} True if dice are currently animating
 */
function isDiceSoNiceAnimating() {
  // Check if Dice So Nice module is active
  if (!game.modules.get('dice-so-nice')?.active) {
    return false;
  }

  // Primary check: dice box rolling status
  if (game.dice3d?.box?.rolling) {
    return true;
  }

  // Secondary check: dice canvas visibility and animation state
  const diceCanvas = document.getElementById('dice-box-canvas');
  if (diceCanvas) {
    const isVisible = diceCanvas.style.display !== 'none' && diceCanvas.offsetParent !== null;
    const hasOpacity = parseFloat(getComputedStyle(diceCanvas).opacity) > 0;

    if (isVisible && hasOpacity) {
      return true;
    }
  }

  // Tertiary check: look for active dice animations in the scene
  if (game.dice3d?.box?.scene?.children?.length > 0) {
    return true;
  }

  return false;
}

/**
 * Clean up visual indicators for a deleted wall
 * This function handles cleanup when a wall is deleted, ensuring that
 * any visual indicators are properly removed from all clients
 */
export async function cleanupDeletedWallVisuals(wallDocument) {
  try {
    if (!wallDocument?.id) return;

    const wallId = wallDocument.id;

    // Search through all potential canvas layers where wall indicators might exist
    const layers = [
      canvas.effects?.foreground,
      canvas.effects,
      canvas.walls,
      canvas.interface,
      canvas.stage, // Sometimes indicators can end up here
    ].filter(Boolean);

    // Look for any PIXI graphics objects that might be orphaned wall indicators
    function searchAndRemoveIndicators(container) {
      if (!container?.children) return;

      const toRemove = [];
      for (const child of container.children) {
        try {
          // Check if this is a wall indicator that belongs to the deleted wall
          if (
            child._pvWallId === wallId ||
            child._wallDocumentId === wallId ||
            (child._associatedWallId && child._associatedWallId === wallId)
          ) {
            toRemove.push(child);
          }

          // Recursively search children
          if (child.children && child.children.length > 0) {
            searchAndRemoveIndicators(child);
          }
        } catch (_) {}
      }

      // Remove found indicators
      for (const indicator of toRemove) {
        try {
          if (indicator.parent) {
            indicator.parent.removeChild(indicator);
          }
          indicator.destroy?.({ children: true, texture: true, baseTexture: true });
        } catch (_) {}
      }
    }

    // Search all layers
    for (const layer of layers) {
      searchAndRemoveIndicators(layer);
    }

    // Also search for wall references in the walls layer placeables
    // In case there are any lingering references
    const walls = canvas?.walls?.placeables || [];
    for (const wall of walls) {
      try {
        // Clean up hidden indicator references
        if (wall._pvHiddenIndicator) {
          if (
            wall._pvHiddenIndicator._pvWallId === wallId ||
            wall._pvHiddenIndicator._wallDocumentId === wallId
          ) {
            try {
              if (wall._pvHiddenIndicator.parent) {
                wall._pvHiddenIndicator.parent.removeChild(wall._pvHiddenIndicator);
              }
              wall._pvHiddenIndicator.destroy?.();
            } catch (_) {}
            wall._pvHiddenIndicator = null;
          }
        }

        // Clean up see-through masks
        if (wall._pvSeeThroughMasks && Array.isArray(wall._pvSeeThroughMasks)) {
          const filteredMasks = wall._pvSeeThroughMasks.filter((mask) => {
            if (mask._pvWallId === wallId || mask._wallDocumentId === wallId) {
              try {
                if (mask.parent) mask.parent.removeChild(mask);
                mask.destroy?.();
              } catch (_) {}
              return false;
            }
            return true;
          });
          wall._pvSeeThroughMasks = filteredMasks;
        }

        // Stop animation if it's associated with the deleted wall
        if (wall._pvAnimationActive && (wall.id === wallId || wall.document?.id === wallId)) {
          wall._pvAnimationActive = false;
        }
      } catch (_) {}
    }

    // Clean up any token wall flags that reference the deleted wall
    try {
      const tokens = canvas.tokens?.placeables || [];
      const tokenUpdates = [];

      for (const token of tokens) {
        try {
          const wallMap = token.document?.getFlag?.(MODULE_ID, 'walls') || {};
          if (wallMap[wallId]) {
            const newWallMap = { ...wallMap };
            delete newWallMap[wallId];
            tokenUpdates.push({
              _id: token.id,
              [`flags.${MODULE_ID}.walls`]: newWallMap,
            });
          }
        } catch (_) {}
      }

      if (tokenUpdates.length > 0 && game.user?.isGM) {
        await canvas.scene?.updateEmbeddedDocuments?.('Token', tokenUpdates, { diff: false });
      }
    } catch (error) {
      console.warn(`[${MODULE_ID}] Error cleaning up token wall flags:`, error);
    }

    // Force a canvas refresh to ensure visual updates are applied
    try {
      canvas.perception?.update?.({
        refreshLighting: false,
        refreshVision: false,
        refreshOcclusion: false,
        refreshEffects: true,
      });
    } catch (_) {}
  } catch (error) {
    console.warn(`[${MODULE_ID}] Error cleaning up deleted wall visuals:`, error);
  }
}

/**
 * Visual-only walls toggle per observer
 * Hides walls for this client if the active observer has them set as hidden
 */
// Wall visuals and tooltips temporarily disabled
let lastObserverId = null;
export async function updateWallVisuals(observerId = null) {
  try {
    // Respect setting toggle
    if (!game.settings?.get?.(MODULE_ID, 'hiddenWallsEnabled')) {
      return;
    }

    // Quick exit if observer hasn't changed (prevents unnecessary work)
    if (observerId === lastObserverId) {
      return;
    }
    lastObserverId = observerId;

    const walls = canvas?.walls?.placeables || [];
    if (!walls.length) return;

    // Prepare updates (GM only) to make hidden doors not block sight
    const updates = [];
    const isGM = !!game.user?.isGM;

    // Determine local observer token strictly from current selection (or provided id)
    let observer = null;
    try {
      if (observerId) observer = canvas.tokens.get(observerId) || null;
      if (!observer) observer = canvas.tokens.controlled?.[0] || null;
      // Only show indicators when a player-owned token is selected
      if (!observer || !observer.actor?.hasPlayerOwner) observer = null;
    } catch (_) {
      observer = null;
    }
    const wallMapForObserver = observer?.document?.getFlag?.(MODULE_ID, 'walls') || {};

    // Build an expanded set of observed wall IDs that includes any walls
    // connected to an observed wall via the connectedWalls identifier list.
    const observedSet = new Set(
      Object.entries(wallMapForObserver)
        .filter(([, v]) => v === 'observed')
        .map(([id]) => id),
    );
    const expandedObserved = new Set(observedSet);
    try {
      const { getConnectedWallDocsBySourceId } = await import('./connected-walls.js');
      for (const wall of walls) {
        const id = wall?.document?.id;
        if (!id || !observedSet.has(id)) continue;
        const connectedDocs = getConnectedWallDocsBySourceId(id) || [];
        for (const d of connectedDocs) expandedObserved.add(d.id);
      }
    } catch (_) {}

    // Collect token flag updates for player-owned tokens that can see hidden walls
    const tokenWallFlagUpdates = [];
    for (const wall of walls) {
      const d = wall.document;
      if (!d) continue;
      let flagHidden = false;
      try {
        flagHidden = !!d.getFlag?.(MODULE_ID, 'hiddenWall');
      } catch (_) {}

      // Remove previous indicator/masks if any (always clean before evaluating)
      try {
        if (wall._pvHiddenIndicator && wall._pvHiddenIndicator.parent) {
          wall._pvHiddenIndicator.parent.removeChild(wall._pvHiddenIndicator);
        }
        wall._pvHiddenIndicator = null;
        if (wall._pvSeeThroughMasks && Array.isArray(wall._pvSeeThroughMasks)) {
          for (const m of wall._pvSeeThroughMasks) {
            try {
              m.parent?.removeChild(m);
              m.destroy?.();
            } catch (_) {}
          }
          wall._pvSeeThroughMasks = [];
        }
      } catch (_) {}

      const isExpandedObserved = expandedObserved.has(d.id);
      if (!flagHidden && !isExpandedObserved) {
        // If previously stored original sight exists, restore (GM only)
        if (isGM) {
          try {
            const origSight = d.getFlag?.(MODULE_ID, 'originalSight');
            if (origSight !== undefined && origSight !== null && d.sight !== origSight) {
              updates.push({
                _id: d.id,
                sight: origSight,
                [`flags.${MODULE_ID}.originalSight`]: null,
              });
            }
          } catch (_) {}
        }
        continue;
      }

      // Draw indicator for this client only if the wall is observed for the local observer
      try {
        const c = Array.isArray(d.c) ? d.c : [d.x, d.y, d.x2, d.y2];
        const [x1, y1, x2, y2] = c;
        if ([x1, y1, x2, y2].every((n) => typeof n === 'number')) {
          const shouldShowIndicator = isExpandedObserved;
          const seeThrough = shouldShowIndicator && false && !!observer;
          if (shouldShowIndicator) {
            // Clean previous indicator
            try {
              if (wall._pvHiddenIndicator) {
                wall._pvHiddenIndicator.parent?.removeChild(wall._pvHiddenIndicator);
                wall._pvHiddenIndicator.destroy?.();
              }
            } catch (_) {}

            const isDoor = Number(d.door) > 0; // 0 none, 1 door, 2 secret
            const color = isDoor ? 0xffd166 : 0x9b59b6; // Yellow for doors, purple for walls
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len;
            const ny = dx / len; // unit normal
            // Per-scene configurable indicator half-width
            let half = 10;
            try {
              const flagVal = Number(canvas?.scene?.getFlag?.(MODULE_ID, 'hiddenIndicatorHalf'));
              if (Number.isFinite(flagVal) && flagVal > 0) half = flagVal;
            } catch (_) {}
            const g = new PIXI.Graphics();
            g.lineStyle(2, color, 0.9);
            g.beginFill(color, 0.3);
            g.drawPolygon([
              x1 + nx * half,
              y1 + ny * half,
              x2 + nx * half,
              y2 + ny * half,
              x2 - nx * half,
              y2 - ny * half,
              x1 - nx * half,
              y1 - ny * half,
            ]);
            g.endFill();

            // Mark this indicator with the wall ID for cleanup tracking
            g._pvWallId = d.id;
            g._wallDocumentId = d.id;

            // Create animated effect container
            const effectContainer = new PIXI.Container();
            effectContainer._pvWallId = d.id;
            effectContainer._wallDocumentId = d.id;
            g.addChild(effectContainer);

            // Shockwave effect
            const shimmer = new PIXI.Graphics();
            shimmer._pvWallId = d.id;
            shimmer._wallDocumentId = d.id;
            effectContainer.addChild(shimmer);

            // Sparkle particles (even more sparkles with variety!)
            const sparkles = [];
            for (let i = 0; i < 50; i++) {
              const sparkle = new PIXI.Graphics();
              sparkle.beginFill(0xffffff, 0.8);
              const size = 1.5 + Math.random() * 1.5; // Random sizes 1.5-3px
              sparkle.drawCircle(0, 0, size);
              sparkle.endFill();

              // Mark sparkles with wall ID for cleanup
              sparkle._pvWallId = d.id;
              sparkle._wallDocumentId = d.id;

              effectContainer.addChild(sparkle);

              // Store initial random properties for organic movement
              sparkle._moveSpeed = 0.2 + Math.random() * 0.3; // Different speeds
              sparkle._curveX = Math.random() * Math.PI * 2; // Random curve offsets
              sparkle._curveY = Math.random() * Math.PI * 2;
              sparkle._floatRange = 8 + Math.random() * 12; // Different float distances

              sparkles.push(sparkle);
            }

            g.zIndex = 1000;
            g.eventMode = 'none';

            // Force immediate visibility and test animation
            g.alpha = 1.0;

            // Store animation state on the wall for debugging
            wall._pvAnimationActive = true;

            // Simplified, more reliable animation
            const startTime = Date.now();

            const animate = () => {
              try {
                // Check if still attached to scene
                if (!g.parent || !wall._pvAnimationActive) {
                  return;
                }

                const elapsed = (Date.now() - startTime) / 1000; // seconds

                // 1. Main rectangle - solid opacity (no fade)
                g.alpha = 1.0;

                // 2. No outer glow (removed floating rectangle)

                // 3. Subtle glowing outline effect
                shimmer.clear();

                // Stronger breathing glow
                const breathe = 1.0 + 0.12 * Math.sin(elapsed * 1.2); // More noticeable size change
                const glowAlpha = 0.35 + 0.2 * Math.sin(elapsed * 0.8); // Stronger alpha pulse

                // Create darker variant of the base color
                const darkerColor = color === 0xffd166 ? 0xcc9900 : 0x7a4d8a; // Darker yellow or darker purple

                // Strong outer glow
                shimmer.lineStyle(5, darkerColor, glowAlpha);
                const glowExpansion = 6 * breathe; // More expansion
                shimmer.drawPolygon([
                  x1 + nx * (half + glowExpansion),
                  y1 + ny * (half + glowExpansion),
                  x2 + nx * (half + glowExpansion),
                  y2 + ny * (half + glowExpansion),
                  x2 - nx * (half + glowExpansion),
                  y2 - ny * (half + glowExpansion),
                  x1 - nx * (half + glowExpansion),
                  y1 - ny * (half + glowExpansion),
                ]);

                // Optional: Very subtle inner highlight
                const highlightAlpha = 0.05 + 0.03 * Math.sin(elapsed * 1.5);
                shimmer.lineStyle(1, 0xffffff, highlightAlpha);
                shimmer.drawPolygon([
                  x1 + nx * (half - 2),
                  y1 + ny * (half - 2),
                  x2 + nx * (half - 2),
                  y2 + ny * (half - 2),
                  x2 - nx * (half - 2),
                  y2 - ny * (half - 2),
                  x1 - nx * (half - 2),
                  y1 - ny * (half - 2),
                ]);

                // 4. Organic sparkle animation with curvy movement
                sparkles.forEach((sparkle, i) => {
                  const sparkleTime = elapsed * sparkle._moveSpeed + i * 0.8;

                  // Curvy movement along the wall using multiple sine waves
                  const progress = (sparkleTime * 0.3) % 1; // Base movement along wall
                  const baseX = x1 + dx * progress;
                  const baseY = y1 + dy * progress;

                  // Complex organic floating with different wave patterns
                  const curveTimeX = sparkleTime + sparkle._curveX;
                  const curveTimeY = sparkleTime + sparkle._curveY;

                  // Multiple sine waves for organic movement
                  const floatX =
                    (sparkle._floatRange *
                      (0.6 * Math.sin(curveTimeX * 2.1) +
                        0.3 * Math.sin(curveTimeX * 3.7) +
                        0.1 * Math.sin(curveTimeX * 6.2))) /
                    3;

                  const floatY =
                    (sparkle._floatRange *
                      (0.6 * Math.cos(curveTimeY * 1.8) +
                        0.3 * Math.cos(curveTimeY * 4.1) +
                        0.1 * Math.cos(curveTimeY * 5.9))) /
                    3;

                  // Keep sparkles properly contained within the rectangle
                  const maxFloat = half * 0.7; // Maximum distance from wall center
                  const constrainedFloatX = Math.max(-maxFloat, Math.min(maxFloat, floatX * 0.3));
                  const constrainedFloatY = Math.max(-maxFloat, Math.min(maxFloat, floatY * 0.3));

                  // Position sparkles within the rectangle using normal vectors
                  sparkle.x = baseX + nx * constrainedFloatX;
                  sparkle.y = baseY + ny * constrainedFloatY;

                  // Organic twinkling and size variation
                  sparkle.alpha = 0.3 + 0.5 * Math.sin(sparkleTime * 4 + i * 0.7);
                  const sizeVariation = 0.7 + 0.4 * Math.sin(sparkleTime * 3.2 + i * 1.1);
                  sparkle.scale.set(sizeVariation);
                });

                requestAnimationFrame(animate);
              } catch (error) {
                console.error(`[PF2E-Visioner] Animation error:`, error);
              }
            };

            // Start animation immediately
            requestAnimationFrame(animate);

            const parent = canvas.effects?.foreground || canvas.effects || canvas.walls || wall;
            parent.addChild(g);
            wall._pvHiddenIndicator = g;
          }

          // Experimental per-token see-through: mask out the wall for this client by overlaying a hole along the wall segment
          if (seeThrough) {
            try {
              // Create a thin rectangular mask along the wall to visually remove it for this client
              const mask = new PIXI.Graphics();
              const isDoor = Number(d.door) > 0;
              const maskColor = isDoor ? 0xffd166 : 0x9b59b6; // Yellow for doors, purple for walls
              mask.beginFill(maskColor, 1.0);

              // Mark mask with wall ID for cleanup
              mask._pvWallId = d.id;
              mask._wallDocumentId = d.id;

              const dx = x2 - x1;
              const dy = y2 - y1;
              const len = Math.hypot(dx, dy) || 1;
              const nx = -dy / len;
              const ny = dx / len; // unit normal
              const half = 3; // 6px wide opening
              mask.drawPolygon([
                x1 + nx * half,
                y1 + ny * half,
                x2 + nx * half,
                y2 + ny * half,
                x2 - nx * half,
                y2 - ny * half,
                x1 - nx * half,
                y1 - ny * half,
              ]);
              mask.endFill();
              mask.alpha = 1;
              mask.zIndex = 999;
              mask.eventMode = 'none';
              (canvas.walls || wall).addChild(mask);
              if (!wall._pvSeeThroughMasks) wall._pvSeeThroughMasks = [];
              wall._pvSeeThroughMasks.push(mask);
            } catch (_) {}
          } else if (wall._pvSeeThroughMasks) {
            try {
              wall._pvSeeThroughMasks.forEach((m) => m.parent?.removeChild(m));
            } catch (_) {}
            wall._pvSeeThroughMasks = [];
          }

          // As GM, optionally open the wall's sight globally for any wall (door or not)
          // when at least one player-owned token has it Observed. This controls real occlusion.
          if (isGM) {
            try {
              const gmSeeThroughEnabled = false;
              if (!gmSeeThroughEnabled) {
                // Ensure any previous override is restored
                const origSight = d.getFlag?.(MODULE_ID, 'originalSight');
                if (origSight !== undefined && origSight !== null && d.sight !== origSight) {
                  updates.push({
                    _id: d.id,
                    sight: origSight,
                    [`flags.${MODULE_ID}.originalSight`]: null,
                  });
                }
              } else {
                // Determine if any token in the scene has this wall marked as Observed
                let anyObserved = false;
                try {
                  const tokens = canvas.tokens?.placeables || [];
                  for (const t of tokens) {
                    const wm = t?.document?.getFlag?.(MODULE_ID, 'walls') || {};
                    if (wm?.[d.id] === 'observed') {
                      anyObserved = true;
                      break;
                    }
                  }
                } catch (_) {}

                if (anyObserved) {
                  const currentSight = Number(d.sight ?? 1);
                  if (currentSight !== 0) {
                    const origSight = d.getFlag?.(MODULE_ID, 'originalSight');
                    const toStore =
                      origSight === undefined || origSight === null ? currentSight : origSight;
                    const patch = { _id: d.id, sight: 0 };
                    patch[`flags.${MODULE_ID}.originalSight`] = toStore;
                    updates.push(patch);
                  }
                } else {
                  // Not seeing through: restore any previous override
                  const origSight = d.getFlag?.(MODULE_ID, 'originalSight');
                  if (origSight !== undefined && origSight !== null && d.sight !== origSight) {
                    updates.push({
                      _id: d.id,
                      sight: origSight,
                      [`flags.${MODULE_ID}.originalSight`]: null,
                    });
                  }
                }
              }
            } catch (_) {}
          }

          // Note: Auto-discovery disabled. Observed/Hidden should be controlled via the Token Manager.
        }
      } catch (_) {}

      // Door-specific unconditional relaxation removed; handled above under unified GM logic.
    }

    if (isGM && (updates.length > 0 || tokenWallFlagUpdates.length > 0)) {
      try {
        if (updates.length > 0)
          await canvas.scene?.updateEmbeddedDocuments?.('Wall', updates, { diff: false });
        if (tokenWallFlagUpdates.length > 0)
          await canvas.scene?.updateEmbeddedDocuments?.('Token', tokenWallFlagUpdates, {
            diff: false,
          });
        // After sight changes, refresh perception
        canvas.perception.update({
          refreshVision: true,
          refreshOcclusion: true,
        });
        // Force token refresh so newly visible tokens render
        try {
          for (const t of canvas.tokens.placeables) t.refresh?.();
        } catch (_) {}
      } catch (e) {
        console.warn(`[${MODULE_ID}] Failed to update hidden door sight overrides`, e);
      }
    }

    // Draw hidden-echo overlays for tokens relative to current observer (client-only visual)
    try {
      await updateHiddenTokenEchoes(observer);
    } catch (_) {}
  } catch (_) {}
}

/**
 * Draw or remove a subtle "soundwave" echo overlay for tokens that are Hidden to the current observer
 * This is client-only visual so the player gets feedback even if PF2e detection hides the sprite.
 */
async function updateHiddenTokenEchoes(observer) {
  try {
    const enabled = false;
    if (!enabled || !observer) {
      // remove any existing overlays
      for (const t of canvas.tokens.placeables) removeEcho(t);
      return;
    }
    // Build wall sets for intersection checks
    const walls = canvas?.walls?.placeables || [];
    const wallMap = observer?.document?.getFlag?.(MODULE_ID, 'walls') || {};
    // Expanded observed set: includes connected walls of any observed wall
    const observedSet = new Set(
      Object.entries(wallMap)
        .filter(([, v]) => v === 'observed')
        .map(([id]) => id),
    );
    const expandedObserved = new Set(observedSet);
    try {
      const { getConnectedWallDocsBySourceId } = await import('./connected-walls.js');
      for (const w of walls) {
        const id = w?.document?.id;
        if (!id || !observedSet.has(id)) continue;
        const connectedDocs = getConnectedWallDocsBySourceId(id) || [];
        for (const d of connectedDocs) expandedObserved.add(d.id);
      }
    } catch (_) {}
    const hiddenObservedWalls = walls.filter((w) => {
      try {
        return expandedObserved.has(w?.document?.id);
      } catch (_) {
        return false;
      }
    });
    const regularBlockingWalls = walls.filter((w) => {
      try {
        const d = w.document;
        if (expandedObserved.has(d.id)) return false; // these are allowed
        const isDoor = Number(d.door) > 0;
        const doorState = Number(d.ds ?? d.doorState ?? 0);
        if (isDoor && doorState === 1) return false; // open door
        const sight = Number(d.sight ?? 1);
        if (sight === 0) return false; // non-blocking
        return true;
      } catch (_) {
        return false;
      }
    });

    for (const t of canvas.tokens.placeables) {
      if (!t?.actor || t === observer) {
        removeEcho(t);
        continue;
      }
      let vis = 'observed';
      try {
        vis = getVisibilityBetween(observer, t);
      } catch (_) {}
      if (vis !== 'hidden') {
        removeEcho(t);
        continue;
      }
      // Only show echo if token lies behind at least one hidden+observed wall, and not blocked by any regular walls
      const p1 = observer.center || observer.getCenter?.();
      const p2 = t.center || t.getCenter?.();
      if (!p1 || !p2) {
        removeEcho(t);
        continue;
      }
      const intersectsHidden = hiddenObservedWalls.some((w) => segmentIntersectsWall(p1, p2, w));
      if (!intersectsHidden) {
        removeEcho(t);
        continue;
      }
      const intersectsRegular = regularBlockingWalls.some((w) => segmentIntersectsWall(p1, p2, w));
      if (intersectsRegular) {
        removeEcho(t);
        continue;
      }
      drawEcho(t);
    }
  } catch (_) {}
}

function drawEcho(token) {
  try {
    const center = token.center ||
      token.getCenter?.() || { x: token.x + token.w / 2, y: token.y + token.h / 2 };
    const g = token._pvHiddenEcho || new PIXI.Graphics();
    g.clear();
    const color = 0xffa500; // orange
    g.lineStyle(2, color, 0.9);
    const radii = [12, 18, 24];
    for (const r of radii) g.drawCircle(center.x, center.y, r);
    g.zIndex = 1001;
    g.eventMode = 'none';
    if (!token._pvHiddenEcho) {
      (canvas.tokens || token.parent)?.addChild(g);
      token._pvHiddenEcho = g;
    }
  } catch (_) {}
}

function removeEcho(token) {
  try {
    if (token?._pvHiddenEcho) {
      token._pvHiddenEcho.parent?.removeChild(token._pvHiddenEcho);
      token._pvHiddenEcho.destroy?.();
    }
  } catch (_) {}
  token._pvHiddenEcho = null;
}

// Geometry helpers
function segmentIntersectsWall(p1, p2, wall) {
  try {
    const d = wall?.document;
    if (!d) return false;
    const c = Array.isArray(d.c) ? d.c : [d.x, d.y, d.x2, d.y2];
    const [x1, y1, x2, y2] = c;
    if ([x1, y1, x2, y2].some((n) => typeof n !== 'number')) return false;
    return segmentsIntersect(p1, p2, { x: x1, y: y1 }, { x: x2, y: y2 });
  } catch (_) {
    return false;
  }
}

function segmentsIntersect(p1, p2, q1, q2) {
  const o = (a, b, c) => Math.sign((b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y));
  const onSeg = (a, b, c) =>
    Math.min(a.x, b.x) <= c.x &&
    c.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= c.y &&
    c.y <= Math.max(a.y, b.y);
  const o1 = o(p1, p2, q1);
  const o2 = o(p1, p2, q2);
  const o3 = o(q1, q2, p1);
  const o4 = o(q1, q2, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(p1, p2, q1)) return true;
  if (o2 === 0 && onSeg(p1, p2, q2)) return true;
  if (o3 === 0 && onSeg(q1, q2, p1)) return true;
  if (o4 === 0 && onSeg(q1, q2, p2)) return true;
  return false;
}
