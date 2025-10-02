/**
 * AVS Concealment Region Behavior
 * 
 * Provides concealment when rays pass through region boundaries.
 * This is passive - no events trigger updates, only ray casting queries.
 * 
 * IMPORTANT: This affects target.concealment in StatelessVisibilityCalculator,
 * NOT the visibility state itself.
 */

import { MODULE_ID } from '../constants.js';
import { segmentsIntersect } from '../helpers/geometry-utils.js';
import RegionHelper from '../utils/region.js';

const RegionBehaviorBase =
    typeof foundry !== 'undefined' &&
        foundry.data &&
        foundry.data.regionBehaviors &&
        foundry.data.regionBehaviors.RegionBehaviorType
        ? foundry.data.regionBehaviors.RegionBehaviorType
        : class { };

export class ConcealmentRegionBehavior extends RegionBehaviorBase {
    static LOCALIZATION_PREFIXES = ['PF2E_VISIONER.REGION_BEHAVIOR'];

    static get label() {
        return 'PF2e Visioner AVS Concealment';
    }

    static defineSchema() {
        const fields = foundry.data.fields;

        return {
            events: this._createEventsField({
                events: [],
            }),

            enabled: new fields.BooleanField({
                required: false,
                initial: true,
                label: 'PF2E_VISIONER.REGION_BEHAVIOR.CONCEALMENT_ENABLED.label',
                hint: 'PF2E_VISIONER.REGION_BEHAVIOR.CONCEALMENT_ENABLED.hint',
            }),
        };
    }

    async _handleRegionEvent(event) {
    }

    static checkRayCrossesRegionBoundary(region, originPoint, targetPoint) {
        if (!region || !originPoint || !targetPoint) {
            console.log(`[ConcealmentRegion] Missing parameters`, { hasRegion: !!region, hasOrigin: !!originPoint, hasTarget: !!targetPoint });
            return false;
        }

        // Find the concealment behavior in the EmbeddedCollection
        let behavior = null;
        // Try region.behaviors first (direct access), then fall back to region.document.behaviors
        const behaviorsCollection = region.behaviors || region?.document?.behaviors;
        if (behaviorsCollection) {
            for (const b of behaviorsCollection) {
                if (b.type === `${MODULE_ID}.Pf2eVisionerConcealment`) {
                    behavior = b;
                    break;
                }
            }
        }

        console.log(`[ConcealmentRegion] Region ${region.id} behavior:`, behavior);

        if (!behavior) {
            console.log(`[ConcealmentRegion] Region ${region.id} has no concealment behavior`);
            return false;
        }

        // Check if behavior is enabled (check both enabled and disabled flags)
        const isEnabled = behavior.enabled !== false && behavior.disabled !== true;
        if (!isEnabled) {
            console.log(`[ConcealmentRegion] Region ${region.id} behavior is disabled`);
            return false;
        }

        const raySegment = {
            p1: { x: originPoint.x, y: originPoint.y },
            p2: { x: targetPoint.x, y: targetPoint.y }
        };

        const boundarySegments = ConcealmentRegionBehavior._extractRegionBoundarySegments(region);
        console.log(`[ConcealmentRegion] Region ${region.id} has ${boundarySegments.length} boundary segments`);

        for (const segment of boundarySegments) {
            if (segmentsIntersect(raySegment.p1, raySegment.p2, segment.p1, segment.p2)) {
                console.log(`[ConcealmentRegion] Ray intersects boundary segment`, { segment, ray: raySegment });
                return true;
            }
        }

        console.log(`[ConcealmentRegion] Ray does not cross region ${region.id}`);
        return false;
    }

    static _extractRegionBoundarySegments(region) {
        const segments = [];

        try {
            const pts = region.points ?? region.geometry?.points ?? region.boundary ?? region?.document?.shape?.points ?? null;

            if (!Array.isArray(pts) || pts.length < 3) {
                const bounds = RegionHelper.getBounds(region);
                if (bounds) {
                    const { x, y, width, height } = bounds;
                    const corners = [
                        { x, y },
                        { x: x + width, y },
                        { x: x + width, y: y + height },
                        { x, y: y + height }
                    ];
                    for (let i = 0; i < corners.length; i++) {
                        const p1 = corners[i];
                        const p2 = corners[(i + 1) % corners.length];
                        segments.push({ p1, p2 });
                    }
                }
                return segments;
            }

            const normalizedPts = pts.map(p => {
                if (Array.isArray(p)) return { x: p[0], y: p[1] };
                return { x: p.x ?? p[0], y: p.y ?? p[1] };
            });

            for (let i = 0; i < normalizedPts.length; i++) {
                const p1 = normalizedPts[i];
                const p2 = normalizedPts[(i + 1) % normalizedPts.length];
                segments.push({ p1, p2 });
            }
        } catch (err) {
            console.warn('PF2e Visioner | Failed to extract region boundary segments:', err);
        }

        return segments;
    }

    static getAllConcealmentRegions() {
        if (typeof canvas === 'undefined' || !canvas.scene?.regions) {
            console.log(`[ConcealmentRegion] Canvas or regions not available`);
            return [];
        }

        console.log(`[ConcealmentRegion] Checking ${canvas.scene.regions.size} regions`);
        const regions = [];
        for (const region of canvas.scene.regions) {
            console.log(`[ConcealmentRegion] Region ${region.id} structure:`, {
                hasDocument: !!region.document,
                document: region.document,
                behaviors: region?.document?.behaviors,
                behaviorsArray: Array.from(region?.document?.behaviors || []),
                directBehaviors: region.behaviors
            });

            // EmbeddedCollection needs to be converted to array or iterated
            let hasConcealmentBehavior = false;
            // Try region.behaviors first (direct access), then fall back to region.document.behaviors
            const behaviorsCollection = region.behaviors || region?.document?.behaviors;
            if (behaviorsCollection) {
                for (const behavior of behaviorsCollection) {
                    console.log(`[ConcealmentRegion] Checking behavior:`, { type: behavior.type, enabled: behavior.enabled, disabled: behavior.disabled });

                    // Check if this is our concealment behavior and it's enabled
                    if (behavior.type === `${MODULE_ID}.Pf2eVisionerConcealment`) {
                        // In Foundry v13, check both 'enabled' and absence of 'disabled'
                        const isEnabled = behavior.enabled !== false && behavior.disabled !== true;
                        console.log(`[ConcealmentRegion] Found concealment behavior, isEnabled=${isEnabled}`);
                        hasConcealmentBehavior = isEnabled;
                        break;
                    }
                }
            }

            console.log(`[ConcealmentRegion] Region ${region.id}: hasConcealmentBehavior=${hasConcealmentBehavior}`);

            if (hasConcealmentBehavior) {
                regions.push(region);
            }
        }

        console.log(`[ConcealmentRegion] Found ${regions.length} concealment regions`);
        return regions;
    }

    static doesRayHaveConcealment(originPoint, targetPoint) {
        console.log(`[ConcealmentRegion] doesRayHaveConcealment called`, { originPoint, targetPoint });
        const regions = ConcealmentRegionBehavior.getAllConcealmentRegions();

        for (const region of regions) {
            // Check if ray crosses the region boundary
            const crosses = ConcealmentRegionBehavior.checkRayCrossesRegionBoundary(region, originPoint, targetPoint);
            console.log(`[ConcealmentRegion] Region ${region.id} crosses: ${crosses}`);
            if (crosses) {
                return true;
            }

            // Check if both tokens are inside the same region
            const originInside = region.testPoint(originPoint, originPoint.elevation || 0);
            const targetInside = region.testPoint(targetPoint, targetPoint.elevation || 0);
            console.log(`[ConcealmentRegion] Region ${region.id} contains both tokens: origin=${originInside}, target=${targetInside}`);

            if (originInside && targetInside) {
                console.log(`[ConcealmentRegion] Both tokens inside region ${region.id} - applying concealment`);
                return true;
            }
        }

        console.log(`[ConcealmentRegion] No concealment regions crossed or containing both tokens`);
        return false;
    }
}
