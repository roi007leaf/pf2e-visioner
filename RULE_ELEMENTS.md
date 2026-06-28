# PF2E Visioner Rule Elements

This document describes the custom rule elements provided by the PF2E Visioner module for controlling visibility, cover, and related mechanics through the `PF2eVisionerEffect` key.

## Overview

The `PF2eVisionerEffect` rule element accepts an array of operations that modify visibility, cover, detection modes, senses, and action qualifications. All operations use the same priority-based stacking system: when multiple operations target the same pair, the highest-priority operation wins; equal priorities stack cumulatively.

## Core Concepts

### Priority Stacking

Rule element operations are prioritized numerically. When multiple operations of the same type apply to the same observer-target pair:

- **Highest priority wins** for override-style operations (e.g., `overrideVisibility`, `overrideCover`)
- **Cumulative stacking** for additive operations (e.g., `adjustCover` in `bonus` mode)

If multiple operations have the same priority and the same scope, they stack additively.

### Cover Ladder

Relative cover adjustments use a cover ladder for `mode: "step"`:

- None = 0
- Lesser = 1
- Standard = 2
- Greater = 4

Steps clamp to the ladder: stepping down from None stays at None; stepping up from Greater stays at Greater.

For `mode: "bonus"`, the adjustment amount converts back to the PF2E AC bonus system: each step = 1 AC bonus (None → Lesser = +1, Lesser → Standard = +1, Standard → Greater = +2).

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
- `observers` (required if direction is `"from"`): `"all"` or a list of observer UUIDs
- `targets` (required if direction is `"to"`): `"targeted"`, `"all"`, or a list of target UUIDs
- `predicate` (optional): Predicate array evaluated against the roll context; adjustments apply only if true
- `source` (optional): Label for audit/chat output (e.g., `"shooting-star-target"`)
- `priority` (optional, default 100): Numeric priority for stacking; higher wins

**Behavior:**

- Cover adjustments are **cumulative by priority**: multiple operations stack if they have equal priority and scope
- **Next-attack consume-once**: A `next-attack` adjustment applies to the first qualifying roll, then the adjustment is consumed and cleared; it cannot be reused until the effect is reapplied or toggled
- **While-active persist**: A `while-active` adjustment remains active for the entire effect duration
- **Predicate gating**: If a predicate is supplied, the adjustment only applies if the predicate evaluates true in the roll context

**Examples:**

**Shooting Star (step-based, while-active):**
```json
{
  "type": "adjustCover",
  "mode": "step",
  "steps": -1,
  "direction": "from",
  "observers": "all",
  "scope": "while-active",
  "source": "shooting-star-target",
  "priority": 120
}
```

All observers treat the target as having one less step of cover (e.g., standard becomes lesser) for the duration of the effect.

**Phase Bolt (bonus-based, next-attack, with predicate):**
```json
{
  "type": "adjustCover",
  "mode": "bonus",
  "amount": -2,
  "direction": "to",
  "targets": "targeted",
  "scope": "next-attack",
  "source": "phase-bolt",
  "predicate": ["item:slug:phase-bolt"],
  "priority": 120
}
```

When rolling an attack with the phase-bolt item, the target gains a -2 AC bonus from reduced cover on the next attack roll, then the adjustment clears.

---

## Additional Operations

Additional operations like `overrideVisibility`, `modifyDetectionModes`, `modifySenses`, `modifyActionQualification`, `conditionalState`, `distanceBasedVisibility`, and `offGuardSuppression` are supported. For detailed documentation on those, refer to the PF2E Visioner wiki or inline schema definitions.
