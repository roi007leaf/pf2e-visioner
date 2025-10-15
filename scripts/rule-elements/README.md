# Rule Elements System

The PF2E Visioner Rule Elements system provides a powerful way to programmatically control visibility, cover, detection, and other Visioner features through PF2e's rule element framework.

## Overview

Rule elements allow you to automatically apply Visioner effects when items, feats, spells, or effects are added to actors. This enables seamless integration with the PF2e system's automation framework.

## Available Rule Elements

### 1. PF2eVisionerVisibility

Controls visibility states between tokens (observed, concealed, hidden, undetected).

**Common Use Cases:**
- Hide action effects
- Invisibility spells
- Concealment from environmental effects
- See Invisibility and similar detection magic

**Key Properties:**
- `status`: The visibility state to apply
- `direction`: Who sees whom (`from`, `to`, `bidirectional`)
- `mode`: How to apply (`set`, `increase`, `decrease`, `remove`, `toggle`)
- `effectTarget`: Where ephemeral effects go (`subject`, `observer`, `both`, `none`)

### 2. PF2eVisionerCover

Controls cover states between tokens (none, lesser, standard, greater).

**Common Use Cases:**
- Take Cover action
- Wall spells providing cover
- Magical barriers
- Environmental cover effects

**Key Properties:**
- `coverLevel`: The level of cover to apply
- `applyBonuses`: Whether to apply AC/Reflex bonuses
- `allowHide`: Whether this cover allows the Hide action
- `direction`: Directional cover relationships

### 3. PF2eVisionerDetection

Grants or modifies detection senses (darkvision, tremorsense, etc.).

**Common Use Cases:**
- Darkvision spell
- Tremorsense effects
- Scent tracking
- Echolocation
- Lifesense

**Key Properties:**
- `sense`: The type of sense to grant
- `senseRange`: Maximum range of the sense
- `acuity`: Precision level (`precise`, `imprecise`, `vague`)
- `modifyExisting`: Whether to modify existing senses or add new ones

## Common Properties

All rule elements share these properties:

### Predicates

**`predicate`**: Array of conditional statements that must be true for the rule element to apply.

Uses PF2e's predicate syntax. Examples:
- `["self:condition:prone"]` - Only when prone
- `["target:enemy", "not:target:condition:blinded"]` - Enemy targets that aren't blinded  
- `[{"or": ["lighting:dim", "lighting:darkness"]}]` - In dim light or darkness

See `PREDICATE_GUIDE.md` for comprehensive documentation.

### Target Selection
- **`subject`**: Who is affected (`self`, `target`, `controlled`, `all`)
- **`observers`**: Who observes/interacts (`all`, `allies`, `enemies`, `selected`, `targeted`, `none`)
- **`targetFilter`**: Additional filtering
  - `disposition`: Filter by token disposition
  - `hasCondition`: Filter by presence of condition
  - `lackCondition`: Filter by absence of condition
  - `actorType`: Filter by actor type

### Operation Control
- **`mode`**: How to apply the effect
  - `set`: Directly set to a value
  - `increase`: Worsen the state (e.g., observed → concealed → hidden)
  - `decrease`: Improve the state (e.g., hidden → concealed → observed)
  - `remove`: Clear the effect entirely
  - `toggle`: Switch between two states
- **`steps`**: Number of steps for increase/decrease (default: 1)

### Lifecycle Management
- **`trigger`**: When to apply (implicit based on lifecycle hooks)
- **`duration`**: How long the effect lasts
  - `durationRounds`: Number of combat rounds (null = permanent)
- **`requiresInitiative`**: Only apply when in active combat

### Spatial Filtering
- **`range`**: Maximum distance in feet (null = unlimited)
- **`direction`**: Directional relationships
  - `from`: Observers see subject with the effect
  - `to`: Subject sees observers with the effect
  - `bidirectional`: Both directions

## Usage Examples

### Example 1: Basic Hide Action

```json
{
  "key": "PF2eVisionerVisibility",
  "subject": "self",
  "observers": "enemies",
  "direction": "from",
  "mode": "set",
  "status": "hidden",
  "effectTarget": "subject",
  "durationRounds": 10
}
```

**Effect:** The subject becomes hidden to all enemies. Ephemeral effects (flat check, off-guard) are applied to the subject.

### Example 2: See Invisibility (Conditional)

```json
{
  "key": "PF2eVisionerVisibility",
  "subject": "self",
  "observers": "all",
  "direction": "to",
  "mode": "decrease",
  "steps": 2,
  "effectTarget": "subject",
  "durationRounds": 60,
  "targetFilter": {
    "hasCondition": "invisible"
  }
}
```

**Effect:** The subject can see invisible creatures better. Decreases their visibility by 2 steps (e.g., undetected → concealed, hidden → observed).

### Example 3: Obscuring Mist (Gradual Concealment)

```json
{
  "key": "PF2eVisionerVisibility",
  "subject": "self",
  "observers": "all",
  "direction": "from",
  "mode": "increase",
  "steps": 1,
  "effectTarget": "subject",
  "range": 20
}
```

**Effect:** Increases concealment by 1 step for all tokens within 20 feet. Observed → Concealed, Concealed → Hidden.

### Example 4: Wall of Stone (Bidirectional Cover)

```json
{
  "key": "PF2eVisionerCover",
  "subject": "self",
  "observers": "all",
  "direction": "bidirectional",
  "mode": "set",
  "coverLevel": "greater",
  "applyBonuses": true,
  "allowHide": true
}
```

**Effect:** Creates greater cover that works in both directions and allows hiding.

### Example 5: Take Cover (Defensive Stance)

```json
{
  "key": "PF2eVisionerCover",
  "subject": "self",
  "observers": "enemies",
  "direction": "from",
  "mode": "set",
  "coverLevel": "standard",
  "applyBonuses": true,
  "requiresInitiative": true
}
```

**Effect:** Gains standard cover against enemies. Only works in combat.

### Example 6: Darkvision Spell

```json
{
  "key": "PF2eVisionerDetection",
  "subject": "target",
  "mode": "set",
  "sense": "darkvision",
  "senseRange": 60,
  "acuity": "precise"
}
```

**Effect:** Grants 60-foot darkvision to the target.

### Example 7: Echolocation (Temporary)

```json
{
  "key": "PF2eVisionerDetection",
  "subject": "self",
  "mode": "set",
  "sense": "echolocation",
  "senseRange": 30,
  "acuity": "precise",
  "requiresInitiative": true,
  "durationRounds": 1
}
```

**Effect:** Grants precise hearing for 30 feet until the end of your next turn.

### Example 8: Blur Vision (Reverse Perception)

```json
{
  "key": "PF2eVisionerVisibility",
  "subject": "target",
  "observers": "all",
  "direction": "to",
  "mode": "set",
  "status": "hidden",
  "effectTarget": "subject",
  "targetFilter": {
    "range": 999
  },
  "durationRounds": 5
}
```

**Effect:** The target sees all other creatures as hidden (simulates blurred vision or blinded-like condition).

### Example 9: Ally-Specific Invisibility

```json
{
  "key": "PF2eVisionerVisibility",
  "subject": "self",
  "observers": "enemies",
  "direction": "from",
  "mode": "set",
  "status": "undetected",
  "effectTarget": "subject",
  "targetFilter": {
    "actorType": "character"
  }
}
```

**Effect:** Become undetected only to player character enemies (not NPCs).

### Example 10: Range-Limited Detection

```json
{
  "key": "PF2eVisionerDetection",
  "subject": "self",
  "mode": "set",
  "sense": "tremorsense",
  "senseRange": 15,
  "acuity": "imprecise"
}
```

**Effect:** Grants 15-foot imprecise tremorsense.

## Advanced Patterns

### Conditional Filtering

Use `targetFilter` to apply effects only to specific tokens:

```json
{
  "targetFilter": {
    "disposition": "hostile",
    "hasCondition": "prone",
    "actorType": "npc"
  }
}
```

This would only affect hostile NPCs that are prone.

### Stacking Rule Elements

You can combine multiple rule elements on the same item:

```json
{
  "system": {
    "rules": [
      {
        "key": "PF2eVisionerVisibility",
        "subject": "self",
        "observers": "enemies",
        "mode": "set",
        "status": "hidden"
      },
      {
        "key": "PF2eVisionerCover",
        "subject": "self",
        "observers": "enemies",
        "mode": "set",
        "coverLevel": "standard"
      }
    ]
  }
}
```

This grants both hidden status AND standard cover.

### Bidirectional Effects

Use `direction: "bidirectional"` for walls or barriers:

```json
{
  "key": "PF2eVisionerCover",
  "direction": "bidirectional",
  "coverLevel": "greater"
}
```

Both sides get cover from each other.

### Toggle Effects

Use `mode: "toggle"` for on/off effects:

```json
{
  "key": "PF2eVisionerVisibility",
  "mode": "toggle",
  "status": "concealed"
}
```

Each application switches between observed and concealed.

## Testing Your Rule Elements

Use the global function to create test items:

```javascript
window.PF2EVisioner.createRuleElementExamples()
```

This creates several example items demonstrating various rule elements.

## Architecture

### Base Class

All rule elements extend `BaseVisionerRuleElement`, which provides:
- Token selection and filtering logic
- Range checking
- Directional relationship handling
- Condition-based filtering
- Common lifecycle management

### Specialized Classes

Each rule element type adds specific functionality:
- **VisibilityRuleElement**: Visibility state calculations
- **CoverRuleElement**: Cover level management
- **DetectionRuleElement**: Sense granting/modification

### Integration

Rule elements integrate with:
- **Visioner API**: Uses public API for state changes
- **Batch Operations**: Optimizes multiple token updates
- **AVS System**: Triggers visibility recalculations
- **PF2e System**: Follows PF2e rule element patterns

## Best Practices

1. **Use Batch Operations**: The system automatically batches updates when possible
2. **Leverage Filters**: Use `targetFilter` to avoid unnecessary computations
3. **Set Appropriate Ranges**: Limit `range` to avoid affecting the entire scene
4. **Choose Correct Direction**: `from` vs `to` determines who gets effects
5. **Handle Duration**: Use `durationRounds` or rely on item duration
6. **Combat-Only Effects**: Use `requiresInitiative` for combat-specific effects
7. **Test Thoroughly**: Use example items to verify behavior

## Custom Visioner Roll Options

Visioner automatically injects custom roll options that expose module state for use in predicates. These make it easy to create context-aware effects.

### Quick Reference

#### Visibility Options
- `visioner:visibility:as-target:{state}` - How observers see this token
- `visioner:visibility:hidden-to-any` - Hidden from at least one observer
- `visioner:visibility:concealed-to-any` - Concealed or worse to anyone

#### Cover Options
- `visioner:cover:as-target:{level}` - Cover level (lesser/standard/greater)
- `visioner:cover:has-any` - Has cover from at least one observer
- `visioner:cover:standard-or-better` - Standard+ cover from anyone

#### Sense Options
- `visioner:sense:{type}` - Has specific sense (darkvision, tremorsense, etc.)
- `visioner:sense:{type}:{acuity}` - Sense with acuity (precise/imprecise/vague)
- `visioner:sense:darkvision-any` - Has any darkvision variant

#### AVS Options
- `visioner:avs:enabled` - AVS is currently enabled
- `visioner:avs:mode:{mode}` - Current AVS mode

#### Lighting Options
- `visioner:lighting:darkness:{level}` - Darkness level (none/partial/complete)
- `visioner:lighting:token:has-light` - Token emits light

### Quick Examples

**+2 Stealth when hidden:**
```json
{
  "key": "FlatModifier",
  "selector": "stealth",
  "value": 2,
  "predicate": ["visioner:visibility:hidden-to-any"]
}
```

**Grant darkvision in darkness:**
```json
{
  "key": "PF2eVisionerDetection",
  "sense": "darkvision",
  "senseRange": 60,
  "predicate": [
    "visioner:lighting:darkness:complete",
    "not:visioner:sense:darkvision-any"
  ]
}
```

**AC bonus with cover:**
```json
{
  "key": "FlatModifier",
  "selector": "ac",
  "value": 2,
  "predicate": ["visioner:cover:standard-or-better"]
}
```

For complete documentation on all custom roll options, see [CUSTOM_ROLL_OPTIONS.md](./CUSTOM_ROLL_OPTIONS.md).

## Integration with Visioner Systems

Rule elements are **fully integrated** with Visioner's core systems and automatically apply during gameplay:

### Auto-Visibility System (AVS)
- Rule elements checked during visibility calculations
- Modifiers applied to base visibility results
- Works with batch processing for optimal performance
- Example: Item grants concealment in dim light via predicate

### Cover System
- Rule elements checked when setting/calculating cover
- Modifiers applied to cover levels
- Works with both auto-cover and manual cover
- Example: Feat grants permanent standard cover via rule element

### Detection/Senses
- Rule elements modify senses via PF2e's lifecycle
- Conditional sense grants based on predicates
- Example: Grant darkvision only in darkness

### Performance
- Rule elements cached per token (1-second TTL)
- Invalidated automatically when effects/items change
- Negligible overhead when tokens have no rule elements
- Batch-optimized for AVS processing

For detailed integration documentation, see [INTEGRATION.md](./INTEGRATION.md).

## Troubleshooting

### Rule Element Not Working

1. Check that PF2e system is loaded
2. Verify the rule element is registered (check console on load)
3. Ensure all required properties are set
4. Check for typos in property names
5. Verify targets exist and are valid

### Effects Not Applying

1. Check `requiresInitiative` if in combat
2. Verify `range` isn't excluding targets
3. Check `targetFilter` conditions
4. Ensure API is available (`window.PF2EVisioner.api`)

### Predicates Not Triggering

1. Check custom roll option names (case-sensitive)
2. Verify token context exists
3. Debug with `ruleElement.getRollOptions()`
4. Check predicate syntax (AND/OR/NOT)
5. See [CUSTOM_ROLL_OPTIONS.md](./CUSTOM_ROLL_OPTIONS.md) for debugging tips

### Performance Issues

1. Limit `range` to reasonable values
2. Use specific `observers` instead of `all`
3. Add appropriate `targetFilter` conditions
4. Avoid overlapping rule elements

## Future Rule Elements

Planned rule elements include:
- **PF2eVisionerLight**: Modify light perception
- **PF2eVisionerAVS**: Configure AVS behavior
- **PF2eVisionerWall**: Modify wall interactions

## Contributing

When adding new rule elements:
1. Extend `BaseVisionerRuleElement`
2. Add specialized schema properties
3. Implement lifecycle hooks
4. Add i18n keys to `lang/en.json`
5. Update this README with examples
6. Add to registration in `index.js`
7. Create comprehensive tests
