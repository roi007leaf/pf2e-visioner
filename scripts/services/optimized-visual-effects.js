/**
 * Optimized Visual Effects Handler
 * ZERO-DELAY version that removes the observerId caching check that blocks updates when the same token is selected
 */

import { MODULE_ID } from '../constants.js';
import { getVisibilityBetween } from '../utils.js';

/**
 * Update token visuals - optimized version with no delays
 */
export async function updateTokenVisuals() {
  if (!canvas?.tokens) return;

  // No dice animation check - immediate processing
  for (const token of canvas.tokens.placeables) {
    try {
      if (token?.visible) token.refresh();
    } catch (_) {}
  }
}

/**
 * Optimized version - REMOVES the observer caching check that blocks updates
 * This is the key fix - the original function would exit early if the same token was selected
 */
export async function updateWallVisuals(observerId = null) {
  try {
    // Respect setting toggle
    if (!game.settings?.get?.(MODULE_ID, 'hiddenWallsEnabled')) {
      return;
    }

    // REMOVED: Quick exit check that was blocking updates when same token selected
    // Original code: if (observerId === lastObserverId) { return; }
    // This was preventing updates when the same token remained selected!

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

      // Draw indicator and handle sight management
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

            // Simplified animation for performance
            const effectContainer = new PIXI.Container();
            effectContainer._pvWallId = d.id;
            effectContainer._wallDocumentId = d.id;
            g.addChild(effectContainer);

            const shimmer = new PIXI.Graphics();
            shimmer._pvWallId = d.id;
            shimmer._wallDocumentId = d.id;
            effectContainer.addChild(shimmer);

            // Reduced sparkle count for performance
            const sparkles = [];
            for (let i = 0; i < 25; i++) {
              const sparkle = new PIXI.Graphics();
              sparkle.beginFill(0xffffff, 0.8);
              const size = 1.5 + Math.random() * 1.5;
              sparkle.drawCircle(0, 0, size);
              sparkle.endFill();

              sparkle._pvWallId = d.id;
              sparkle._wallDocumentId = d.id;

              effectContainer.addChild(sparkle);

              sparkle._moveSpeed = 0.2 + Math.random() * 0.3;
              sparkle._curveX = Math.random() * Math.PI * 2;
              sparkle._curveY = Math.random() * Math.PI * 2;
              sparkle._floatRange = 8 + Math.random() * 12;

              sparkles.push(sparkle);
            }

            g.zIndex = 1000;
            g.eventMode = 'none';
            g.alpha = 1.0;

            wall._pvAnimationActive = true;

            // Optimized animation with requestAnimationFrame
            const startTime = Date.now();
            const animate = () => {
              try {
                if (!g.parent || !wall._pvAnimationActive) {
                  return;
                }

                const elapsed = (Date.now() - startTime) / 1000;

                // Main rectangle - solid opacity
                g.alpha = 1.0;

                // Breathing glow effect
                shimmer.clear();
                const breathe = 1.0 + 0.12 * Math.sin(elapsed * 1.2);
                const glowAlpha = 0.35 + 0.2 * Math.sin(elapsed * 0.8);

                const darkerColor = color === 0xffd166 ? 0xcc9900 : 0x7a4d8a;

                shimmer.lineStyle(5, darkerColor, glowAlpha);
                const glowExpansion = 6 * breathe;
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

                // Sparkle animation
                sparkles.forEach((sparkle, i) => {
                  const sparkleTime = elapsed * sparkle._moveSpeed + i * 0.8;
                  const progress = (sparkleTime * 0.3) % 1;
                  const baseX = x1 + dx * progress;
                  const baseY = y1 + dy * progress;

                  const curveTimeX = sparkleTime + sparkle._curveX;
                  const curveTimeY = sparkleTime + sparkle._curveY;

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

                  const maxFloat = half * 0.7;
                  const constrainedFloatX = Math.max(-maxFloat, Math.min(maxFloat, floatX * 0.3));
                  const constrainedFloatY = Math.max(-maxFloat, Math.min(maxFloat, floatY * 0.3));

                  sparkle.x = baseX + nx * constrainedFloatX;
                  sparkle.y = baseY + ny * constrainedFloatY;

                  sparkle.alpha = 0.3 + 0.5 * Math.sin(sparkleTime * 4 + i * 0.7);
                  const sizeVariation = 0.7 + 0.4 * Math.sin(sparkleTime * 3.2 + i * 1.1);
                  sparkle.scale.set(sizeVariation);
                });

                requestAnimationFrame(animate);
              } catch (error) {
                console.error(`[PF2E-Visioner] Animation error:`, error);
              }
            };

            requestAnimationFrame(animate);

            const parent = canvas.effects?.foreground || canvas.effects || canvas.walls || wall;
            parent.addChild(g);
            wall._pvHiddenIndicator = g;
          }

          // See-through mask logic (simplified)
          if (seeThrough) {
            try {
              const mask = new PIXI.Graphics();
              const isDoor = Number(d.door) > 0;
              const maskColor = isDoor ? 0xffd166 : 0x9b59b6;
              mask.beginFill(maskColor, 1.0);

              mask._pvWallId = d.id;
              mask._wallDocumentId = d.id;

              const dx = x2 - x1;
              const dy = y2 - y1;
              const len = Math.hypot(dx, dy) || 1;
              const nx = -dy / len;
              const ny = dx / len;
              const half = 3;
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

          // GM sight management
          if (isGM) {
            try {
              const gmSeeThroughEnabled = false;
              if (!gmSeeThroughEnabled) {
                const origSight = d.getFlag?.(MODULE_ID, 'originalSight');
                if (origSight !== undefined && origSight !== null && d.sight !== origSight) {
                  updates.push({
                    _id: d.id,
                    sight: origSight,
                    [`flags.${MODULE_ID}.originalSight`]: null,
                  });
                }
              } else {
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
        }
      } catch (_) {}
    }

    // Apply updates immediately
    if (isGM && (updates.length > 0 || tokenWallFlagUpdates.length > 0)) {
      try {
        if (updates.length > 0)
          await canvas.scene?.updateEmbeddedDocuments?.('Wall', updates, { diff: false });
        if (tokenWallFlagUpdates.length > 0)
          await canvas.scene?.updateEmbeddedDocuments?.('Token', tokenWallFlagUpdates, {
            diff: false,
          });

        // Immediate perception refresh
        canvas.perception.update({
          refreshVision: true,
          refreshOcclusion: true,
        });

        // Force token refresh
        try {
          for (const t of canvas.tokens.placeables) t.refresh?.();
        } catch (_) {}
      } catch (e) {
        console.warn(`[${MODULE_ID}] Failed to update hidden door sight overrides`, e);
      }
    }

    // Update hidden token echoes
    try {
      await updateHiddenTokenEchoes(observer);
    } catch (_) {}
  } catch (_) {}
}

/**
 * Targeted updates for performance and correctness. Only applies effects to the provided pairs.
 */
export async function updateSpecificTokenPairs(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) return;

  for (const p of pairs) {
    const observer = canvas.tokens.get(p.observerId);
    const target = canvas.tokens.get(p.targetId);
    if (!observer || !target) continue;

    try {
      observer.refresh();
    } catch (_) {}
    try {
      target.refresh();
    } catch (_) {}
  }
}

/**
 * Clean up visual indicators for a deleted wall
 */
export async function cleanupDeletedWallVisuals(wallDocument) {
  try {
    if (!wallDocument?.id) return;

    const wallId = wallDocument.id;

    const layers = [
      canvas.effects?.foreground,
      canvas.effects,
      canvas.walls,
      canvas.interface,
      canvas.stage,
    ].filter(Boolean);

    function searchAndRemoveIndicators(container) {
      if (!container?.children) return;

      const toRemove = [];
      for (const child of container.children) {
        try {
          if (
            child._pvWallId === wallId ||
            child._wallDocumentId === wallId ||
            (child._associatedWallId && child._associatedWallId === wallId)
          ) {
            toRemove.push(child);
          }

          if (child.children && child.children.length > 0) {
            searchAndRemoveIndicators(child);
          }
        } catch (_) {}
      }

      for (const indicator of toRemove) {
        try {
          if (indicator.parent) {
            indicator.parent.removeChild(indicator);
          }
          indicator.destroy?.({ children: true, texture: true, baseTexture: true });
        } catch (_) {}
      }
    }

    for (const layer of layers) {
      searchAndRemoveIndicators(layer);
    }

    const walls = canvas?.walls?.placeables || [];
    for (const wall of walls) {
      try {
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

        if (wall._pvAnimationActive && (wall.id === wallId || wall.document?.id === wallId)) {
          wall._pvAnimationActive = false;
        }
      } catch (_) {}
    }

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
 * Hidden token echoes (simplified version)
 */
async function updateHiddenTokenEchoes(observer) {
  try {
    const enabled = false;
    if (!enabled || !observer) {
      for (const t of canvas.tokens.placeables) removeEcho(t);
      return;
    }

    // Simplified echo processing for performance
    const walls = canvas?.walls?.placeables || [];
    const wallMap = observer?.document?.getFlag?.(MODULE_ID, 'walls') || {};

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
        if (expandedObserved.has(d.id)) return false;
        const isDoor = Number(d.door) > 0;
        const doorState = Number(d.ds ?? d.doorState ?? 0);
        if (isDoor && doorState === 1) return false;
        const sight = Number(d.sight ?? 1);
        if (sight === 0) return false;
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
    const color = 0xffa500;
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
