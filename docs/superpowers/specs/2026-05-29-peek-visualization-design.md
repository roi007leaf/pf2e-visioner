# Peek Visualization Design

## Objective

Add a local-first peek preview that lets a user hold a customizable keybind and see a line-of-sight polygon from a legal peek point around the selected token. The polygon follows mouse direction, is limited by walls, doors, Levels/Core collision where available, and the selected token's vision limits. When a player peeks, active GM clients receive a throttled mirror of the exact player-side polygon.

## Non-Goals

- Do not write AVS visibility, detection, cover, or override state.
- Do not reveal, hide, target, hover, or otherwise mutate tokens.
- Do not change Seek, Sneak, cover, or pending-movement behavior.
- Do not let users scan from arbitrary map positions.
- Do not make GM clients recompute the player's peek LOS from GM visibility privileges.

## User Flow

1. User assigns the new Foundry keybinding `holdPeekVisualization`.
2. User selects exactly one owned/controlled token.
3. User holds the keybind.
4. A translucent LOS polygon appears on the canvas interface layer.
5. Mouse movement changes peek direction.
6. The actual origin clamps to the selected token's footprint plus a small adjacent band.
7. Releasing the keybind removes the polygon.
8. If the user is a player, active GM clients see a mirrored copy of the player's current polygon while the keybind is held.

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
- GM mirror output uses the player-computed polygon points. GM clients do not recompute the polygon.

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

### GM Mirror Overlay

GM-only overlay renderer that receives player peek payloads through the module socket service.

Responsibilities:

- Keep one mirrored overlay per peeking player.
- Draw the player-computed polygon points on `canvas.interface`.
- Tint fill, outline, and origin marker with the player's user color.
- Show a small player/token label near the origin marker.
- Clear a player's overlay when an explicit end payload arrives.
- Auto-expire a player's overlay after about 500 ms without updates.
- Ignore payloads for inactive scenes or invalid point data.

The mirror is observational only. It does not write visibility state, refresh perception, alter token rendering, or invoke AVS.

### Socket Mirror Payload

Add socket channels through `scripts/services/socket.js`:

- `PeekPreviewUpdate`
- `PeekPreviewEnd`

The player-side service sends updates to active GMs while the keybind is held. Payload:

- `sceneId`
- `userId`
- `userName`
- `userColor`
- `tokenId`
- `tokenName`
- `origin`
- `points`
- `sequence`
- `timestamp`

`points` are the exact polygon points the player preview rendered. They should be rounded to integer world coordinates before sending. If socketlib supports direct user sends, send only to active GM users. If not, use a broadcast channel and have non-GM clients ignore it.

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
- Send GM mirror updates at a hard cap of about 10 Hz.
- Send mirror updates only when origin or polygon points changed meaningfully.
- Round polygon points before socket send.
- Simplify or cap unusually large polygons before socket send.
- GM clients draw received points only; they do not recompute LOS.
- GM mirror clear uses both explicit end payload and about 500 ms silence timeout.
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
- Player-side mirror sender throttles update payloads.
- GM-side mirror draws received points without recomputing LOS.
- GM-side mirror clears on end payload and stale timeout.
- GM-side mirror ignores other scenes and invalid point payloads.

Live validation:

- Start Foundry and use `Ass Gm 2` if login is needed.
- Select one token near a corner.
- Hold configured peek keybind and move mouse around the corner.
- Confirm polygon follows clamped origin and walls clip the preview.
- Test closed vs open door.
- Confirm no visibility-map changes, token reveal changes, targeting changes, or hover regressions.
- With player and GM clients open, confirm GM sees the mirrored polygon update near real time and clear on key release.
