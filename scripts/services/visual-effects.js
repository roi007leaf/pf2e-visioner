/**
 * Visual Effects Handler
 * Handles token/wall visual updates and refresh operations for both visibility and cover
 */

import { MODULE_ID, VISIBILITY_STATES } from '../constants.js';
import { getVisibilityBetween } from '../utils.js';
import { _internal as visibilityCalculatorInternal } from '../visibility/StatelessVisibilityCalculator.js';

/**
 * Update token visuals - now mostly handled by detection wrapper
 * This function mainly serves to trigger a t    } catch (error) {
      console.warn(`[${MODULE_ID}] Error cleaning up all wall indicators:`, error);
    }
  } catch (error) {
    console.warn(`[${MODULE_ID}] Error cleaning up all wall indicators:`, error);
  }
}

/**
 * Visual-only walls toggle per observer
 * Hides walls for this client if the active observer has them set as hidden
 */
let updateTokenVisualsPending = false;

export async function updateTokenVisuals() {
  if (!canvas?.tokens) return;
  if (isDiceSoNiceAnimating()) {
    // Defer refresh until dice animations complete, but avoid multiple pending calls
    if (!updateTokenVisualsPending) {
      updateTokenVisualsPending = true;
      // Wait a short time and retry
      await new Promise(resolve => setTimeout(resolve, 100));
      updateTokenVisualsPending = false;
      updateTokenVisuals();
    }
    return;
  }
  // Minimal per-token refresh; token.visibility managed by PF2e detection wrapper
  for (const token of canvas.tokens.placeables) {
    try {
      if (token?.visible && !token.destroyed && token.sprite && token.mesh) {
        if (!token.turnMarker || token.turnMarker.mesh) {
          token.refresh();
        }
      }
    } catch (_) { }
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
      if (!observer.destroyed && observer.sprite && observer.mesh) {
        if (!observer.turnMarker || observer.turnMarker.mesh) {
          observer.refresh();
        }
      }
    } catch (_) { }
    try {
      if (!target.destroyed && target.sprite && target.mesh) {
        if (!target.turnMarker || target.turnMarker.mesh) {
          target.refresh();
        }
      }
    } catch (_) { }
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
        } catch (_) { }
      }

      // Remove found indicators
      for (const indicator of toRemove) {
        try {
          if (indicator.parent) {
            indicator.parent.removeChild(indicator);
          }
          indicator.destroy?.({ children: true, texture: true, baseTexture: true });
        } catch (_) { }
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
            } catch (_) { }
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
              } catch (_) { }
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
      } catch (_) { }
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
        } catch (_) { }
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
    } catch (_) { }
  } catch (error) {
    console.warn(`[${MODULE_ID}] Error cleaning up deleted wall visuals:`, error);
  }
}

/**
 * Clean up all wall indicators globally - useful for mass deletions
 * This function removes all wall indicators from the canvas layers without
 * needing to iterate over specific wall documents
 */
export async function cleanupAllWallIndicators() {
  try {
    // Clean up hover tooltips cover indicators first (these are created by Alt key for tokens)
    // NOTE: We only cleanup indicators, not the entire hover tooltip system
    // because we don't want to remove event listeners from tokens
    try {
      const { hideAllVisibilityIndicators, hideAllCoverIndicators } = await import('./HoverTooltips.js');
      hideAllVisibilityIndicators();
      hideAllCoverIndicators();
    } catch (_) { }

    // Search through all potential canvas layers where wall indicators might exist
    const layers = [
      canvas.effects?.foreground,
      canvas.effects,
      canvas.walls,
      canvas.interface,
      canvas.stage, // Sometimes indicators can end up here
    ].filter(Boolean);

    // Look for any PIXI graphics objects that look like wall indicators
    function searchAndRemoveAllIndicators(container) {
      if (!container?.children) return;

      const toRemove = [];
      for (const child of container.children) {
        try {
          // Check if this looks like a wall indicator based on properties that wall indicators have
          const isWallIndicator = (
            child._pvWallId ||
            child._wallDocumentId ||
            child._associatedWallId ||
            (child.name && child.name.includes('wall-indicator')) ||
            (child._pvIndicatorType === 'wall') ||
            // Add checks for UI-generated wall labels (created by refreshWallIdentifierLabels)
            (child._tooltip && child._coverText) || // Cover status labels from Alt key
            (child instanceof PIXI.Text && (child.style?.stroke === 0x000000 && child.style?.strokeThickness >= 3)) // Identifier labels
          );

          if (isWallIndicator) {
            toRemove.push(child);
          }

          // Recursively search children
          if (child.children && child.children.length > 0) {
            searchAndRemoveAllIndicators(child);
          }
        } catch (_) { }
      }

      // Remove found indicators
      for (const indicator of toRemove) {
        try {
          if (indicator.parent) {
            indicator.parent.removeChild(indicator);
          }
          indicator.destroy?.({ children: true, texture: true, baseTexture: true });
        } catch (_) { }
      }
    }

    // Search all layers
    for (const layer of layers) {
      searchAndRemoveAllIndicators(layer);
    }

    // Also clean up any references on remaining wall objects
    const walls = canvas?.walls?.placeables || [];
    for (const wall of walls) {
      try {
        // Clean up hidden indicator references
        if (wall._pvHiddenIndicator) {
          try {
            if (wall._pvHiddenIndicator.parent) {
              wall._pvHiddenIndicator.parent.removeChild(wall._pvHiddenIndicator);
            }
            wall._pvHiddenIndicator.destroy?.();
          } catch (_) { }
          wall._pvHiddenIndicator = null;
        }

        // Clean up see-through masks
        if (wall._pvSeeThroughMasks && Array.isArray(wall._pvSeeThroughMasks)) {
          for (const mask of wall._pvSeeThroughMasks) {
            try {
              if (mask.parent) mask.parent.removeChild(mask);
              mask.destroy?.();
            } catch (_) { }
          }
          wall._pvSeeThroughMasks = [];
        }

        // Clean up UI wall labels (Alt key indicators)
        if (wall._pvCoverIcon) {
          try {
            if (wall._pvCoverIcon.parent) {
              wall._pvCoverIcon.parent.removeChild(wall._pvCoverIcon);
            }
            wall._pvCoverIcon.destroy?.();
          } catch (_) { }
          delete wall._pvCoverIcon;
        }

        // Clean up UI wall identifier labels 
        if (wall._pvIdLabel) {
          try {
            if (wall._pvIdLabel.parent) {
              wall._pvIdLabel.parent.removeChild(wall._pvIdLabel);
            }
            wall._pvIdLabel.destroy?.();
          } catch (_) { }
          delete wall._pvIdLabel;
        }

        // Stop any active animations
        if (wall._pvAnimationActive) {
          wall._pvAnimationActive = false;
        }
      } catch (_) { }
    }



    // Force a canvas refresh to ensure visual updates are applied
    try {
      canvas.perception?.update?.({
        refreshLighting: false,
        refreshVision: false,
        refreshOcclusion: false,
        refreshEffects: true,
      });
    } catch (_) { }
  } catch (error) {
    console.warn(`[${MODULE_ID}] Error cleaning up all wall indicators:`, error);
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

    // Don't skip based on observer ID - wall flags may have changed
    lastObserverId = observerId;

    const walls = canvas?.walls?.placeables || [];
    if (!walls.length) {
      return;
    }

    // Prepare updates (GM only) to make hidden doors not block sight
    const updates = [];
    const isGM = !!game.user?.isGM;

    // Determine local observer token strictly from current selection (or provided id)
    let observer = null;
    try {
      if (observerId) {
        observer = canvas.tokens.get(observerId) || null;
      }
      if (!observer) {
        observer = canvas.tokens.controlled?.[0] || null;
      }
    } catch (_) {
      observer = null;
    }

    // Only show indicators if the current user is actively controlling this token
    if (observer && !canvas.tokens.controlled.includes(observer)) {
      return;
    }

    // Don't require hasPlayerOwner - any controlled token should show indicators
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
    } catch (_) { }

    // Collect token flag updates for player-owned tokens that can see hidden walls
    const tokenWallFlagUpdates = [];
    for (const wall of walls) {
      const d = wall.document;
      if (!d) continue;

      let flagHidden = false;
      try {
        flagHidden = !!d.getFlag?.(MODULE_ID, 'hiddenWall');
      } catch (_) { }

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
            } catch (_) { }
          }
          wall._pvSeeThroughMasks = [];
        }
      } catch (_) { }

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
          } catch (_) { }
        }
        continue;
      }

      // Draw indicator for this client only if the wall is observed for the local observer
      try {
        const c = Array.isArray(d.c) ? d.c : [d.x, d.y, d.x2, d.y2];
        const [x1, y1, x2, y2] = c;
        if ([x1, y1, x2, y2].every((n) => typeof n === 'number')) {
          // Check if the controlled token has this wall flagged as 'observed'
          const tokenWallFlag = wallMapForObserver[d.id];
          const shouldShowIndicator = tokenWallFlag === 'observed';
          const seeThrough = shouldShowIndicator && false && !!observer;
          if (shouldShowIndicator) {
            // Clean previous indicator
            try {
              if (wall._pvHiddenIndicator) {
                wall._pvHiddenIndicator.parent?.removeChild(wall._pvHiddenIndicator);
                wall._pvHiddenIndicator.destroy?.();
              }
            } catch (_) { }

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
            } catch (_) { }
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
            } catch (_) { }
          } else if (wall._pvSeeThroughMasks) {
            try {
              wall._pvSeeThroughMasks.forEach((m) => m.parent?.removeChild(m));
            } catch (_) { }
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
                } catch (_) { }

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
            } catch (_) { }
          }

          // Note: Auto-discovery disabled. Observed/Hidden should be controlled via the Token Manager.
        }
      } catch (_) { }

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
        // CRITICAL: Only refresh perception if this wasn't called from token selection
        const isFromTokenSelection = this._isFromTokenSelection?.() ?? false;
        if (!isFromTokenSelection) {
          canvas.perception.update({
            refreshVision: true,
            refreshOcclusion: true,
          });
        }
        // Force token refresh so newly visible tokens render
        try {
          for (const t of canvas.tokens.placeables) {
            if (!t.destroyed && t.sprite && t.mesh) {
              if (!t.turnMarker || t.turnMarker.mesh) {
                t.refresh?.();
              }
            }
          }
        } catch (_) { }
      } catch (e) {
        console.warn(`[${MODULE_ID}] Failed to update hidden door sight overrides`, e);
      }
    }

    // Draw hidden-echo overlays for tokens relative to current observer (client-only visual)
    try {
      await updateHiddenTokenEchoes(observer);
    } catch (_) { }
  } catch (_) { }
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
    } catch (_) { }
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
      } catch (_) { }
      if (vis !== 'hidden') {
        removeEcho(t);
        continue;
      }
      // Only show echo if token lies behind at least one hidden+observed wall, and not blocked by any regular walls
      const p1 = observer.center || observer.getCenterPoint?.();
      const p2 = t.center || t.getCenterPoint?.();
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
  } catch (_) { }
}

function drawEcho(token) {
  try {
    const center = token.center ||
      token.getCenterPoint?.() || { x: token.x + token.w / 2, y: token.y + token.h / 2, elevation: token.elevation };
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
  } catch (_) { }
}

function removeEcho(token) {
  try {
    if (token?._pvHiddenEcho) {
      token._pvHiddenEcho.parent?.removeChild(token._pvHiddenEcho);
      token._pvHiddenEcho.destroy?.();
    }
  } catch (_) { }
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

/**
 * Optimized wall indicator update that ONLY handles visual indicators
 * Does not trigger lighting refresh or AVS processing
 * Used specifically for controlToken hooks to avoid unnecessary AVS runs
 * @param {string} observerId - The observer token ID
 */
export async function updateWallIndicatorsOnly(observerId = null) {
  try {
    // Respect setting toggle
    if (!game.settings?.get?.(MODULE_ID, 'hiddenWallsEnabled')) {
      return;
    }

    const walls = canvas?.walls?.placeables || [];
    if (!walls.length) {
      return;
    }

    // Determine local observer token strictly from current selection (or provided id)
    let observer = null;
    try {
      if (observerId) {
        observer = canvas.tokens.get(observerId) || null;
      }
      if (!observer) {
        observer = canvas.tokens.controlled?.[0] || null;
      }
    } catch (_) {
      observer = null;
    }

    // Only show indicators if the current user is actively controlling this token
    if (observer && !canvas.tokens.controlled.includes(observer)) {
      return;
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
    } catch (_) { }

    // OPTIMIZED: Only handle visual indicators, no document updates or lighting changes
    for (const wall of walls) {
      const d = wall.document;
      if (!d) continue;

      let flagHidden = false;
      try {
        flagHidden = !!d.getFlag?.(MODULE_ID, 'hiddenWall');
      } catch (_) { }

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
            } catch (_) { }
          }
          wall._pvSeeThroughMasks = [];
        }
      } catch (_) { }

      const isExpandedObserved = expandedObserved.has(d.id);

      if (!flagHidden && !isExpandedObserved) {
        continue;
      }

      // Draw indicator for this client only if the wall is observed for the local observer
      try {
        const c = Array.isArray(d.c) ? d.c : [d.x, d.y, d.x2, d.y2];
        const [x1, y1, x2, y2] = c;
        if ([x1, y1, x2, y2].every((n) => typeof n === 'number')) {
          // Check if the controlled token has this wall flagged as 'observed'
          const tokenWallFlag = wallMapForObserver[d.id];
          const shouldShowIndicator = tokenWallFlag === 'observed';

          if (shouldShowIndicator) {
            // Create simple visual indicator without complex animations
            const isDoor = Number(d.door) > 0;
            const color = isDoor ? 0xffd166 : 0x9b59b6;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;

            let half = 10;
            try {
              const flagVal = Number(canvas?.scene?.getFlag?.(MODULE_ID, 'hiddenIndicatorHalf'));
              if (Number.isFinite(flagVal) && flagVal > 0) half = flagVal;
            } catch (_) { }

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

            g._pvWallId = d.id;
            g._wallDocumentId = d.id;
            g.zIndex = 1000;
            g.eventMode = 'none';
            g.alpha = 1.0;

            canvas.interface.addChild(g);
            wall._pvHiddenIndicator = g;
          }
        }
      } catch (error) {
        console.warn(`PF2E Visioner | Error creating wall indicator for wall ${d.id}:`, error);
      }
    }
  } catch (error) {
    console.warn(`PF2E Visioner | Error in updateWallIndicatorsOnly:`, error);
  }
}

// Shared state for keyboard targeting
let currentlyHoveredIndicator = null;

// Global keyboard handler for lifesense targeting
function lifesenseTargetKeyHandler(event) {
  if (!currentlyHoveredIndicator) return;

  // Check for T key using event.code for keyboard layout consistency
  const isTargetKey = event.code === 'KeyT';
  if (!isTargetKey) return;

  try {
    const tokenId = currentlyHoveredIndicator._pvTokenId;
    const targetToken = canvas.tokens.get(tokenId);
    if (targetToken) {
      const shiftKey = event.shiftKey ?? false;
      targetToken.setTarget(!targetToken.isTargeted, { releaseOthers: !shiftKey });
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  } catch (err) {
    console.warn('PF2E Visioner | Error keyboard targeting system-hidden token:', err);
  }
}

// Install global keyboard handler once
let keyHandlerInstalled = false;
function ensureKeyHandlerInstalled() {
  if (!keyHandlerInstalled) {
    window.addEventListener('keydown', lifesenseTargetKeyHandler, true);
    keyHandlerInstalled = true;
  }
}

export async function updateSystemHiddenTokenHighlights(observerId = null, positionOverride = null) {
  try {
    if (!game.settings?.get?.(MODULE_ID, 'autoVisibilityEnabled')) {
      return;
    }

    const tokens = canvas?.tokens?.placeables || [];
    if (!tokens.length) {
      return;
    }

    // Ensure keyboard handler is installed
    ensureKeyHandlerInstalled();

    let observer = null;
    try {
      if (observerId) {
        observer = canvas.tokens.get(observerId) || null;
      }
      if (!observer) {
        observer = canvas.tokens.controlled?.[0] || null;
      }
    } catch (_) {
      observer = null;
    }

    if (!observer) {
      for (const token of tokens) {
        try {
          if (token._pvSystemHiddenIndicator) {
            const gi = token._pvSystemHiddenIndicator;
            if (gi._pvTargetHookId !== undefined) {
              Hooks.off('targetToken', gi._pvTargetHookId);
            }
            if (gi._pvFactorsOverlayHook !== undefined) {
              Hooks.off('pf2e-visioner:visibilityFactorsOverlay', gi._pvFactorsOverlayHook);
            }
            if (gi._pvCanvasPanHook !== undefined) {
              Hooks.off('canvasPan', gi._pvCanvasPanHook);
            }
            if (gi._pvCanvasReadyHook !== undefined) {
              Hooks.off('canvasReady', gi._pvCanvasReadyHook);
            }
            if (gi._pvCanvasTearDownHook !== undefined) {
              Hooks.off('canvasTearDown', gi._pvCanvasTearDownHook);
            }
            if (currentlyHoveredIndicator === gi) {
              currentlyHoveredIndicator = null;
            }
            if (gi._pvFactorsBadgeEl) { gi._pvFactorsBadgeEl.remove(); }
            if (gi._pvFactorsTooltipEl) { gi._pvFactorsTooltipEl.remove(); }
            gi.parent?.removeChild(gi);
            gi.destroy?.({ children: false, texture: false, baseTexture: false });
            token._pvSystemHiddenIndicator = null;
          }
        } catch (_) { }
      }
      return;
    }

    const observerSenses = observer.actor?.system?.perception?.senses || [];

    const lifesenseSense = observerSenses.find?.(sense => sense.type === 'lifesense');

    const observerHasLifesense = !!lifesenseSense;
    const lifesenseIsPrecise = lifesenseSense?.acuity === 'precise';

    // Lifesense indicator should show when the observer has lifesense
    // The indicator will then be shown on targets that:
    // 1. Are within lifesense range
    // 2. Can be detected by lifesense (living/undead creatures)
    // 3. Are system-hidden (not visible to the client)
    // 
    // This allows lifesense to work through walls, in darkness, and with invisible creatures
    // without requiring specific conditions like blinded/deafened
    const isUsingLifesense = observerHasLifesense;

    if (!isUsingLifesense) {
      for (const token of tokens) {
        try {
          if (token._pvSystemHiddenIndicator) {
            const gi = token._pvSystemHiddenIndicator;
            if (gi._pvTargetHookId !== undefined) {
              Hooks.off('targetToken', gi._pvTargetHookId);
            }
            if (gi._pvFactorsOverlayHook !== undefined) {
              Hooks.off('pf2e-visioner:visibilityFactorsOverlay', gi._pvFactorsOverlayHook);
            }
            if (gi._pvCanvasPanHook !== undefined) {
              Hooks.off('canvasPan', gi._pvCanvasPanHook);
            }
            if (gi._pvCanvasReadyHook !== undefined) {
              Hooks.off('canvasReady', gi._pvCanvasReadyHook);
            }
            if (gi._pvCanvasTearDownHook !== undefined) {
              Hooks.off('canvasTearDown', gi._pvCanvasTearDownHook);
            }
            if (currentlyHoveredIndicator === gi) {
              currentlyHoveredIndicator = null;
            }
            if (gi._pvFactorsBadgeEl) { gi._pvFactorsBadgeEl.remove(); }
            if (gi._pvFactorsTooltipEl) { gi._pvFactorsTooltipEl.remove(); }
            gi.parent?.removeChild(gi);
            gi.destroy?.({ children: false, texture: false, baseTexture: false });
            token._pvSystemHiddenIndicator = null;
          }
        } catch (_) { }
      }
      return;
    }

    for (const token of tokens) {
      try {
        if (token._pvSystemHiddenIndicator) {
          const gi = token._pvSystemHiddenIndicator;
          if (gi._pvTargetHookId !== undefined) {
            Hooks.off('targetToken', gi._pvTargetHookId);
          }
          if (gi._pvFactorsOverlayHook !== undefined) {
            Hooks.off('pf2e-visioner:visibilityFactorsOverlay', gi._pvFactorsOverlayHook);
          }
          if (gi._pvCanvasPanHook !== undefined) {
            Hooks.off('canvasPan', gi._pvCanvasPanHook);
          }
          if (gi._pvCanvasReadyHook !== undefined) {
            Hooks.off('canvasReady', gi._pvCanvasReadyHook);
          }
          if (gi._pvCanvasTearDownHook !== undefined) {
            Hooks.off('canvasTearDown', gi._pvCanvasTearDownHook);
          }
          if (gi._pvFactorsBadgeEl) { gi._pvFactorsBadgeEl.remove(); }
          if (gi._pvFactorsTooltipEl) { gi._pvFactorsTooltipEl.remove(); }
          gi.parent?.removeChild(gi);
          gi.destroy?.({ children: false, texture: false, baseTexture: false });
          token._pvSystemHiddenIndicator = null;
        }
      } catch (_) { }
    }

    for (const token of tokens) {
      if (token.id === observer.id) continue;

      // Skip tokens without actors or with non-creature actors (hazards, loot, etc.)
      if (!token.actor) continue;
      const actorType = token.actor.type;
      if (actorType === 'hazard' || actorType === 'loot' || actorType === 'vehicle') continue;

      const isSystemHidden = !token.visible || token.renderable === false;

      const targetTraits = token.actor?.system?.traits?.value || [];
      const canBeDetectedByLifesense = visibilityCalculatorInternal.canLifesenseDetect({ traits: targetTraits });

      // Check if token is within lifesense range
      // Use document positions to ensure we have the latest coordinates
      // If positionOverride is provided, use it instead of querying the document
      const observerDocX = positionOverride?.x ?? observer.document.x;
      const observerDocY = positionOverride?.y ?? observer.document.y;

      const observerCenterX = observerDocX + (observer.document.width * canvas.grid.size) / 2;
      const observerCenterY = observerDocY + (observer.document.height * canvas.grid.size) / 2;
      const targetCenterX = token.document.x + (token.document.width * canvas.grid.size) / 2;
      const targetCenterY = token.document.y + (token.document.height * canvas.grid.size) / 2;

      const lifesenseRange = lifesenseSense?.range ?? 0;

      // Calculate distance in feet
      let distanceInFeet;
      if (observer.distanceTo && typeof observer.distanceTo === 'function') {
        distanceInFeet = observer.distanceTo(token);
      } else {
        const path = canvas.grid.measurePath([
          { x: observerCenterX, y: observerCenterY },
          { x: targetCenterX, y: targetCenterY }
        ]);
        const feetPerGrid = canvas.grid?.distance || 5;
        distanceInFeet = path.distance * feetPerGrid;
      }

      const isWithinLifesenseRange = lifesenseRange === Infinity || distanceInFeet <= lifesenseRange;
      const shouldShowIndicator = isSystemHidden && canBeDetectedByLifesense && isWithinLifesenseRange;

      // If indicator exists but shouldn't, remove it
      if (token._pvSystemHiddenIndicator && !shouldShowIndicator) {
        const gi = token._pvSystemHiddenIndicator;
        if (gi._pvTargetHookId !== undefined) {
          Hooks.off('targetToken', gi._pvTargetHookId);
        }
        if (gi._pvFactorsOverlayHook !== undefined) {
          Hooks.off('pf2e-visioner:visibilityFactorsOverlay', gi._pvFactorsOverlayHook);
        }
        if (gi._pvCanvasPanHook !== undefined) {
          Hooks.off('canvasPan', gi._pvCanvasPanHook);
        }
        if (gi._pvCanvasReadyHook !== undefined) {
          Hooks.off('canvasReady', gi._pvCanvasReadyHook);
        }
        if (gi._pvCanvasTearDownHook !== undefined) {
          Hooks.off('canvasTearDown', gi._pvCanvasTearDownHook);
        }
        if (gi._pvFactorsBadgeEl) { gi._pvFactorsBadgeEl.remove(); }
        if (gi._pvFactorsTooltipEl) { gi._pvFactorsTooltipEl.remove(); }
        gi.parent?.removeChild(gi);
        gi.destroy?.({ children: false, texture: false, baseTexture: false });
        token._pvSystemHiddenIndicator = null;
        continue;
      }

      // If indicator exists and should exist, skip recreation (just position updates are handled by token animation)
      if (token._pvSystemHiddenIndicator && shouldShowIndicator) {
        continue;
      }

      // Only create if should show and doesn't exist yet
      if (shouldShowIndicator) {
        try {
          const size = token.document.width * canvas.grid.size;
          const centerX = token.center?.x ?? (token.document.x + size / 2);
          const centerY = token.center?.y ?? (token.document.y + size / 2);

          const g = new PIXI.Graphics();
          g.position.set(centerX, centerY);
          g.zIndex = 900;
          g.eventMode = 'static';
          g.cursor = 'pointer';
          g.interactive = true;
          g.buttonMode = true;
          g.alpha = 0.8;
          g._pvTokenId = token.document.id;
          g._pvObserverId = observer.document.id;

          const updateIndicatorColor = () => {
            const targetToken = canvas.tokens.get(token.document.id);
            const isTargeted = targetToken?.isTargeted ?? false;

            let color = 0x00d4ff;
            if (isTargeted) {
              const disposition = token.document.disposition ?? CONST.TOKEN_DISPOSITIONS.NEUTRAL;

              switch (disposition) {
                case CONST.TOKEN_DISPOSITIONS.FRIENDLY:
                  color = 0x00ff00;
                  break;
                case CONST.TOKEN_DISPOSITIONS.HOSTILE:
                  color = 0xff0000;
                  break;
                case CONST.TOKEN_DISPOSITIONS.NEUTRAL:
                  color = 0xffa500;
                  break;
                default:
                  color = 0x00d4ff;
              }
            }

            const lineWidth = 3;
            const alpha = 0.6;

            g.clear();
            g.lineStyle(lineWidth, color, alpha);
            g.beginFill(color, alpha * 0.05);
            g.drawRect(-size / 2, -size / 2, size, size);
            g.endFill();

            return color;
          };

          updateIndicatorColor();

          const buildPairFactorsBadgeOutside = async () => {
            try {
              if (g._pvFactorsActive) return;
              const { Pf2eVisionerApi } = await import('../api.js');
              const factors = await Pf2eVisionerApi.getVisibilityFactors(observer.id, token.id);
              if (!factors) return;

              g._pvFactorsActive = true;
              const stateCfg = VISIBILITY_STATES[factors.state] || VISIBILITY_STATES.observed || { icon: 'fa-solid fa-eye', color: '#ffffff' };
              const canvasRect = canvas.app.view.getBoundingClientRect();
              const bgSize = 40;
              const tokenBounds = token.bounds;
              const tokenCenterX = token.x + (tokenBounds.width / 2);
              const tokenTopY = token.y - bgSize - 5;
              const globalPoint = canvas.tokens.toGlobal(new PIXI.Point(tokenCenterX, tokenTopY));
              const screenX = canvasRect.left + globalPoint.x;
              const screenY = canvasRect.top + globalPoint.y;

              const badgeEl = document.createElement('div');
              badgeEl.style.position = 'fixed';
              badgeEl.style.pointerEvents = 'auto';
              badgeEl.style.cursor = 'pointer';
              badgeEl.style.zIndex = '6000';
              badgeEl.style.left = '0';
              badgeEl.style.top = '0';
              badgeEl.style.willChange = 'transform';
              badgeEl.style.transform = `translate(${Math.round(screenX - bgSize / 2)}px, ${Math.round(screenY - bgSize / 2)}px)`;
              badgeEl.innerHTML = `<span class="pf2e-visioner-factor-badge" style="display: inline-flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.8); border-radius: 6px; width: ${bgSize}px; height: ${bgSize}px;">
    <i class="${stateCfg.icon}" style="font-size: 16px; color: ${stateCfg.color};"></i>
  </span>`;
              document.body.appendChild(badgeEl);

              const tooltipEl = document.createElement('div');
              tooltipEl.style.position = 'fixed';
              tooltipEl.style.pointerEvents = 'none';
              tooltipEl.style.zIndex = '2000';
              tooltipEl.style.display = 'none';
              tooltipEl.style.left = '0';
              tooltipEl.style.top = '0';
              tooltipEl.style.willChange = 'transform';

              const lines = [];
              try {
                if (factors.state) {
                  const stateLabelKey = (VISIBILITY_STATES[factors.state]?.label) || factors.state;
                  const localizedState = game.i18n?.localize?.(stateLabelKey) || stateLabelKey;
                  const stateHdr = game.i18n?.localize?.('PF2E_VISIONER.VISIBILITY_FACTORS.STATE_LABEL') || 'State';
                  lines.push(`${stateHdr}: ${localizedState}`);
                }
                if (factors.lighting) {
                  let lightingKey = factors.lighting;
                  if (lightingKey.startsWith?.('magicalDarkness') && lightingKey !== 'magicalDarkness' && lightingKey !== 'greaterMagicalDarkness') {
                    lightingKey = 'magicalDarkness';
                  }
                  const litHdr = game.i18n?.localize?.('PF2E_VISIONER.VISIBILITY_FACTORS.LIGHTING_LABEL') || 'Lighting';
                  const litText = game.i18n?.localize?.(`PF2E_VISIONER.VISIBILITY_FACTORS.LIGHTING.${lightingKey}`) || lightingKey;
                  lines.push(`${litHdr}: ${litText}`);
                }
                if (Array.isArray(factors.reasons) && factors.reasons.length) {
                  lines.push('');
                  factors.reasons.forEach((r) => {
                    if (typeof r === 'string') lines.push(`• ${r}`);
                  });
                }
              } catch (_) { }

              const linesHtml = lines.map(line => `<div style="margin: 2px 0;">${line}</div>`).join('');
              tooltipEl.innerHTML = `<div style="background: rgba(0,0,0,0.9); border-radius: 4px; padding: 8px; color: #ffffff; font-family: Arial; font-size: 12px; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
    ${linesHtml || (factors.state || '')}
  </div>`;
              document.body.appendChild(tooltipEl);

              const updateTooltipPos = () => {
                const left = screenX + bgSize / 2 + 5;
                const top = screenY - bgSize / 2;
                tooltipEl.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
              };

              badgeEl.addEventListener('mouseenter', () => {
                tooltipEl.style.display = 'block';
                updateTooltipPos();
              });
              badgeEl.addEventListener('mouseleave', () => {
                tooltipEl.style.display = 'none';
              });

              g._pvFactorsBadgeEl = badgeEl;
              g._pvFactorsTooltipEl = tooltipEl;
            } catch (_) { }
          };

          // Track hovered indicator for keyboard targeting
          g.on('pointerenter', () => {
            currentlyHoveredIndicator = g;
          });

          g.on('pointerleave', () => {
            if (currentlyHoveredIndicator === g) {
              currentlyHoveredIndicator = null;
            }
          });

          g.on('pointerover', async () => {
            g.alpha = 1.0;

            // Show distance text on hover
            if (!g._distanceText && observer) {
              try {
                let distanceInFeet;
                if (observer.distanceTo && typeof observer.distanceTo === 'function') {
                  distanceInFeet = observer.distanceTo(token);
                } else {
                  const { calculateDistanceInFeet } = await import('../helpers/geometry-utils.js');
                  distanceInFeet = calculateDistanceInFeet(observer, token);
                }

                const distance = Math.round(distanceInFeet / 5) * 5;

                const distanceTextStyle = new PIXI.TextStyle({
                  fontFamily: 'Signika, sans-serif',
                  fontSize: Math.max(20, size / 4),
                  fill: 0xffffff,
                  stroke: 0x000000,
                  strokeThickness: 4,
                  dropShadow: true,
                  dropShadowColor: 0x000000,
                  dropShadowBlur: 4,
                  dropShadowAngle: Math.PI / 4,
                  dropShadowDistance: 2,
                  align: 'center',
                });

                const distanceText = new PIXI.Text(`${distance} ft`, distanceTextStyle);
                distanceText.anchor.set(0.5, 1);
                distanceText.position.set(0, -size * 0.55);
                distanceText.zIndex = 1000;
                g.addChild(distanceText);
                g._distanceText = distanceText;
              } catch (err) {
                console.warn('PF2E Visioner | Error showing distance for lifesense indicator:', err);
              }
            }

            // Show hover tooltips using observer-mode context so hidden targets display badges
            try {
              const tooltipsEnabled = game.settings?.get?.(MODULE_ID, 'enableHoverTooltips');
              if (tooltipsEnabled) {
                const hoverModule = await import('./HoverTooltips.js');
                const { HoverTooltips, showVisibilityIndicators } = hoverModule;
                if (!HoverTooltips.isShowingKeyTooltips && !HoverTooltips._isPanning) {
                  // Save previous tooltip context to restore on pointerout
                  g._pvPrevTooltipState = {
                    mode: HoverTooltips.tooltipMode,
                    hovered: HoverTooltips.currentHoveredToken,
                    keyboard: HoverTooltips._keyboardContext,
                  };

                  // Emulate keyboard context to bypass owner/hover constraints and use observer perspective
                  HoverTooltips.tooltipMode = 'observer';
                  HoverTooltips._keyboardContext = true;
                  HoverTooltips.currentHoveredToken = observer; // the lifesense owner

                  if (typeof showVisibilityIndicators === 'function') {
                    showVisibilityIndicators(observer);
                  }
                }
              }
            } catch (err) {
              console.warn('PF2E Visioner | Error showing hover tooltips for lifesense indicator:', err);
            }

            try {
              const hoverModule = await import('./HoverTooltips.js');
              const { HoverTooltips } = hoverModule;
              if (HoverTooltips.isShowingFactorsOverlay) {
                await buildPairFactorsBadgeOutside();
              }
            } catch (_) { }
          });

          g.on('pointerout', async () => {
            g.alpha = 0.8;

            // Remove distance text
            if (g._distanceText) {
              g.removeChild(g._distanceText);
              g._distanceText.destroy();
              g._distanceText = null;
            }

            // Hide hover tooltips and restore previous tooltip context
            try {
              const hoverModule = await import('./HoverTooltips.js');
              const { HoverTooltips, hideAllVisibilityIndicators, hideAllCoverIndicators } = hoverModule;

              if (typeof hideAllVisibilityIndicators === 'function') hideAllVisibilityIndicators();
              if (typeof hideAllCoverIndicators === 'function') hideAllCoverIndicators();

              if (g._pvPrevTooltipState) {
                HoverTooltips.tooltipMode = g._pvPrevTooltipState.mode;
                HoverTooltips._keyboardContext = g._pvPrevTooltipState.keyboard;
                HoverTooltips.currentHoveredToken = g._pvPrevTooltipState.hovered || null;
                delete g._pvPrevTooltipState;
              } else {
                // Fallback: clear any hover reference set by this indicator
                if (HoverTooltips.currentHoveredToken === observer) {
                  HoverTooltips.currentHoveredToken = null;
                }
              }
            } catch (err) {
              console.warn('PF2E Visioner | Error hiding hover tooltips for lifesense indicator:', err);
            }

            try {
              const mod = await import('./HoverTooltips.js');
              const overlayActive = !!mod.HoverTooltips?.isShowingFactorsOverlay;
              if (!overlayActive) {
                if (g._pvFactorsBadgeEl) { g._pvFactorsBadgeEl.remove(); g._pvFactorsBadgeEl = null; }
                if (g._pvFactorsTooltipEl) { g._pvFactorsTooltipEl.remove(); g._pvFactorsTooltipEl = null; }
                delete g._pvFactorsActive;
              }
            } catch (_) { }
          });

          const hookId = Hooks.on('targetToken', (user, targetToken, targeted) => {
            if (targetToken.id === token.document.id) {
              updateIndicatorColor();
            }
          });

          g._pvTargetHookId = hookId;

          const displayName = token.document.displayName ?? 0;
          const shouldShowName = displayName >= 30;

          if (shouldShowName) {
            const tokenName = token.document.name || 'Unknown';
            const textStyle = new PIXI.TextStyle({
              fontFamily: 'Signika, sans-serif',
              fontSize: Math.max(20, size / 4),
              fill: 0xffffff,
              stroke: 0x000000,
              strokeThickness: 4,
              dropShadow: true,
              dropShadowColor: 0x000000,
              dropShadowBlur: 4,
              dropShadowAngle: Math.PI / 4,
              dropShadowDistance: 2,
              align: 'center',
              wordWrap: true,
              wordWrapWidth: size * 1.5,
            });

            const nameText = new PIXI.Text(tokenName, textStyle);
            nameText.anchor.set(0.5, 0.5);
            nameText.position.set(0, size * 0.6);
            nameText.alpha = 0.9;
            g.addChild(nameText);
          }

          const effectContainer = new PIXI.Container();
          effectContainer._pvTokenId = token.document.id;
          g.addChild(effectContainer);

          const pulse = new PIXI.Graphics();
          pulse._pvTokenId = token.document.id;
          effectContainer.addChild(pulse);

          let startTime = Date.now();
          const animate = () => {
            try {
              if (!g.parent || !canvas?.ready) {
                return;
              }

              const elapsed = (Date.now() - startTime) / 1000;

              const targetToken = canvas.tokens.get(token.document.id);
              const isTargeted = targetToken?.isTargeted ?? false;

              let animColor = 0x00d4ff;
              if (isTargeted) {
                const disposition = token.document.disposition ?? CONST.TOKEN_DISPOSITIONS.NEUTRAL;

                switch (disposition) {
                  case CONST.TOKEN_DISPOSITIONS.FRIENDLY:
                    animColor = 0x00ff00;
                    break;
                  case CONST.TOKEN_DISPOSITIONS.HOSTILE:
                    animColor = 0xff0000;
                    break;
                  case CONST.TOKEN_DISPOSITIONS.NEUTRAL:
                    animColor = 0xffa500;
                    break;
                  default:
                    animColor = 0x00d4ff;
                }
              }

              pulse.clear();
              const breathe = 1.0 + 0.08 * Math.sin(elapsed * 2.0);
              const pulseAlpha = 0.3 + 0.15 * Math.sin(elapsed * 1.5);

              pulse.lineStyle(2, animColor, pulseAlpha);
              const expansion = 4 * breathe;
              pulse.drawRect(
                -size / 2 - expansion,
                -size / 2 - expansion,
                size + expansion * 2,
                size + expansion * 2
              );

              requestAnimationFrame(animate);
            } catch (error) {
              console.error(`[PF2E-Visioner] System-hidden token animation error:`, error);
            }
          }; requestAnimationFrame(animate);

          // Prefer interface layer so DOM hover tooltips render above this PIXI overlay
          // We create these for all users (not just GM) to show lifesense detection
          const parent = canvas.interface || canvas.controls || canvas.tokens;
          parent.addChild(g);
          token._pvSystemHiddenIndicator = g;

          if (!g._pvFactorsOverlayHook) {
            g._pvFactorsOverlayHook = Hooks.on('pf2e-visioner:visibilityFactorsOverlay', async ({ active } = {}) => {
              try {
                if (active) {
                  await buildPairFactorsBadgeOutside();
                } else if (g._pvFactorsActive) {
                  g._pvFactorsActive = false;
                  if (g._pvFactorsBadgeEl) { g._pvFactorsBadgeEl.remove(); g._pvFactorsBadgeEl = null; }
                  if (g._pvFactorsTooltipEl) { g._pvFactorsTooltipEl.remove(); g._pvFactorsTooltipEl = null; }
                }
              } catch (_) { }
            });
          }

          if (!g._pvCanvasPanHook) {
            g._pvCanvasPanHook = Hooks.on('canvasPan', async () => {
              try {
                if (g._pvFactorsActive) {
                  g._pvFactorsActive = false;
                  if (g._pvFactorsBadgeEl) { g._pvFactorsBadgeEl.remove(); g._pvFactorsBadgeEl = null; }
                  if (g._pvFactorsTooltipEl) { g._pvFactorsTooltipEl.remove(); g._pvFactorsTooltipEl = null; }
                }
                const mod = await import('./HoverTooltips.js');
                mod.hideAllVisibilityIndicators?.();
                mod.hideAllCoverIndicators?.();
              } catch (_) { }
            });
          }

          if (!g._pvCanvasReadyHook) {
            g._pvCanvasReadyHook = Hooks.on('canvasReady', async () => {
              try {
                if (g._pvFactorsActive) {
                  g._pvFactorsActive = false;
                  if (g._pvFactorsBadgeEl) { g._pvFactorsBadgeEl.remove(); g._pvFactorsBadgeEl = null; }
                  if (g._pvFactorsTooltipEl) { g._pvFactorsTooltipEl.remove(); g._pvFactorsTooltipEl = null; }
                }
                const mod = await import('./HoverTooltips.js');
                mod.hideAllVisibilityIndicators?.();
                mod.hideAllCoverIndicators?.();
              } catch (_) { }
            });
          }

          if (!g._pvCanvasTearDownHook) {
            g._pvCanvasTearDownHook = Hooks.on('canvasTearDown', () => {
              try {
                if (g._pvFactorsBadgeEl) { g._pvFactorsBadgeEl.remove(); g._pvFactorsBadgeEl = null; }
                if (g._pvFactorsTooltipEl) { g._pvFactorsTooltipEl.remove(); g._pvFactorsTooltipEl = null; }
                delete g._pvFactorsActive;
              } catch (_) { }
            });
          }

          try {
            const hoverModule = await import('./HoverTooltips.js');
            if (hoverModule.HoverTooltips?.isShowingFactorsOverlay) {
              await buildPairFactorsBadgeOutside();
            }
          } catch (_) { }
        } catch (error) {
          console.warn(`PF2E Visioner | Error creating system-hidden indicator for token ${token.document.id}:`, error);
        }
      }
    }
  } catch (error) {
    console.warn(`PF2E Visioner | Error in updateSystemHiddenTokenHighlights:`, error);
  }
}
