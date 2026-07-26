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

export class CoverRegionBehavior extends RegionBehaviorBase {
    static LOCALIZATION_PREFIXES = ['PF2E_VISIONER.REGION_BEHAVIOR'];

    static get label() {
        return 'PF2e Visioner Region Cover';
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
                label: 'PF2E_VISIONER.REGION_BEHAVIOR.COVER_ENABLED.label',
                hint: 'PF2E_VISIONER.REGION_BEHAVIOR.COVER_ENABLED.hint',
            }),

            coverLevel: new fields.StringField({
                required: true,
                initial: 'standard',
                choices: {
                    lesser: 'PF2E_VISIONER.COVER_STATES.lesser',
                    standard: 'PF2E_VISIONER.COVER_STATES.standard',
                    greater: 'PF2E_VISIONER.COVER_STATES.greater',
                },
                label: 'PF2E_VISIONER.REGION_BEHAVIOR.COVER_LEVEL.label',
                hint: 'PF2E_VISIONER.REGION_BEHAVIOR.COVER_LEVEL.hint',
            }),

            mode: new fields.StringField({
                required: true,
                initial: 'override',
                choices: {
                    override: 'PF2E_VISIONER.REGION_BEHAVIOR.COVER_MODE.override',
                    lineOfSight: 'PF2E_VISIONER.REGION_BEHAVIOR.COVER_MODE.lineOfSight',
                    oneWay: 'PF2E_VISIONER.REGION_BEHAVIOR.COVER_MODE.oneWay',
                },
                label: 'PF2E_VISIONER.REGION_BEHAVIOR.COVER_MODE.label',
                hint: 'PF2E_VISIONER.REGION_BEHAVIOR.COVER_MODE.hint',
            }),
        };
    }

    async _handleRegionEvent(event) {
    }

    static getCoverBetween(observerPoint, targetPoint) {
        const regions = CoverRegionBehavior.getAllCoverRegions();
        const coverOrder = ['none', 'lesser', 'standard', 'greater'];
        let highestCover = null;

        for (const { region, behavior } of regions) {
            const cover = CoverRegionBehavior._checkRegionCover(region, behavior, observerPoint, targetPoint);
            if (cover) {
                if (!highestCover || coverOrder.indexOf(cover) > coverOrder.indexOf(highestCover)) {
                    highestCover = cover;
                }
            }
        }

        return highestCover;
    }

    static _checkRegionCover(region, behavior, observerPoint, targetPoint) {
        if (!region || !behavior || !observerPoint || !targetPoint) {
            return null;
        }

        const sys = behavior.system || behavior;
        const mode = sys.mode || 'override';
        const coverLevel = sys.coverLevel || 'standard';

        const targetInside = RegionHelper.isPointInside(region, targetPoint);
        const observerInside = RegionHelper.isPointInside(region, observerPoint);

        switch (mode) {
            case 'override':
                if (targetInside) {
                    return coverLevel;
                }
                return null;

            case 'lineOfSight':
                if (observerInside && targetInside) {
                    return coverLevel;
                }
                if (CoverRegionBehavior._checkRayCrossesRegionBoundary(region, observerPoint, targetPoint)) {
                    return coverLevel;
                }
                return null;

            case 'oneWay':
                if (targetInside && !observerInside) {
                    return coverLevel;
                }
                return null;

            default:
                return null;
        }
    }

    static _checkRayCrossesRegionBoundary(region, originPoint, targetPoint) {
        if (!region || !originPoint || !targetPoint) {
            return false;
        }

        const raySegment = {
            p1: { x: originPoint.x, y: originPoint.y },
            p2: { x: targetPoint.x, y: targetPoint.y }
        };

        const boundarySegments = CoverRegionBehavior._extractRegionBoundarySegments(region);

        for (const segment of boundarySegments) {
            if (segmentsIntersect(raySegment.p1, raySegment.p2, segment.p1, segment.p2)) {
                return true;
            }
        }

        return false;
    }

    static _extractRegionBoundarySegments(region) {
        const segments = [];

        try {
            const regionDocument = region?.document ?? region;

            // V14 exposes the exact composite geometry, including rotation,
            // separated shapes, concavity, and holes, as canonical polygons.
            if (CoverRegionBehavior._extractPolygonCollectionSegments(regionDocument?.polygons, segments)) {
                return segments;
            }

            // V13 uses an iterable collection; V14 RegionData uses an array.
            const shapes = regionDocument?.shapes ?? region?.shapes;
            if (shapes && typeof shapes[Symbol.iterator] === 'function') {
                for (const shape of shapes) {
                    CoverRegionBehavior._extractShapeSegments(shape, segments);
                }
                if (segments.length > 0) return segments;
            }

            const pts = region.points ?? region.geometry?.points ?? region.boundary ?? region?.document?.shape?.points ?? null;

            if (!Array.isArray(pts) || pts.length < 3) {
                // Exact point testing proves bounds are only an optimization,
                // not the Region boundary. Never turn them into geometry.
                const hasExactPointTest =
                    typeof regionDocument?.testPoint === 'function' ||
                    typeof region?.testPoint === 'function';
                if (hasExactPointTest) return segments;

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
            console.warn('PF2e Visioner | Failed to extract region boundary segments for cover:', err);
        }

        return segments;
    }

    static _extractPolygonCollectionSegments(polygons, segments) {
        if (!polygons || typeof polygons[Symbol.iterator] !== 'function') {
            return false;
        }

        const initialLength = segments.length;
        for (const polygon of polygons) {
            CoverRegionBehavior._extractPolygonSegments(polygon, segments);
        }
        return segments.length > initialLength;
    }

    static _extractPolygonSegments(polygon, segments) {
        const rawPoints = polygon?.points ?? polygon?.path ?? polygon;
        if (!rawPoints || typeof rawPoints[Symbol.iterator] !== 'function') {
            return;
        }

        const values = Array.from(rawPoints);
        let points;
        if (values.length >= 6 && values.every((value) => Number.isFinite(Number(value)))) {
            points = [];
            for (let index = 0; index < values.length; index += 2) {
                points.push({ x: Number(values[index]), y: Number(values[index + 1]) });
            }
        } else {
            points = values.map((point) => ({
                x: Number(Array.isArray(point) ? point[0] : point?.x),
                y: Number(Array.isArray(point) ? point[1] : point?.y),
            }));
        }

        points = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
        if (
            points.length > 1 &&
            points[0].x === points[points.length - 1].x &&
            points[0].y === points[points.length - 1].y
        ) {
            points.pop();
        }
        if (points.length < 3) return;

        for (let index = 0; index < points.length; index++) {
            segments.push({
                p1: points[index],
                p2: points[(index + 1) % points.length],
            });
        }
    }

    static _extractShapeSegments(shape, segments) {
        try {
            if (CoverRegionBehavior._extractPolygonCollectionSegments(shape?.polygons, segments)) {
                return;
            }

            const type = shape.type;
            if (type === 'rectangle') {
                const { x, y, width, height } = shape;
                const corners = [
                    { x, y },
                    { x: x + width, y },
                    { x: x + width, y: y + height },
                    { x, y: y + height }
                ];
                for (let i = 0; i < corners.length; i++) {
                    segments.push({ p1: corners[i], p2: corners[(i + 1) % corners.length] });
                }
            } else if (type === 'polygon') {
                const pts = shape.points;
                if (Array.isArray(pts) && pts.length >= 4) {
                    const pointPairs = [];
                    for (let i = 0; i < pts.length; i += 2) {
                        pointPairs.push({ x: pts[i], y: pts[i + 1] });
                    }
                    for (let i = 0; i < pointPairs.length; i++) {
                        segments.push({ p1: pointPairs[i], p2: pointPairs[(i + 1) % pointPairs.length] });
                    }
                }
            } else if (type === 'ellipse' || type === 'circle') {
                const cx = shape.x ?? 0;
                const cy = shape.y ?? 0;
                const rx = (shape.radiusX ?? shape.radius ?? shape.width / 2) || 50;
                const ry = (shape.radiusY ?? shape.radius ?? shape.height / 2) || rx;
                const numSegments = 16;
                const points = [];
                for (let i = 0; i < numSegments; i++) {
                    const angle = (2 * Math.PI * i) / numSegments;
                    points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
                }
                for (let i = 0; i < points.length; i++) {
                    segments.push({ p1: points[i], p2: points[(i + 1) % points.length] });
                }
            }
        } catch (err) {
            console.warn('PF2e Visioner | Failed to extract shape segments for cover:', err);
        }
    }

    static getAllCoverRegions() {
        if (typeof canvas === 'undefined' || !canvas.scene?.regions) {
            return [];
        }

        const results = [];
        for (const region of canvas.scene.regions) {
            const behaviorsCollection = region.behaviors || region?.document?.behaviors;
            if (!behaviorsCollection) continue;

            for (const behavior of behaviorsCollection) {
                if (behavior.type === `${MODULE_ID}.Pf2eVisionerCover`) {
                    const sys = behavior.system || behavior;
                    const isEnabled = (sys.enabled !== false) && (behavior.disabled !== true);
                    if (isEnabled) {
                        results.push({ region, behavior });
                    }
                    break;
                }
            }
        }

        return results;
    }
}
