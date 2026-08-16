# Foundry-Hidden Special-Sense Secrecy Design

## Problem

The system-hidden indicator pipeline currently treats any token whose rendered placeable is not
visible or renderable as eligible for special-sense indicators. It does not distinguish tokens
hidden by perception conditions from tokens explicitly marked Hidden by a GM through Foundry's
`TokenDocument.hidden` property.

As a result, a non-GM user controlling an observer with an imprecise sense such as Scent can see an
indicator at the position of a Foundry-hidden token. The token art remains hidden, but the indicator
still reveals the token's existence, size, and location.

## Required Behavior

- A token with `token.document.hidden === true` must not produce any Visioner special-sense
  indicator for a non-GM user.
- The restriction applies to Scent, Lifesense, Thoughtsense, Echolocation, and the blind/deaf
  fallback indicator.
- If a non-GM user already has an indicator for a token and the GM then marks that token Foundry
  Hidden, the existing indicator must be removed during the next highlight update.
- Foundry's normal GM rendering of hidden tokens must remain unchanged.
- Tokens hidden only because of darkness, line of sight, invisibility, AVS state, or other
  perception rules remain eligible for special-sense indicators.

## Design

Add the secrecy rule at the centralized decision boundary in
`buildSystemHiddenIndicatorDecision`. The decision will determine whether the target is explicitly
Foundry Hidden for the current user. When the target is Foundry Hidden and the user is not a GM,
every `shouldShow*Indicator` result will be false.

The current `updateSystemHiddenTokenHighlights` loop will continue evaluating the token. If an
indicator already exists, the existing `shouldShowIndicator === false` cleanup branch will remove
it. Keeping the token in the candidate list is important: filtering it out earlier would skip that
cleanup and could leave a stale position indicator on the canvas.

The decision function will accept an injectable user value, defaulting to `globalThis.game?.user`.
This keeps production behavior tied to the viewing client while allowing unit tests to state the GM
or player context explicitly.

## Data Flow

1. A controlled observer causes `updateSystemHiddenTokenHighlights` to evaluate creature targets.
2. `buildSystemHiddenIndicatorDecision` receives the observer, target, sense context, and current
   user.
3. The decision checks `token.document.hidden` before allowing any special-sense mode.
4. For a non-GM viewer and a Foundry-hidden target, the decision returns
   `shouldShowIndicator: false`.
5. The visual-effects loop either leaves the target without an indicator or removes its stale
   indicator.

## Testing

Add focused unit coverage in `tests/unit/services/system-hidden-token-highlights.test.js`:

- A non-GM observer with in-range Scent does not receive an indicator for a target whose document
  is Foundry Hidden.
- The same non-GM observer still receives a Scent indicator for an otherwise equivalent target
  hidden only by rendering/perception.
- A GM context is not blocked by the player secrecy gate.
- The returned per-sense flags are false for a Foundry-hidden target viewed by a non-GM, proving
  that no alternate indicator mode can leak the target.

Run the focused test file first, then the related service tests, lint the changed files, and finally
run the full Jest suite.

## Non-Goals

- Changing PF2E rules for Scent or other senses.
- Changing Foundry's GM rendering, token opacity, or hidden-token interaction behavior.
- Changing AVS visibility states for tokens that are not explicitly Foundry Hidden.
- Refactoring the system-hidden indicator renderer or candidate discovery pipeline.
