/**
 * Terrain Stalker Service
 * Centralizes free Sneak checks and related logic for the Terrain Stalker feat.
 */

export class TerrainStalkerService {
    /**
     * Check Terrain Stalker free Sneak criteria.
     * Params include handler context to avoid tight coupling to SneakActionHandler.
     * @param {object} actionData
     * @param {Token} subject - Observer token
     * @param {object} ctx - { discoverSubjects(fn), sneakCore, sessionId, getSneakingToken(fn) }
     * @returns {Promise<{ applies: boolean, reason: string, positionTransition?: any }>}
     */
    static async checkFreeSneak(actionData, subject, ctx) {
        try {
            const { FeatsHandler } = await import('../feats-handler.js');
            const { default: EnvironmentHelper } = await import('../../../utils/environment.js');
            const acting = ctx?.getSneakingToken?.(actionData) || actionData?.actor;
            if (!acting) return { applies: false, reason: 'Sneaking token not found' };

            // Must have Terrain Stalker feat
            const selection = FeatsHandler.getTerrainStalkerSelection(acting);
            if (!selection) return { applies: false, reason: 'Terrain Stalker not selected' };
            // Environment must be active for selection (underbrush/rubble/snow combos handled inside)
            if (!FeatsHandler.isEnvironmentActive(acting, selection)) return { applies: false, reason: `Environment '${selection}' not active` };

            // Must be undetected by all non-allies
            let observers = await ctx.discoverSubjects({ ...actionData, ignoreAllies: true });
            try {
                const matchingRegions = EnvironmentHelper.getMatchingEnvironmentRegions(acting, selection);
                if (matchingRegions?.length) {
                    observers = observers.filter((o) => matchingRegions.some((r) => EnvironmentHelper.isTokenInsideRegion(o, r)));
                }
            } catch { /* scope best-effort */ }
            const allUndetected = await (async () => {
                try {
                    const { eventDrivenVisibilitySystem } = await import('../../../visibility/auto-visibility/EventDrivenVisibilitySystem.js');
                    for (const obs of observers) {
                        const vis = await eventDrivenVisibilitySystem.calculateVisibilityWithOverrides(obs, acting);
                        if (vis !== 'undetected') return false;
                    }
                    return true;
                } catch {
                    const { getVisibilityBetween } = await import('../../../utils.js');
                    return observers.every((o) => getVisibilityBetween(o, acting) === 'undetected');
                }
            })();
            if (!allUndetected) return { applies: false, reason: 'Not undetected by all non-allies' };

            // Movement distance must be <= 1 grid (e.g., 5 ft) and > 0
            const state = ctx?.sneakCore?.getSneakState?.(ctx?.sessionId);
            const transition = state?.transitions?.get(subject.document.id) || null;
            const token = acting?.center ? acting : acting?.token?.object || acting?.object || acting;
            const gridSize = canvas?.scene?.grid?.size || 100;
            const gridFeet = canvas?.scene?.grid?.distance || 5; // feet per grid square
            const pixelsToFeet = (px) => gridFeet * (px / gridSize);
            // Helpers to resolve start and end positions robustly
            const resolveStart = () => {
                // 1) Prefer stored start on actionData (center if available, else x/y)
                const stored = actionData?.storedStartPosition;
                if (stored) {
                    const cx = stored?.center?.x;
                    const cy = stored?.center?.y;
                    if (typeof cx === 'number' && typeof cy === 'number') return { x: cx, y: cy };
                    if (typeof stored.x === 'number' && typeof stored.y === 'number') return { x: stored.x, y: stored.y };
                }
                // 2) Check message flags (sneakStartPosition or rollTimePosition)
                try {
                    const message = actionData?.message || game?.messages?.get?.(actionData?.messageId);
                    const fromFlags = message?.flags?.['pf2e-visioner']?.sneakStartPosition || message?.flags?.['pf2e-visioner']?.rollTimePosition;
                    if (fromFlags) {
                        const cx = fromFlags?.center?.x;
                        const cy = fromFlags?.center?.y;
                        if (typeof cx === 'number' && typeof cy === 'number') {
                            actionData.storedStartPosition = fromFlags; // cache
                            return { x: cx, y: cy };
                        }
                        if (typeof fromFlags.x === 'number' && typeof fromFlags.y === 'number') {
                            actionData.storedStartPosition = fromFlags; // cache
                            return { x: fromFlags.x, y: fromFlags.y };
                        }
                    }
                } catch { /* ignore */ }
                // 3) Check SneakCore's stored actionData (same object passed at session start)
                try {
                    const st = ctx?.sneakCore?.getSneakState?.(ctx?.sessionId);
                    const stateStored = st?.actionData?.storedStartPosition;
                    if (stateStored) {
                        const cx = stateStored?.center?.x;
                        const cy = stateStored?.center?.y;
                        if (typeof cx === 'number' && typeof cy === 'number') return { x: cx, y: cy };
                        if (typeof stateStored.x === 'number' && typeof stateStored.y === 'number') return { x: stateStored.x, y: stateStored.y };
                    }
                } catch { /* ignore */ }
                return null;
            };
            const resolveEnd = () => {
                const c = token?.center;
                if (c && typeof c.x === 'number' && typeof c.y === 'number') return { x: c.x, y: c.y };
                const doc = token?.document || acting?.document;
                if (doc && typeof doc.x === 'number' && typeof doc.y === 'number') return { x: doc.x, y: doc.y };
                const objCenter = token?.object?.center || acting?.object?.center || acting?.token?.object?.center;
                if (objCenter && typeof objCenter.x === 'number' && typeof objCenter.y === 'number') return { x: objCenter.x, y: objCenter.y };
                return null;
            };
            const movedFeet = (() => {
                try {
                    const start = resolveStart();
                    const end = resolveEnd();
                    if (!start || !end) return Infinity; // cannot verify -> disallow free path
                    const dx = end.x - start.x;
                    const dy = end.y - start.y;
                    const distPx = Math.hypot(dx, dy);
                    const minFeet = pixelsToFeet(distPx);
                    return minFeet;
                } catch {
                    return Infinity;
                }
            })();
            if (movedFeet === Infinity) return { applies: false, reason: 'Missing start or end position for movement check' };
            if (movedFeet < 0.1) return { applies: false, reason: 'No movement detected (start and end are the same)' };
            if (!(movedFeet <= gridFeet + 1e-6)) return { applies: false, reason: `Moved more than 1 grid square (${movedFeet.toFixed(2)} ft > ${gridFeet} ft)` };

            // Path must not pass within 10 ft of any enemy (use all enemies, not region-scoped)
            const minFeetToEnemy = await (async () => {
                try {
                    const start = resolveStart();
                    const end = resolveEnd();
                    if (!start || !end) return -1; // signal missing positions
                    const segA = start, segB = end;
                    const enemies = await ctx.discoverSubjects({ ...actionData, ignoreAllies: true });
                    const minPx = enemies.reduce((min, obs) => {
                        const p = obs.center;
                        const d = _pointToSegmentDistance(p.x, p.y, segA.x, segA.y, segB.x, segB.y);
                        return Math.min(min, d);
                    }, Infinity);
                    const minFeet = pixelsToFeet(minPx);
                    return minFeet;
                } catch {
                    return -1;
                }
            })();
            if (minFeetToEnemy === -1) return { applies: false, reason: 'Missing start or end position for proximity check' };
            if (minFeetToEnemy < 10 - 1e-6) return { applies: false, reason: `Path within ${minFeetToEnemy.toFixed(2)} ft of a non-ally (< 10 ft)` };

            // If SneakCore doesn't have a transition yet, synthesize a minimal one so UI/qualification has data
            let synthesized = transition;
            if (!synthesized) {
                try {
                    const targetToken = token; // resolved sneaking token object above
                    const observer = subject;
                    const startPos = (() => {
                        const s = actionData?.storedStartPosition;
                        if (s && typeof s.x === 'number' && typeof s.y === 'number') {
                            return { x: s.x, y: s.y, elevation: s.elevation ?? (targetToken?.document?.elevation || 0) };
                        }
                        if (transition?.startPosition && typeof transition.startPosition.x === 'number' && typeof transition.startPosition.y === 'number') {
                            return { x: transition.startPosition.x, y: transition.startPosition.y, elevation: transition.startPosition.elevation ?? (targetToken?.document?.elevation || 0) };
                        }
                        const c = targetToken?.center || { x: targetToken?.document?.x, y: targetToken?.document?.y };
                        return { x: c.x, y: c.y, elevation: targetToken?.document?.elevation || 0 };
                    })();
                    const endPos = (() => {
                        const c = targetToken?.center || { x: targetToken?.document?.x, y: targetToken?.document?.y };
                        return { x: c.x, y: c.y, elevation: targetToken?.document?.elevation || 0 };
                    })();

                    // Compute AVS visibility at start and end using explicit positions when possible
                    let startVis = 'undetected';
                    let endVis = 'undetected';
                    try {
                        const { optimizedVisibilityCalculator } = await import('../../../visibility/auto-visibility/index.js');
                        const observerPos = {
                            x: observer?.center?.x ?? observer?.document?.x ?? 0,
                            y: observer?.center?.y ?? observer?.document?.y ?? 0,
                            elevation: observer?.document?.elevation || 0,
                        };
                        startVis = await optimizedVisibilityCalculator.calculateVisibilityWithPosition(
                            observer,
                            targetToken,
                            observerPos,
                            startPos,
                        );
                        endVis = await optimizedVisibilityCalculator.calculateVisibilityWithPosition(
                            observer,
                            targetToken,
                            observerPos,
                            endPos,
                        );
                    } catch {
                        try {
                            const { getVisibilityBetween } = await import('../../../utils.js');
                            const vis = getVisibilityBetween(observer, targetToken);
                            startVis = vis || 'undetected';
                            endVis = vis || 'undetected';
                        } catch { /* keep defaults */ }
                    }

                    synthesized = {
                        startPosition: {
                            x: startPos.x,
                            y: startPos.y,
                            elevation: startPos.elevation,
                            avsVisibility: startVis,
                            coverState: 'none',
                        },
                        endPosition: {
                            x: endPos.x,
                            y: endPos.y,
                            elevation: endPos.elevation,
                            avsVisibility: endVis,
                            coverState: 'none',
                        },
                    };
                } catch { /* leave synthesized as null if something goes wrong */ }
            }

            return { applies: true, positionTransition: synthesized, reason: 'All Terrain Stalker criteria met' };
        } catch (e) {
            return { applies: false, reason: `Error during free-sneak check: ${e?.message || 'unknown'}` };
        }

        // Helper: distance from point to segment (px)
        function _pointToSegmentDistance(px, py, x1, y1, x2, y2) {
            const vx = x2 - x1, vy = y2 - y1;
            const wx = px - x1, wy = py - y1;
            const c1 = vx * wx + vy * wy;
            if (c1 <= 0) return Math.hypot(px - x1, py - y1);
            const c2 = vx * vx + vy * vy;
            if (c2 <= c1) return Math.hypot(px - x2, py - y2);
            const b = c1 / c2;
            const bx = x1 + b * vx, by = y1 + b * vy;
            return Math.hypot(px - bx, py - by);
        }
    }
}

export default TerrainStalkerService;
