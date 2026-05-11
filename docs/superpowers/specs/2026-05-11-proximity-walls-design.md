# Proximity and Reverse Proximity Wall Support

## Purpose

PF2E Visioner should respect Foundry wall sight types for proximity and reverse proximity walls in both automatic visibility and wall-based auto-cover. These walls currently behave like ordinary blocking walls because Visioner treats every non-none, non-limited sight type as normal blocking sight.

## Scope

Support applies to Visioner's custom wall ray checks:

- Automatic visibility line-of-sight checks in `VisionAnalyzer`.
- Wall obstruction and sampled wall coverage checks in `CoverDetector`.

The feature does not change wall manager UI, manual wall cover overrides, hidden wall state, sound blocking, movement blocking, or Foundry document storage.

## Semantics

Wall sight behavior should follow Foundry's wall sense meaning from the ray source's side:

- `NONE`: does not block sight.
- `NORMAL`: blocks sight when existing door, direction, and elevation checks allow blocking.
- `LIMITED`: keeps Visioner's existing terrain-wall behavior, where two distinct limited wall intersections block the ray.
- `PROXIMITY`: allows sight when the ray source is within the wall's sight threshold; otherwise blocks.
- `DISTANCE`: reverse proximity; allows sight when the ray source is outside the wall's sight threshold; otherwise blocks.

The ray source is the observer sample point for visibility and the attacker or origin point for cover. Threshold distance is measured in scene units, using the scene grid distance and grid size to convert from pixels to feet when necessary.

## Design

Add a small shared helper for wall sense evaluation at `scripts/helpers/wall-sense-utils.js`. It should:

- Read wall sense constants from `CONST.WALL_SENSE_TYPES` with safe numeric fallbacks.
- Read a sight threshold from common Foundry wall document shapes, including nested threshold data and direct threshold fields.
- Measure source-to-wall distance using the nearest point on the wall segment, not just the wall midpoint.
- Return whether a specific wall sense blocks the ray source.

Update `VisionAnalyzer` so intersected walls use the helper before treating non-limited walls as hard blockers. Limited wall behavior remains separate so the two-limited-walls rule is preserved.

Update `CoverDetector` so natural wall blocking, center segment obstruction, manual `none` override checks, and sampled coverage use the same proximity-aware decision. Manual cover-granting overrides still apply to intersecting closed walls as they do today, because they are explicit GM choices rather than natural wall blocking.

## Tests

Use test-first implementation.

Visibility tests:

- A proximity sight wall does not block when the observer/source is inside the wall threshold.
- The same proximity wall blocks when the observer/source is outside the threshold.
- A reverse proximity wall blocks when the observer/source is inside the threshold.
- The same reverse proximity wall does not block when the observer/source is outside the threshold.

Cover tests:

- A proximity wall does not grant wall cover when the attacker/source is inside the threshold.
- A proximity wall grants normal wall cover when the attacker/source is outside the threshold.
- A reverse proximity wall grants wall cover when the attacker/source is inside the threshold.
- A reverse proximity wall does not grant wall cover when the attacker/source is outside the threshold.

Run targeted visibility and auto-cover suites first, then the broader related wall tests.
