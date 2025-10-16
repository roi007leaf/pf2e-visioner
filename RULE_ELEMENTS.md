# PF2e Visioner Rule Elements

This document describes the custom rule elements provided by PF2e Visioner for controlling visibility, cover, senses, and action prerequisites in spells, feats, and items.

## Table of Contents

- [Overview](#overview)
- [PF2eVisionerEffect Rule Element](#pf2evisionereffect-rule-element)
- [Operation Types](#operation-types)
- [Property Reference](#property-reference)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Overview

PF2e Visioner provides powerful rule elements that allow you to create complex visibility and cover interactions for spells, feats, and items. The main rule element is `PF2eVisionerEffect`, which supports multiple operation types that can be combined to create sophisticated effects.

## PF2eVisionerEffect Rule Element

The `PF2eVisionerEffect` rule element is a flexible system that can handle:

- **Sense modifications** - Change sense ranges and precision
- **Visibility overrides** - Force specific visibility states
- **Cover overrides** - Provide or block cover
- **Action qualifications** - Control what counts for action prerequisites
- **Conditional states** - Apply effects based on conditions

### Basic Structure

```json
{
  "key": "PF2eVisionerEffect",
  "predicate": ["optional-rule-element-predicate"],
  "operations": [
    {
      "type": "operationType",
      "predicate": ["optional-operation-predicate"],
      ...
    }
  ],
  "priority": 100
}
```

### Predicate Support

PF2e Visioner uses PF2e's built-in predicate system for conditional effects. This ensures full compatibility with PF2e's roll options and predicate evaluation. Predicates can be added at two levels:

#### Rule Element Level Predicate

Applied to the entire rule element. If the predicate fails, **no operations** are applied.

```json
{
  "key": "PF2eVisionerEffect",
  "predicate": ["self:condition:invisible"],
  "operations": [...]
}
```

#### Operation Level Predicate

Applied to individual operations. More granular control - each operation can have its own conditions.

```json
{
  "key": "PF2eVisionerEffect",
  "operations": [
    {
      "type": "overrideVisibility",
      "state": "concealed",
      "predicate": ["target:trait:undead"],
      "observers": "all"
    }
  ]
}
```

#### Common Roll Options

Predicates use PF2e roll options. Common patterns include:

**Self options** (the token with the effect):

- `self:condition:{condition}` - Has a specific condition (e.g., `self:condition:invisible`)
- `self:trait:{trait}` - Has a specific trait (e.g., `self:trait:undead`)
- `self:disposition:friendly|hostile|neutral` - Token disposition
- `self:hidden` - Token is hidden to GM

**Target options** (the affected token):

- `target:condition:{condition}` - Target has a condition
- `target:trait:{trait}` - Target has a trait
- `target:ally` - Target is an ally
- `target:enemy` - Target is an enemy

**Environmental options**:

- `lighting:dim` - Dim light
- `lighting:darkness` - Darkness
- `lighting:bright` - Bright light

**Logical operators**:

- Array elements are AND by default: `["self:condition:invisible", "target:enemy"]` means both must be true
- Use `not:` prefix for negation: `["not:target:condition:invisible"]`
- Complex logic uses objects: `{"or": ["condition1", "condition2"]}`

#### Predicate Examples

**See Invisibility** (only reveals invisible creatures):

```json
{
  "key": "PF2eVisionerEffect",
  "operations": [
    {
      "type": "overrideVisibility",
      "state": "concealed",
      "predicate": ["target:condition:invisible"],
      "observers": "all"
    }
  ]
}
```

**Darkvision** (only works in dim/dark conditions):

```json
{
  "key": "PF2eVisionerEffect",
  "predicate": ["lighting:dim", "lighting:darkness"],
  "operations": [
    {
      "type": "modifySenses",
      "senseModifications": {
        "darkvision": { "range": 60 }
      }
    }
  ]
}
```

**Consecrate** (only affects undead):

```json
{
  "key": "PF2eVisionerEffect",
  "operations": [
    {
      "type": "overrideVisibility",
      "state": "concealed",
      "predicate": ["self:trait:undead"],
      "observers": "all"
    }
  ]
}
```

## Operation Types

### 1. modifySenses

Modify sense ranges and precision for the token.

**Use cases:**

- Spells that limit perception range (Clouded Focus)
- Effects that sharpen imprecise senses to precise
- Temporary sense enhancements

**Properties:**

- `senseModifications` (object): Sense-specific modifications
  - Keys: Sense names or `"all"` for all senses
  - Values: `{ range: number, precision: "precise"|"imprecise", maxRange: number, beyondIsImprecise: boolean }`

**Example:**

```json
{
  "type": "modifySenses",
  "senseModifications": {
    "hearing": {
      "precision": "precise",
      "range": 20
    },
    "all": {
      "maxRange": 20
    }
  }
}
```

### 2. overrideVisibility

Override the visibility state between tokens, bypassing AVS calculations.

**Use cases:**

- Spells that force concealment (Blur)
- Effects that reveal invisible creatures (Faerie Fire, Revealing Light)
- Temporary visibility changes

**Properties:**

- `state` (string): Visibility state - `"observed"`, `"concealed"`, `"hidden"`, `"undetected"`
- `direction` (string): Relationship direction
  - `"from"` - Observers see subject differently (e.g., Blur makes you concealed to others)
  - `"to"` - Subject sees observers differently (e.g., you see others as hidden)
- `observers` (string): Who is affected - `"all"`, `"allies"`, `"enemies"`, `"selected"`, `"targeted"`, `"specific"`
- `tokenIds` (array): Array of token document IDs (required when `observers` is `"specific"`)
- `source` (string): Identifier for source tracking (used for qualifications)
- `preventConcealment` (boolean): Remove all concealment sources
- `range` (number): Optional distance limit in feet

**Example:**

```json
{
  "type": "overrideVisibility",
  "state": "concealed",
  "direction": "from",
  "observers": "all",
  "source": "blur-spell"
}
```

### 3. distanceBasedVisibility

Apply different visibility states based on distance between tokens. Perfect for environmental effects like fog, precipitation, or darkness that affect visibility at different ranges.

**Use cases:**

- Heavy precipitation (creatures 30+ feet away are concealed)
- Thick fog (creatures 10-20 feet away are concealed, 20+ feet are hidden)
- Magical darkness effects with varying intensity by distance
- Environmental hazards that limit vision

**Properties:**

- `direction` (string): Relationship direction
  - `"from"` - Observers see subject differently based on distance
  - `"to"` - Subject sees observers differently based on distance
- `observers` (string): Who is affected - `"all"`, `"allies"`, `"enemies"`, `"selected"`, `"targeted"`, `"specific"`
- `tokenIds` (array): Array of token document IDs (required when `observers` is `"specific"`)
- `distanceBands` (array): Array of distance band objects, each with:
  - `minDistance` (number): Minimum distance in feet (null or 0 for no minimum)
  - `maxDistance` (number): Maximum distance in feet (null for no maximum/infinity)
  - `state` (string): Visibility state - `"observed"`, `"concealed"`, `"hidden"`, `"undetected"`
- `source` (string): Identifier for source tracking
- `predicate` (array): Optional PF2e predicate for conditional application

**Example - Heavy Precipitation:**

```json
{
  "type": "distanceBasedVisibility",
  "direction": "to",
  "observers": "all",
  "distanceBands": [
    {
      "minDistance": 0,
      "maxDistance": 30,
      "state": "observed"
    },
    {
      "minDistance": 30,
      "maxDistance": null,
      "state": "concealed"
    }
  ],
  "source": "heavy-precipitation"
}
```

**Example - Thick Fog (Multiple Bands):**

```json
{
  "type": "distanceBasedVisibility",
  "direction": "to",
  "observers": "all",
  "distanceBands": [
    {
      "minDistance": 0,
      "maxDistance": 10,
      "state": "observed"
    },
    {
      "minDistance": 10,
      "maxDistance": 20,
      "state": "concealed"
    },
    {
      "minDistance": 20,
      "maxDistance": null,
      "state": "hidden"
    }
  ],
  "source": "thick-fog"
}
```

**How Distance Bands Work:**

- Bands are evaluated in order from smallest to largest `minDistance`
- The first band where `distance >= minDistance AND distance < maxDistance` is applied
- Use `null` for `maxDistance` to mean "infinity" (no upper limit)
- Use `null` or `0` for `minDistance` to mean "from 0 feet"
- Make sure bands don't overlap - each distance should fall into exactly one band

### 4. overrideCover

Override cover states between tokens.

**Use cases:**

- Tower shield providing cover to allies
- Effects that grant or block cover

**Properties:**

- `state` (string): Cover state - `"none"`, `"lesser"`, `"standard"`, `"greater"`
- `direction` (string): Relationship direction
  - `"to"` - Token provides cover TO others (e.g., tower shield)
  - `"from"` - Token receives cover FROM others
- `targets` (string): Who gets the cover - `"all"`, `"allies"`, `"enemies"`, `"selected"`, `"targeted"`, `"specific"`
- `tokenIds` (array): Array of token document IDs (required when `targets` is `"specific"`)
- `source` (string): Identifier for source tracking
- `range` (number): Optional distance limit
- `preventAutoCover` (boolean): Block auto-cover calculation

**Example:**

```json
{
  "type": "overrideCover",
  "state": "standard",
  "direction": "to",
  "targets": "allies",
  "range": 5,
  "source": "tower-shield"
}
```

### 5. provideCover

Placed objects (like deployable cover) that provide cover to tokens.

**Use cases:**

- Deployable Cover
- Ballistic Cover
- Barriers and shields

**Properties:**

- `state` (string): Cover state provided
- `blockedEdges` (array): Directional cover - `["north"]`, `["south"]`, `["east"]`, `["west"]`
- `requiresTakeCover` (boolean): Only works with Take Cover action
- `autoCoverBehavior` (string): How to interact with auto-cover
  - `"add"` - Add to auto-cover calculation
  - `"replace"` - Replace auto-cover entirely
  - `"minimum"` - Use whichever is higher
- `source` (string): Identifier

**Example:**

```json
{
  "type": "provideCover",
  "state": "standard",
  "blockedEdges": ["north"],
  "requiresTakeCover": true,
  "autoCoverBehavior": "replace",
  "source": "deployable-cover"
}
```

### 6. modifyActionQualification

Control what qualifies for action prerequisites (Hide, Sneak, Seek).

**Use cases:**

- Blur granting concealment that can't be used for Hide/Sneak
- Thousand Visions ignoring concealment within range
- Effects that modify action capabilities

**Properties:**

- `qualifications` (object): Action-specific rules
  - Keys: `"hide"`, `"sneak"`, `"seek"`
  - Values: Action-specific qualification objects

**Hide qualifications:**

- `canUseThisConcealment` (boolean): Can use this concealment for Hide
- `canUseThisCover` (boolean): Can use this cover for Hide
- `requiresLineOfSightBreak` (boolean): Requires breaking line of sight
- `customMessage` (string): Message explaining why it doesn't qualify

**Sneak qualifications:**

- `endPositionQualifies` (boolean): End position qualifies for Sneak
- `startPositionQualifies` (boolean): Start position qualifies
- `canMaintain` (boolean): Can maintain sneak state

**Seek qualifications:**

- `ignoreThisConcealment` (boolean): Ignore this concealment source
- `ignoreThisCover` (boolean): Ignore this cover source
- `ignoreConcealment` (boolean): Ignore all concealment (alternative syntax)

**Example:**

```json
{
  "type": "modifyActionQualification",
  "qualifications": {
    "hide": {
      "canUseThisConcealment": false,
      "customMessage": "Blur's concealment doesn't hide your location"
    },
    "sneak": {
      "endPositionQualifies": false
    }
  },
  "source": "blur-spell"
}
```

### 7. conditionalState

Apply visibility or cover states based on conditions.

**Use cases:**

- Faerie Fire (if invisible → concealed, else observed)
- Revealing Light (if invisible → concealed)
- Conditional visibility changes

**Properties:**

- `condition` (string): Condition to check - `"invisible"`, `"concealed"`, `"hidden"`, `"undetected"`
- `thenState` (string): State if condition is true
- `elseState` (string|null): State if condition is false
- `stateType` (string): Type of state - `"visibility"` or `"cover"`
- Other properties from overrideVisibility operation

**Example:**

```json
{
  "type": "conditionalState",
  "condition": "invisible",
  "thenState": "concealed",
  "elseState": "observed",
  "stateType": "visibility",
  "direction": "from",
  "observers": "all"
}
```

## Property Reference

### Rule Element Properties

| Property     | Type   | Values                       | Description                             |
| ------------ | ------ | ---------------------------- | --------------------------------------- |
| `key`        | string | `"PF2eVisionerEffect"`       | Rule element type                       |
| `predicate`  | array  | Array of roll option strings | Rule element level predicate (optional) |
| `operations` | array  | Array of operation objects   | Operations to apply                     |
| `priority`   | number | Default: 100                 | Rule element priority                   |

### Common Operation Properties

| Property                | Type   | Values                                                                                                                        | Description                                            |
| ----------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `type`                  | string | See [Operation Types](#operation-types)                                                                                       | Operation type                                         |
| `predicate`             | array  | Array of roll option strings                                                                                                  | Operation level predicate (optional)                   |
| `direction`             | string | `"from"`, `"to"`                                                                                                              | Relationship direction                                 |
| `observers` / `targets` | string | `"all"`, `"allies"`, `"enemies"`, `"selected"`, `"targeted"`, `"specific"`                                                    | Who is affected                                        |
| `tokenIds`              | array  | Array of token document IDs                                                                                                   | Required when using `"specific"` for observers/targets |
| `state`                 | string | Visibility: `"observed"`, `"concealed"`, `"hidden"`, `"undetected"`<br>Cover: `"none"`, `"lesser"`, `"standard"`, `"greater"` | State to apply                                         |
| `source`                | string | Any unique string                                                                                                             | Identifier for source tracking                         |
| `range`                 | number | Distance in feet                                                                                                              | Optional distance limit                                |
| `priority`              | number | Default: 100                                                                                                                  | Conflict resolution priority (higher wins)             |

## Examples

### Blur Spell

Grants concealment but can't be used for Hide or Sneak:

```json
{
  "key": "PF2eVisionerEffect",
  "operations": [
    {
      "type": "overrideVisibility",
      "state": "concealed",
      "direction": "from",
      "observers": "all",
      "source": "blur-spell"
    },
    {
      "type": "modifyActionQualification",
      "qualifications": {
        "hide": { "canUseThisConcealment": false },
        "sneak": { "endPositionQualifies": false }
      },
      "source": "blur-spell"
    }
  ]
}
```

### Faerie Fire

Reveals invisible creatures as concealed, prevents concealment for visible creatures:

```json
{
  "key": "PF2eVisionerEffect",
  "operations": [
    {
      "type": "conditionalState",
      "condition": "invisible",
      "thenState": "concealed",
      "elseState": "observed",
      "stateType": "visibility",
      "direction": "from",
      "observers": "all",
      "source": "faerie-fire"
    },
    {
      "type": "overrideVisibility",
      "preventConcealment": true,
      "direction": "from",
      "observers": "all",
      "source": "faerie-fire"
    }
  ]
}
```

### Clouded Focus

Sharpens senses within 20 feet, but limits all perception beyond:

```json
{
  "key": "PF2eVisionerEffect",
  "operations": [
    {
      "type": "modifySenses",
      "senseModifications": {
        "hearing": { "precision": "precise", "range": 20 },
        "tremorsense": { "precision": "precise", "range": 20 },
        "scent": { "precision": "precise", "range": 20 },
        "all": { "maxRange": 20 }
      }
    }
  ]
}
```

### Thousand Visions

Ignores concealment within 30 feet, imprecise senses beyond:

```json
{
  "key": "PF2eVisionerEffect",
  "operations": [
    {
      "type": "modifyActionQualification",
      "qualifications": {
        "seek": { "ignoreConcealment": true }
      },
      "range": 30
    },
    {
      "type": "modifySenses",
      "senseModifications": {
        "all": { "maxRange": 30, "beyondIsImprecise": true }
      }
    }
  ]
}
```

### Tower Shield

Provides standard cover to allies within 5 feet when you Take Cover:

```json
{
  "key": "PF2eVisionerEffect",
  "operations": [
    {
      "type": "overrideCover",
      "state": "standard",
      "direction": "to",
      "targets": "allies",
      "range": 5,
      "source": "tower-shield",
      "requiresTakeCover": true
    }
  ]
}
```

### Deployable Cover

Placed object providing directional cover:

```json
{
  "key": "PF2eVisionerEffect",
  "operations": [
    {
      "type": "provideCover",
      "state": "standard",
      "blockedEdges": ["north"],
      "requiresTakeCover": true,
      "autoCoverBehavior": "replace",
      "source": "deployable-cover"
    }
  ]
}
```

## Homebrew Guide

### Creating Custom Effects

1. **Identify the operation types needed**
   - Do you need to modify senses, visibility, cover, or action qualifications?
   - Can you combine multiple operations?

2. **Set appropriate priorities**
   - Higher priority wins conflicts
   - Default is 100
   - Use 110+ for effects that should override most others

3. **Use source tracking**
   - Provide a unique `source` identifier
   - This enables qualification checks

4. **Test with action dialogs**
   - Verify Hide and Sneak dialogs respect qualifications
   - Check that custom messages appear

### Combining Operations

You can combine multiple operations for complex effects:

```json
{
  "key": "PF2eVisionerEffect",
  "operations": [
    {
      "type": "overrideVisibility",
      "state": "concealed",
      ...
    },
    {
      "type": "modifyActionQualification",
      ...
    },
    {
      "type": "modifySenses",
      ...
    }
  ]
}
```

### Targeting Specific Tokens

You can target specific tokens by their IDs for precise control:

```json
{
  "key": "PF2eVisionerEffect",
  "operations": [
    {
      "type": "overrideVisibility",
      "state": "hidden",
      "direction": "from",
      "observers": "specific",
      "tokenIds": ["token-abc123", "token-def456"],
      "source": "custom-effect"
    }
  ]
}
```

This is useful for:

- Spells that affect specific designated targets
- Conditional effects based on token selection
- Custom scenarios requiring fine-grained control

**Note:** Token IDs are document IDs, not actor IDs. You can get a token's ID with `token.document.id`.

### Conditional Logic

Use `conditionalState` for effects that depend on existing conditions:

```json
{
  "type": "conditionalState",
  "condition": "invisible",
  "thenState": "concealed",
  "elseState": null,
  "stateType": "visibility"
}
```

## Troubleshooting

### Rule Element Not Working

1. **Check PF2e system version**
   - Ensure you're using a compatible version
   - Rule elements require PF2e system v5.0+

2. **Verify rule element registration**
   - Open browser console (F12)
   - Check for errors during module load

3. **Check rule syntax**
   - Ensure JSON is valid
   - Verify all required properties are present

### Qualification Not Working in Dialogs

1. **Verify source tracking**
   - Ensure `source` property is set
   - Check that sources match between operations

2. **Check qualification properties**
   - Use correct property names
   - Boolean values should be true/false, not strings

3. **Test with simple examples**
   - Start with single operation
   - Add complexity gradually

### Conflicts Between Effects

1. **Check priorities**
   - Higher priority wins
   - Use distinct priority values

2. **Review source tracking**
   - Multiple sources can coexist
   - Qualification checks aggregate

3. **Test effect removal**
   - Ensure effects clean up properly
   - Check flags are removed on delete

## API Access

You can test rule elements programmatically:

```javascript
// Create example effects
await PF2EVisioner.createRuleElementExample('blur');
await PF2EVisioner.createRuleElementExample('faerieFire');

// Create all examples
await PF2EVisioner.createAllRuleElementExamples();
```

## Support

For issues, questions, or feature requests:

- GitHub Issues: https://github.com/roileaf/pf2e-visioner/issues
- Discord: https://discord.gg/pf2e
