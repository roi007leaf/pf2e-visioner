# Foundry-Hidden Special-Sense Secrecy Design

## Problem

The system-hidden indicator pipeline currently treats any token whose rendered placeable is not
visible or renderable as eligible for special-sense indicators. It does not distinguish tokens
hidden by perception conditions from tokens explicitly marked Hidden by a GM through Foundry's
`TokenDocument.hidden` property.

As a result, a user controlling an observer with an imprecise sense such as Scent can see an
indicator at the position of a Foundry-hidden token. A GM-selected observer has an additional leak:
Foundry's GM rendering can keep the hidden token art visible even though the canvas is meant to show
the selected token's perspective.

## Required Behavior

- A token with `token.document.hidden === true` must not produce any Visioner special-sense
  indicator while a token perspective is active, regardless of whether the viewing account is a GM.
- The restriction applies to Scent, Lifesense, Thoughtsense, Echolocation, and the blind/deaf
  fallback indicator.
- If an indicator already exists and the target becomes Foundry Hidden, the existing indicator must
  be removed during the next highlight update.
- While a GM controls or drags an observer token, other Foundry-hidden tokens must be hard-hidden
  from that observer perspective.
- When the GM has no controlled or dragged observer, Foundry's normal hidden-token rendering must
  be restored.
- Tokens hidden only because of darkness, line of sight, invisibility, AVS state, or other
  perception rules remain eligible for special-sense indicators.

## Design

Add the secrecy rule at the centralized decision boundary in
`buildSystemHiddenIndicatorDecision`. When the target is explicitly Foundry Hidden, every
`shouldShow*Indicator` result will be false. Account role is intentionally irrelevant because this
pipeline renders an observer token's perspective, not the account's omniscient view.

The current `updateSystemHiddenTokenHighlights` loop will continue evaluating the token. If an
indicator already exists, the existing `shouldShowIndicator === false` cleanup branch will remove
it. Keeping the token in the candidate list is important: filtering it out earlier would skip that
cleanup and could leave a stale position indicator on the canvas.

Extend the existing current-view hard-hide rule so a Foundry-hidden target requires Visioner's
render lock when either the viewer is a non-GM or a GM currently controls or drags an observer.
Keep the existing GM release path for the no-observer state so deselecting the token restores
Foundry's normal translucent hidden-token display.

## Data Flow

1. A controlled observer causes `updateSystemHiddenTokenHighlights` to evaluate creature targets.
2. `buildSystemHiddenIndicatorDecision` receives the observer, target, and sense context.
3. The decision checks `token.document.hidden` before allowing any special-sense mode.
4. For a Foundry-hidden target, the decision returns `shouldShowIndicator: false`.
5. The visual-effects loop either leaves the target without an indicator or removes its stale
   indicator.
6. The current-view hard-hide service checks whether a token perspective is active. If so, it
   suppresses the Foundry-hidden target's art, chrome, detection filter, and interaction surfaces.
7. When the last GM observer is deselected, the normal hard-hide release path restores Core
   rendering.

## Testing

Add focused unit coverage in `tests/unit/services/system-hidden-token-highlights.test.js`:

- An observer with in-range Scent does not receive an indicator for a target whose document is
  Foundry Hidden, for both player and GM accounts.
- The same observer still receives a Scent indicator for an otherwise equivalent target
  hidden only by rendering/perception.
- The returned per-sense flags are false for a Foundry-hidden target, proving
  that no alternate indicator mode can leak the target.
- A GM-selected observer hard-hides another Foundry-hidden token even when Core rendered it.
- A nested held-drag render refresh cannot repaint a Foundry-hidden target after AVS settles to
  observed.
- A GM with no selected or dragged observer leaves Foundry-hidden rendering to Core.

Run the focused test file first, then the related service tests, lint the changed files, and finally
run the full Jest suite.

## Non-Goals

- Changing PF2E rules for Scent or other senses.
- Changing Foundry's GM rendering when no observer perspective is active.
- Changing AVS visibility states for tokens that are not explicitly Foundry Hidden.
- Refactoring the system-hidden indicator renderer or candidate discovery pipeline.
