# Peek Visualization Design

## Objective

Add a local-only peek preview that lets a user hold a customizable keybind and see a line-of-sight polygon from a legal peek point around the selected token. The polygon follows mouse direction, is limited by walls, doors, Levels/Core collision where available, and the selected token's vision limits.

## Non-Goals

- Do not write AVS visibility, detection, cover, or override state.
- Do not reveal, hide, target, hover, or otherwise mutate tokens.
- Do not change Seek, Sneak, cover, or pending-movement behavior.
- Do not let users scan from arbitrary map positions.

## User Flow

1. User assigns the new Foundry keybinding `holdPeekVisualization`.
2. User selects exactly one owned/controlled token.
3. User holds the keybind.
4. A translucent LOS polygon appears on the canvas interface layer.
5. Mouse movement changes peek direction.
6. The actual origin clamps to the selected token's footprint plus a small adjacent band.
7. Releasing the keybind removes the polygon.

The keybinding is customizable and defaults to unbound.

## Rules

- Preview requires exactly one controlled token.
- The peek origin is local-only and never updates token document or actor data.
- The origin clamps to selected-token bounds plus about half a grid square outward.
- Cursor direction chooses the nearest legal edge or corner in that clamp region.
- The selected token's vision rules apply, including range and supported Foundry/Levels wall behavior.
- Closed doors block; open doors pass.
- Secret or hidden doors follow their current wall sight state.
- GM and player clients can use the preview, but players are still limited to legal origins around their controlled token.
- Output is polygon-only: no token highlighting and no visibility state changes.

## Components

### `PeekVisualization`

New service parallel to `CoverVisualization`.

Responsibilities:

- Register keydown, keyup, pointer movement, token-control, and canvas cleanup hooks.
- Resolve the active controlled token.
- Resolve mouse world position.
- Ask the clamp helper for the legal peek origin.
- Ask the polygon builder for LOS geometry.
- Draw and clear one `PIXI.Graphics` overlay on `canvas.interface`.
- Coalesce redraws through animation-frame scheduling.

### Origin Clamp Helper

Pure helper that accepts token document geometry, grid size, and mouse world point.

Responsibilities:

- Build token footprint in world coordinates.
- Expand footprint by the configured adjacent band.
- Clamp mouse point into that expanded rectangle.
- Prefer edge/corner points in the cursor direction so peeking around corners feels natural.
- Preserve token elevation for LOS calls.

This helper should be independently unit-tested.

### Polygon Builder

Hybrid builder.

Primary path:

- Try Foundry/Core vision polygon generation from a temporary source or positioned token proxy at peek origin.
- Use the selected token as the source of vision config.
- Return a polygon if Foundry APIs are available and produce valid geometry.

Fallback path:

- Build a radial raycast polygon around peek origin.
- Use existing Visioner wall/door/Levels helpers where possible, especially pending-movement wall-blocking semantics for sight.
- Cap radius by selected token sight range or scene-safe fallback.
- Sort hit points by angle and return a polygon.

The fallback exists for API drift and tests. It should not replace Foundry's native polygon when native geometry works.

### Renderer

Draw:

- Translucent fill for peek LOS.
- Thin outline.
- Small origin marker at clamped peek point.

Renderer owns no game state and can be destroyed safely on any invalid state.

## Settings And Keybinding

Add keybinding:

- id: `holdPeekVisualization`
- name: "Hold Peek Visualization"
- default: unbound
- restricted: false

No new world setting is needed for the first version. Constants such as clamp band and color can live near the service unless later user-facing config is needed.

## Performance

- Do no heavy work directly in raw pointer events.
- Store latest mouse position and schedule one redraw per animation frame.
- Reuse one graphics object while active.
- Cache static wall candidates during one active key-hold where safe.
- Clear caches on canvas render, wall update/create/delete, token control change, and keyup.

## Error Handling

- If no controlled token, multiple controlled tokens, missing canvas, or missing mouse position: clear overlay.
- If Foundry polygon generation fails: fall back to raycast.
- If fallback also fails: clear overlay and log a debug warning only when debug logging is enabled.
- All cleanup paths must be idempotent.

## Tests

Unit tests:

- Origin clamp returns mouse point when inside legal band.
- Origin clamp snaps far cursor to nearest legal edge.
- Origin clamp handles corner directions.
- Origin clamp handles large token dimensions.
- Fallback raycast clips on closed wall.
- Fallback raycast passes open door.
- Fallback raycast blocks closed door.
- Service does not call AVS/store write helpers.
- Service clears overlay on keyup and invalid token state.

Live validation:

- Start Foundry and use `Ass Gm 2` if login is needed.
- Select one token near a corner.
- Hold configured peek keybind and move mouse around the corner.
- Confirm polygon follows clamped origin and walls clip the preview.
- Test closed vs open door.
- Confirm no visibility-map changes, token reveal changes, targeting changes, or hover regressions.
