# GM-Authoritative Cover for Stealth-Initiative Rolls

## Problem

When a token rolls Stealth for initiative, `StealthCheckUseCase` auto-detects
a cover bonus and applies it as a circumstance modifier on the roll. Two
problems:

1. **Bug**: the observer scan (`collectStealthObservers` /
   `analyzeStealthObserverCover`) considers *all* `canvas.tokens.placeables`
   filtered only by alliance, not restricted to tokens actually in the
   current encounter. A hostile/non-party token that isn't a combatant can
   still grant (or block) cover for the roll.
2. **Feature request**: the cover state should not be silently
   auto-applied (or left to the rolling player's own dialog buttons/keybind
   popup) — the GM should see a popup, using the module's existing cover
   button styling, to pick the cover state that determines the bonus.

## Scope

This entire flow lives in `StealthCheckUseCase.js` and its direct
collaborators (`stealth-observer-analysis.js`, `CoverUIManager.js`,
`QuickOverrideDialog.js`, `services/socket.js`). Confirmed via
`AutoCoverHooks._isStealthContext` / `_getUseCaseForContext`:
`StealthCheckUseCase` is **only ever dispatched** for
`context.type === 'initiative'` stealth checks — Hide and Sneak actions are
routed to entirely separate code (`HideAction.js`, `SneakAction.js`,
`hide-cover-analysis.js`, `sneak-cover-analysis.js`) and are unaffected by
anything in this design.

## 1. Bug fix — encounter-only observers

`collectStealthObservers()` in `stealth-observer-analysis.js` gains an
additional filter: when `game.combat` exists, a candidate observer token
must also resolve to one of `game.combat.combatants` (matched via
`combatant.tokenId ?? combatant.token?.id`, mirroring the existing helper
in `EncounterStealthInitiativeService.getTokenIdFromCombatant`). When no
combat is active, filtering is unchanged (alliance-only), so this can't
regress any non-initiative caller of this shared helper, and doesn't affect
any existing test (none of them set up `game.combat`).

## 2. Architecture — GM decision flow

`AutoCoverHooks._wrapCheckRoll` wraps `game.pf2e.Check.roll` via libWrapper
and already `await`s `StealthCheckUseCase.handleCheckRoll(check, context)`
**before** the dice are rolled — true for both the "show check dialog" and
"quick roll" paths. This is the single choke point where blocking is safe.

A new small coordinator (e.g. `StealthInitiativeCoverCoordinator`, used from
`handleCheckRoll`) does:

1. **Suggestion**: compute `originalDetectedState` via
   `analyzeStealthObserverCover` using the now encounter-only observer set.
2. **Decision**:
   - If `game.user.isGM` is true on the client executing the roll (covers
     the GM rolling initiative for their own NPC/monster too — the dialog
     always appears, per "Everyone" scope), open the cover dialog locally
     and `await` its result. No network round trip.
   - Otherwise, send a `StealthInitiativeCoverRequest` over socketlib
     (`executeAsGM`) with `{ requestId, hiderTokenId, hiderName,
     suggestedState }`. Register a pending `Promise` keyed by `requestId`
     (same pattern as `PeekManager`'s door-approval:
     `_pendingDoorApprovals` Map + `handleDoorPeekApprovalResponse`), guarded
     by a 30s timeout. The GM's client opens the dialog on receipt and
     replies with `StealthInitiativeCoverResponse` via
     `executeSocketForUser`, resolving the pending promise on the
     originating client. If the GM never responds (offline, dialog
     ignored, or timeout elapses), the promise resolves to
     `suggestedState` — the roll is never blocked indefinitely.
3. **Apply**: once resolved to a final `state`, behave like the existing
   code already does when cover changes — call `setRollOverride` for the
   relevant observers when `state !== originalDetectedState`, compute the
   stealth bonus via `getCoverStealthBonusByState`, and push the
   `pf2e-visioner-cover` modifier onto `check.modifiers`
   (`_shouldApplyStealthCoverModifier(context)` guard stays as-is).

**Removed**: the keybind-triggered `coverUIManager.showPopupAndApply()` call
currently inside `StealthCheckUseCase.handleCheckRoll` is replaced by the
above. `CoverUIManager.showPopupAndApply` itself is untouched — it's
called independently by `AttackRollUseCase` and `SavingThrowUseCase`.

**Player's own roll dialog**: `StealthCheckUseCase.handleCheckDialog` stops
calling `coverUIManager.injectDialogCoverUI` when `ctx.type === 'initiative'`.
Since that's the only context this method is ever invoked with in
production, this makes the method a no-op for real stealth-initiative
rolls (the GM's popup is the sole control), while its observer-direction
logic remains exercised by its other unit tests (synthetic non-initiative
contexts).

## 3. UI — dialog

Reuse `CoverQuickOverrideDialog` (`scripts/cover/QuickOverrideDialog.js`,
the ApplicationV2 dialog with `pv-qo-btn` shield-icon buttons) rather than
building a new component. It gains two new *optional* constructor options,
so existing call sites (attack/save keybind popup) are unaffected:

- `title` — overrides the window title.
- `confirmLabel` — overrides the "Roll" button label.

For this flow:

- Title: new i18n key, e.g. `PF2E_VISIONER.DIALOG_TITLES.STEALTH_INITIATIVE_COVER`
  → `"Set Cover — {name}'s Stealth Roll"`.
- Pre-selected button: `suggestedState`.
- Confirm label: new i18n key (e.g. reuse/extend `UI.CONFIRM` if present,
  else add one) — "Confirm" instead of "Roll", since the GM isn't rolling.
- Close/cancel resolves to whatever is currently selected (defaults to the
  suggestion) — matching the existing null→"use suggestion" semantics
  already relied on by `showPopupAndApply`'s callers. No distinct "true
  cancel" path.
- Player-side UX: a lightweight non-blocking `ui.notifications.info` toast
  ("Waiting for GM to set cover…", new i18n key) fires when the request is
  sent, so the pause doesn't read as a hang.

## 4. i18n

New keys added to `lang/en.json` (existing `DIALOG_TITLES` / `UI` blocks):

- `DIALOG_TITLES.STEALTH_INITIATIVE_COVER`
- `UI.STEALTH_INITIATIVE_COVER_CONFIRM` (or reuse existing confirm/roll key
  if one fits without changing its meaning elsewhere)
- `UI.STEALTH_INITIATIVE_COVER_WAITING` (toast text)

## 5. Testing

- **`stealth-observer-analysis.test.js`**: new cases — observer excluded
  when not a combatant despite matching alliance; observer included when
  it is a combatant; unfiltered behavior preserved when `game.combat` is
  absent (protects existing tests).
- **`stealth-check-use-case.test.js`**:
  - Rewrite `'should apply selected cover modifier to the dialog check
    before rolling'` (currently line ~221) — this test encodes the exact
    old "player picks cover in their own dialog" behavior being replaced.
    New version asserts `injectDialogCoverUI` is *not* called for
    `type: 'initiative'`.
  - New tests for `handleCheckRoll`'s GM-decision branch: GM-local path
    (dialog opens synchronously, no socket call, chosen state applied);
    player path (socket request sent with correct payload, response
    resolves the pending promise, resulting bonus pushed onto
    `check.modifiers`); timeout-fallback path (no response received →
    `originalDetectedState`/suggestion applied, roll not blocked forever).
- **`socket.js`** tests (new, mirroring `peek-socket-handlers.test.js`'s
  pattern of swapping `_socketService._socket` for a jest mock): request
  handler opens the dialog only when `game.user.isGM`; response handler
  resolves the correct pending promise keyed by `requestId`.
- **`QuickOverrideDialog`**: no dedicated test file exists today; add one
  covering the new `title`/`confirmLabel` options render correctly and
  default (no-option) behavior is unchanged.

All bonus-math, modifier-pushing, and roll-override-storage logic reuses
already-tested code paths unchanged.
