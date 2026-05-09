# Paired Gap Edge Walls Design

Date: 2026-05-09
Status: Approved for planning

## Goal

Allow a GM to model canyon, chasm, balcony, or bridge gaps that have sight-blocking wall edges on both sides without preventing tokens on opposite ledges from seeing each other. The feature should preserve the current wall behavior for ordinary wall use and should only affect explicitly configured paired gap-edge walls.

## Problem

The current workaround uses ethereal or similar sight-blocking walls along both edges of a gap so tokens are visually treated as being inside or behind a canyon boundary. When an observer is on one ledge and a target is on the far ledge, the line of sight crosses both edge walls. Visioner treats the second wall as a normal sight blocker, so the far-side token or area becomes hidden even though the GM wants ledge-to-ledge sight to remain possible.

Changing wall sight globally is not safe because Foundry wall sight is scene-global, not observer-specific. If Visioner opens a wall for one token, it risks leaking vision for other users or other tokens. The first version must therefore stay inside Visioner's own LOS and AVS calculations.

## Chosen Approach

Add explicit paired gap-edge metadata to walls. A ray can ignore paired edge walls only when it intersects at least two enabled gap-edge walls with the same gap id.

Each wall can store:

- `flags.pf2e-visioner.gapEdgeEnabled`: boolean
- `flags.pf2e-visioner.gapEdgeId`: string

The shared `gapEdgeId` identifies the paired or grouped edges of a single gap, such as `roof-fall-canyon`.

## Line-Of-Sight Rule

For each Visioner LOS ray:

1. Collect intersections with candidate sight-blocking walls.
2. Identify intersections where the wall has `gapEdgeEnabled === true` and a non-empty `gapEdgeId`.
3. If the ray intersects two or more gap-edge walls with the same `gapEdgeId`, mark those matching wall hits as bypassed for that ray.
4. Continue normal LOS evaluation for every other wall hit.

Expected behavior:

- One hit on a gap-edge wall still blocks normally.
- Two hits on gap-edge walls with different ids still block normally.
- Two or more hits on same-id gap-edge walls are ignored for that ray.
- A normal wall behind, between, or beyond the paired edge walls still blocks normally.
- Directional walls, doors, wall height checks, and limited-wall behavior stay unchanged unless the specific wall hit is bypassed by the pair rule.

## Architecture

Create `scripts/services/gap-edge-walls.js` as a focused helper module. It should own:

- reading and normalizing gap-edge wall flags
- checking whether a wall is an enabled gap edge
- grouping ray intersections by `gapEdgeId`
- returning wall ids that should be ignored for a specific ray
- exposing flag paths that affect LOS cache invalidation

Integrate it into:

- `scripts/visibility/auto-visibility/VisionAnalyzer.js`
  - Keep tagged walls in the candidate list.
  - In `#checkSingleRayLOSWithWalls(...)`, compute bypassable wall ids for the current ray before applying normal blocking decisions.
  - Skip only the matching gap-edge wall hit for that ray.
- `scripts/visibility/auto-visibility/core/WallEventHandler.js`
  - Treat changes to `flags.pf2e-visioner.gapEdgeEnabled` and `flags.pf2e-visioner.gapEdgeId` as line-of-sight-affecting changes so LOS and visibility caches clear immediately.
- `scripts/managers/wall-manager/WallQuick.js` and `templates/wall-quick.hbs`
  - Add a "Gap Edge" checkbox and "Gap ID" text field.
- `scripts/managers/wall-manager/WallManager.js` and `templates/wall-manager.hbs`
  - Add compact bulk editing support for gap-edge flags.

Do not mutate wall `sight` or Foundry wall data for runtime visibility bypass in version 1.

## UI Design

Wall Quick Settings:

- Add a `Gap Edge` checkbox below the existing cover and hidden-wall controls.
- Show `Gap ID` text input when enabled.
- Help text should explain that matching gap-edge ids let Visioner ignore both edges for ledge-to-ledge LOS.

Wall Manager:

- Add a compact "Gap" column with an enable checkbox and id field.
- Include gap id in search filtering if practical.
- Do not require hidden-wall mode to be enabled. Gap-edge behavior is separate from hidden-wall discovery.

Optional later polish:

- Show `GAP: <id>` in wall labels when the existing wall-label keybind is held.
- Add a bulk action for selected walls to set a shared gap id.

## Scope

In scope for version 1:

- Visioner AVS visibility calculations.
- Visioner LOS checks used by deferred Seek and override validation.
- Wall Manager and Wall Quick configuration.
- Cache invalidation for gap-edge flag changes.
- Unit tests for helper, LOS, UI templates, and wall event invalidation.

Out of scope for version 1:

- Foundry native canvas vision or fog-of-war wall masking.
- Scene-global wall `sight` mutation.
- Automatic gap detection from regions or wall geometry.
- Auto-cover behavior changes across gaps.
- Sound or movement behavior changes.

## Risks And Limits

Foundry player canvas vision may still be blocked by the original walls, because Foundry's native wall collision remains unchanged. This design makes Visioner's mechanical visibility state correct first. Full visual/FOW transparency requires a separate phase with higher risk, likely involving Foundry detection wrappers, wall masking, or controlled per-client wall behavior.

If a ray crosses more than two same-id gap-edge walls, all same-id gap-edge wall hits can be bypassed. This supports irregular multi-segment canyon edges, but tests should confirm a normal wall inside that sequence still blocks.

Because LOS caches currently key primarily by token positions, gap-edge flag changes must clear caches rather than trying to include all gap metadata in every cache key.

## Test Plan

Helper tests:

- enabled gap wall with blank id is not bypassable
- two same-id gap wall intersections return both ids
- one gap wall intersection returns no bypass
- different ids return no bypass
- normal walls are ignored by the helper

VisionAnalyzer tests:

- observer and target across two paired edge walls have LOS
- observer looking through only one paired edge wall is blocked
- observer looking across two unpaired edge walls is blocked
- paired edge walls plus an ordinary blocking wall is blocked
- paired edge walls still respect wall-height non-blocking results where applicable

WallEventHandler tests:

- updating either gap-edge flag clears LOS and global visibility caches
- unrelated wall flag changes do not add extra invalidation beyond current behavior

UI tests:

- Wall Quick renders and persists gap-edge checkbox and id
- Wall Manager renders and persists gap-edge fields

Manual Foundry test:

- Configure two canyon edge walls with same gap id.
- Place one token on each ledge.
- Confirm Visioner visibility is observed across the gap.
- Place a target inside the canyon or behind only one edge.
- Confirm visibility remains blocked according to current wall logic.
