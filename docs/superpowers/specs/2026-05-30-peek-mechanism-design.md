# Peek Mechanism Design

Inspired by perceptive's `PeekingScript.js`, but built as a real vision
mechanic that integrates with Visioner's Auto-Visibility System (AVS).

## Objective

Let a token "peek" around a wall corner or through a door so the controlling
player gains genuine line-of-sight into a limited cone, and so Visioner's AVS
recomputes that token's visibility (and cover) from the peek origin. Enemies in
the opened slit become correctly observed; the peeking token's document is never
moved.

This supersedes the earlier `2026-05-29-peek-visualization-design.md`, which was
a local preview overlay with no game effect. The origin-clamp helper and the
GM-mirror/socket ideas from that doc are reused here.

## Decisions (locked during brainstorming)

- Real vision mechanic (not preview-only, not visibility-state-only).
- Two entry points, one shared core: corner/keybind peek + door right-click peek.
- Roll gating: optional per-door Peek DC. Door with a DC requires a PF2e check to
  open; door without a DC and all corner peeks are free.
- A peek ends on: keybind release, peeking-token movement, or that door's
  open/close state change. No sticky/manual-toggle peek.
- Peeking drives AVS: while active, AVS recomputes the peeking token's visibility
  from the peek origin and writes states normally.
- Vision core = Foundry VisionSource override (no temp wall documents, no custom
  mask layer).

## Non-Goals

- No temporary wall documents created in the scene (perceptive's approach is
  explicitly rejected).
- No mutation of the peeking token's document or actor data (position, rotation,
  vision config) — all overrides are runtime/client-render only or live in a
  GM-side registry.
- No change to Seek, Sneak, cover actions, or pending-movement behavior beyond
  the AVS recompute that peeking triggers.
- No arbitrary free-position scanning: corner origins clamp to the token's
  footprint plus a small adjacent band; door origins clamp to the door gap.
- No sticky peeks; no peek persistence across scene reload.

## Architecture & Data Flow

A peek is one record: `{ tokenId, origin, direction, fov, ignoredWallIds, kind }`
where `kind` is `corner` or `door`. Rendering is per-client (only the peeker sees
through the wall); AVS writes are GM-authoritative
(`BatchOrchestrator` gates updates on `game.user.isGM`), so the origin must travel
to the GM via socket.

### Lifecycle

1. **Activate** (peeker's client)
   - Corner: hold keybind → origin-clamp helper snaps the origin to the nearest
     legal wall corner/edge in the mouse direction; cone faces the mouse.
   - Door: right-click a hovered door while the configured modifier is held →
     origin is the door gap pushed to the peeking side; cone faces through the
     door. If the door wall carries a Peek DC flag, roll a PF2e check first and
     only open the slit on success.

2. **Render slit** (peeker's client, local only)
   - `PeekVisionSourceController` replaces the controlled token's Foundry
     `VisionSource` with the peek origin as its position, the cone as its
     `angle`/`rotation`, and (door peeks) the door wall excluded from the sweep
     via the existing `wall-sight-policy`. Perception is re-initialized so
     Foundry's native sweep redraws true sight. The token document never moves.

3. **Drive AVS** (GM client, authoritative)
   - The peeker emits a `PeekStart` / `PeekUpdate` socket payload. The GM client
     registers a peek-origin override for that token and runs a targeted AVS
     recompute. `VisionAnalyzer` reads the overridden origin and wall-exclusion
     instead of `token.center`, applies the cone angular filter, and writes
     observed/hidden/cover states the normal way.

4. **End** — keybind release, `updateToken` movement of the peeking token, or
   `updateWall` state change of the peeked door. The peeker emits `PeekEnd`. Both
   clients tear down: restore the native VisionSource, drop the AVS override, and
   run one clean recompute. The GM override also auto-expires after ~1s of
   silence as a lost-packet safety net.

## Components

### `PeekManager` (per-client service)

Owns active-peek state for the local user.

- At most one corner peek per controlled token; door peeks keyed by door id.
- API: `startCornerPeek(token, mouseWorld)`, `startDoorPeek(token, doorDoc)`,
  `updatePeek(peek, mouseWorld)`, `endPeek(peek, reason)`.
- Registers/clears hooks: keydown/keyup for the peek keybind, pointermove
  (coalesced to one update per animation frame), `updateToken` (movement → end),
  `updateWall` (door state change → end the matching door peek), and canvas
  teardown.
- Delegates to the origin-clamp helper, the VisionSource controller (local
  render), and the socket emitter (notify GM).

### Origin-clamp helper (pure)

Ported from the prior visualization design; no Foundry dependencies so it is
fully unit-testable.

- Input: token footprint, grid size, mouse world point, candidate wall set.
- Output: `{ origin, direction, fov }`.
- Corner variant: clamp the mouse point into the token footprint expanded by a
  configured adjacent band (~half a grid square); snap the origin to the nearest
  legal corner/edge; `direction` points corner→mouse; `fov` is a tunable constant
  (default 90°).
- Door variant: origin is the door midpoint pushed to the peeking side;
  `direction` is perpendicular through the door.
- Preserves token elevation for downstream LOS calls.

### `PeekVisionSourceController` (peeker client, render only)

- On start: build/replace the token's `VisionSource` with `{x, y}` = origin,
  `angle`/`rotation` = cone, and `ignoredWallIds` (door peeks) excluded from the
  sweep through `wall-sight-policy`. Re-initialize perception.
- On end: restore the native VisionSource and re-initialize. Idempotent. Never
  writes the token document.

### AVS peek-origin override (GM client)

- A registry: `tokenId → { origin, direction, fov, ignoredWallIds, ts }`.
- The observer-origin resolution in `VisionAnalyzer` / `PositionManager`
  (see `VisionAnalyzer.hasLineOfSight`) consults this registry first: when an
  entry exists it uses the peek origin instead of `token.center`, applies the
  cone angular filter to target rays, and excludes `ignoredWallIds` from
  collision tests.
- Registering or clearing an entry triggers a targeted AVS recompute for that
  token. Stale entries (older than ~1s without refresh) auto-expire.

### Socket channels

Added to `scripts/services/socket.js`: `PeekStart`, `PeekUpdate`, `PeekEnd`.
Player → active GM. Update payload `{ sceneId, tokenId, origin, direction, fov,
ignoredWallIds, seq, timestamp }`. Throttled to ~10Hz; origin/points rounded to
integer world coordinates; payloads for other scenes or received by non-GM
clients are ignored. Send directly to active GM users if socketlib supports it,
else broadcast and let non-GM clients drop it.

### Door Peek DC

- Wall flag `flags.pf2e-visioner.peekDC` (optional number) on door walls.
- GM sets it via a small injection into the wall/door config sheet.
- When present, a door peek rolls a PF2e check against the DC; success opens the
  slit, failure (and critical failure) does not. Chat output uses i18n keys.

### Keybinding & settings

- Foundry keybinding for hold-to-peek (corner). Reuse/rename the existing
  `holdPeekVisualization` registration; default unbound, unrestricted.
- A modifier-key setting for door right-click peek.
- Constants (adjacent band, default FOV, GM-override expiry, socket Hz) live near
  the service unless later promoted to user-facing settings.

## Error Handling

- No or multiple controlled tokens, missing canvas, or missing mouse position:
  do not start; clear any active peek.
- VisionSource override failure: restore native source, abort the peek, log only
  when debug logging is enabled.
- Door peek invoked on a non-door wall, or no LOS from token to the door: no-op.
- Failed or critically-failed Peek DC roll: no slit, no AVS override; post the
  PF2e check result to chat (i18n).
- GM AVS recompute error: drop the override and run a clean full recompute.
- All teardown paths are idempotent. The GM override auto-expires (~1s) even if a
  `PeekEnd` packet is lost.
- The token document is never mutated; on any error a peek leaves zero residue.

## Tests

Per project rules: feature ships with tests, no code comments, user-facing text
via i18n keys (update `lang/*.json`), and no mixing of test and production code.

### Unit (pure / mockable)

- Origin clamp: mouse inside band returns the point; far mouse snaps to nearest
  corner; corner-direction cases; large token dimensions; door midpoint and
  perpendicular direction.
- Cone angular filter: target inside vs outside the FOV.
- `PeekManager`: ends on keyup; ends on peeking-token move; ends the matching
  door peek on door update; at most one peek per token; `endPeek` idempotent.
- AVS override registry: register/clear; stale expiry; peek origin used instead
  of `token.center`; door wall excluded from collision.
- Socket sender: throttles to ≤10Hz; rounds points; ignores other scenes and
  non-GM receivers.
- Door DC: success opens (override registered), failure blocks (no slit, no
  override).
- No path writes the token document.

### Live validation (Foundry)

- Corner: select one token near a corner, hold the keybind, confirm the slit
  follows the mouse, walls clip it, and it ends on release and on token move.
- Door with DC: right-click a closed door; success opens a crack through it,
  failure does not; opening/closing the door ends the peek.
- AVS: an enemy inside the cone becomes observed on the GM client with correct
  cover; ending the peek reverts states; confirm the peeking token never moved.
