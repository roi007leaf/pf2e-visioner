# PF2E Visioner Rule Elements

This document describes the custom rule elements provided by the PF2E Visioner module for controlling visibility, cover, and related mechanics through the `PF2eVisionerEffect` key.

## Overview

The `PF2eVisionerEffect` rule element accepts an array of operations that modify visibility, cover, detection modes, senses, and action qualifications. All operations use the same priority-based stacking system: when multiple operations target the same pair, every active operation is applied cumulatively in descending priority order.

## Core Concepts

### Priority Stacking

Rule element operations are prioritized numerically. When multiple operations apply to the same observer-target pair, every active operation is applied cumulatively in descending priority order. Priority controls the order of application, not exclusion; all operations that pass their predicates are applied to the running state.

### Cover Ladder

Relative cover adjustments use a cover ladder. For `mode: "step"`:

- None = 0
- Lesser = 1
- Standard = 2
- Greater = 4

Steps clamp to the ladder: stepping down from None stays at None; stepping up from Greater stays at Greater.

For `mode: "bonus"`, the adjustment amount is subtracted from the AC bonus (e.g., `-2` reduces any cover AC bonus by 2). The cover values map to AC bonuses: none = 0, lesser = 1, standard = 2, greater = 4. After applying the adjustment, the result clamps back to the cover ladder.

### Scopes

- **`while-active`**: The adjustment persists for the entire duration of the effect
- **`next-attack`**: The adjustment applies to the first qualifying roll, then clears; cannot be re-applied until the effect is toggled or reapplied

## Operations

### adjustCover

Reduces a target's effective cover at roll time without permanently changing stored cover values. Useful for spells and abilities that penetrate cover or ignore it.

**Fields:**

- `type` (required): `"adjustCover"`
- `mode` (required): `"step"` or `"bonus"`
  - `"step"`: Adjust by cover steps (e.g., `-1` reduces standard to lesser)
  - `"bonus"`: Adjust by AC bonus amount (e.g., `-2` for a -2 AC bonus)
- `steps` (required if mode is `"step"`): Integer, positive or negative (e.g., `-1`, `2`)
- `amount` (required if mode is `"bonus"`): Integer AC bonus (e.g., `-2`)
- `scope` (required): `"while-active"` or `"next-attack"`
- `direction` (required): `"from"` (observer gains reduced cover view) or `"to"` (target gains reduced cover protection)
- `observers` (required if direction is `"from"`): `"all"`, `"enemies"`, `"allies"`, `"targeted"`, `"selected"`, or `"specific"`
- `targets` (required if direction is `"to"`): `"all"`, `"enemies"`, `"allies"`, `"targeted"`, `"selected"`, or `"specific"`
- `tokenIds` (required if `observers`/`targets` is `"specific"`): a list of scene token ids the adjustment is scoped to
- `predicate` (optional): Predicate array evaluated against the roll context; adjustments apply only if true
- `source` (optional): Label for audit/chat output (e.g., `"shooting-star-target"`)

**Behavior:**

- **Cumulative application**: All active adjustments are applied cumulatively to the cover state in descending priority order; priority controls application order only, not exclusion
- **Next-attack consume-once**: A `next-attack` adjustment applies to the first qualifying roll, then the adjustment is consumed and cleared from the flag; it returns only if the carrying effect is reapplied or retriggers the operation
- **While-active persist**: A `while-active` adjustment remains active for the entire effect duration
- **Predicate gating**: If a predicate is supplied, the adjustment only applies if the predicate evaluates true in the roll context

**Examples:**

**Shooting Star (step-based, while-active):**
```json
{
  "key": "PF2eVisionerEffect",
  "operations": [
    {
      "type": "adjustCover",
      "mode": "step",
      "steps": -1,
      "direction": "from",
      "observers": "all",
      "scope": "while-active",
      "source": "shooting-star-target"
    }
  ],
  "priority": 120
}
```

All observers treat the target as having one less step of cover (e.g., standard becomes lesser) for the duration of the effect.

**Phase Bolt (bonus-based, next-attack, with predicate):**
```json
{
  "key": "PF2eVisionerEffect",
  "operations": [
    {
      "type": "adjustCover",
      "mode": "bonus",
      "amount": -2,
      "direction": "to",
      "targets": "targeted",
      "scope": "next-attack",
      "source": "phase-bolt",
      "predicate": ["item:slug:phase-bolt"]
    }
  ],
  "priority": 120
}
```

When rolling an attack with the phase-bolt item, the target's cover AC bonus is reduced by 2 on the next attack roll, then the adjustment clears.

**Scoped to a specific creature:**

Use `"specific"` with `tokenIds` (scene token ids) to adjust cover for one chosen pair instead of the whole scene. The field follows `direction`: `"to"` reads `targets`, `"from"` reads `observers`.

Effect on the attacker — reduce one specific defender's cover from this attacker only:
```json
{
  "key": "PF2eVisionerEffect",
  "operations": [
    {
      "type": "adjustCover",
      "mode": "step",
      "steps": -1,
      "direction": "to",
      "targets": "specific",
      "tokenIds": ["<defenderTokenId>"],
      "scope": "while-active",
      "source": "vs-specific"
    }
  ],
  "priority": 120
}
```

Effect on the defender — reduce its cover only against one specific attacker:
```json
{
  "key": "PF2eVisionerEffect",
  "operations": [
    {
      "type": "adjustCover",
      "mode": "step",
      "steps": -1,
      "direction": "from",
      "observers": "specific",
      "tokenIds": ["<attackerTokenId>"],
      "scope": "while-active",
      "source": "vs-specific"
    }
  ],
  "priority": 120
}
```

Every other creature continues to use its normally detected cover. `"targeted"` (current targets), `"enemies"`, and `"allies"` are also accepted in place of `"specific"`.

---

## Additional Operations

Additional operations like `overrideVisibility`, `modifyDetectionModes`, `modifySenses`, `modifyActionQualification`, `conditionalState`, `distanceBasedVisibility`, and `offGuardSuppression` are supported. For detailed documentation on those, refer to the PF2E Visioner wiki or inline schema definitions.
