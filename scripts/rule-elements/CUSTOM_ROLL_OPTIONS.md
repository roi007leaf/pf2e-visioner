# Custom Visioner Roll Options

## Overview

PF2E Visioner automatically injects custom roll options that expose the module's state (visibility, cover, senses, AVS) for use in predicates. These options make it easy to create context-aware rule elements that respond to Visioner's features.

## Visibility Roll Options

### Per-Token Visibility

**`visioner:visibility:as-target:{state}`**
- How observers see this token
- States: `observed`, `concealed`, `hidden`, `undetected`
- Example: `visioner:visibility:as-target:hidden`

**`visioner:visibility:as-observer:{state}`**
- How this token sees others
- States: `observed`, `concealed`, `hidden`, `undetected`
- Example: `visioner:visibility:as-observer:concealed`

**`visioner:visibility:target:{tokenId}:{state}`**
- Specific token relationship (as target)
- Example: `visioner:visibility:target:abc123:hidden`

**`visioner:visibility:observer:{tokenId}:{state}`**
- Specific token relationship (as observer)
- Example: `visioner:visibility:observer:def456:observed`

### Aggregate Visibility

**`visioner:visibility:hidden-to-any`**
- Token is hidden or undetected to at least one observer
- Useful for: "Apply when I'm hidden from anyone"

**`visioner:visibility:concealed-to-any`**
- Token has concealment or worse to at least one observer
- Includes: concealed, hidden, undetected
- Useful for: "Apply when I have any concealment"

## Cover Roll Options

### Per-Token Cover

**`visioner:cover:as-target:{level}`**
- Cover level between observer and this token (as target)
- Levels: `lesser`, `standard`, `greater`
- Example: `visioner:cover:as-target:standard`

**`visioner:cover:as-observer:{level}`**
- Cover level between this token (as observer) and target
- Levels: `lesser`, `standard`, `greater`
- Example: `visioner:cover:as-observer:greater`

**`visioner:cover:target:{tokenId}:{level}`**
- Specific token relationship (as target)
- Example: `visioner:cover:target:abc123:standard`

**`visioner:cover:observer:{tokenId}:{level}`**
- Specific token relationship (as observer)
- Example: `visioner:cover:observer:def456:lesser`

### Aggregate Cover

**`visioner:cover:has-any`**
- Token has any cover from at least one observer
- Useful for: "Apply when I have cover from someone"

**`visioner:cover:standard-or-better`**
- Token has standard or greater cover from at least one observer
- Useful for: "Only apply with significant cover"

## Sense Roll Options

### Specific Senses

**`visioner:sense:{type}`**
- Actor has this sense
- Types: `darkvision`, `low-light-vision`, `tremorsense`, `scent`, etc.
- Example: `visioner:sense:darkvision`

**`visioner:sense:{type}:{acuity}`**
- Sense with specific acuity
- Acuity: `precise`, `imprecise`, `vague`
- Example: `visioner:sense:tremorsense:imprecise`

**`visioner:sense:{type}:range:{feet}`**
- Sense with specific range
- Example: `visioner:sense:darkvision:range:60`

### Aggregate Senses

**`visioner:sense:darkvision-any`**
- Has any darkvision variant
- Includes: darkvision, greater darkvision
- Useful for: "Doesn't need darkvision spell"

**`visioner:sense:low-light`**
- Has low-light vision
- Useful for: "Can see in dim light"

## AVS (Auto-Visibility System) Roll Options

### AVS State

**`visioner:avs:enabled`**
- AVS is currently enabled
- Useful for: "Only when AVS is active"

**`visioner:avs:disabled`**
- AVS is currently disabled
- Useful for: "Only in manual mode"

**`visioner:avs:mode:{mode}`**
- Current AVS mode
- Modes vary by settings
- Example: `visioner:avs:mode:full`

## Lighting Roll Options

### Global Lighting

**`visioner:lighting:global:bright`**
- Scene has global bright light
- Useful for: "Only in bright scenes"

**`visioner:lighting:global:varies`**
- Scene lighting varies (default)
- Most scenes use this

### Token Light

**`visioner:lighting:token:has-light`**
- This token emits light
- Useful for: "When carrying a torch"

**`visioner:lighting:token:range:{feet}`**
- Token's light range
- Example: `visioner:lighting:token:range:20`

### Darkness Level

**`visioner:lighting:darkness:none`**
- Darkness level < 0.25
- Mostly bright/daylight

**`visioner:lighting:darkness:partial`**
- Darkness level 0.25-0.75
- Dim light / twilight

**`visioner:lighting:darkness:complete`**
- Darkness level >= 0.75
- Full darkness

## Practical Examples

### Example 1: Bonus When Hidden

```json
{
  "key": "FlatModifier",
  "selector": "stealth",
  "value": 2,
  "type": "circumstance",
  "predicate": ["visioner:visibility:hidden-to-any"]
}
```

Grants +2 circumstance to Stealth when hidden from anyone.

### Example 2: Conditional Darkvision

```json
{
  "key": "PF2eVisionerDetection",
  "sense": "darkvision",
  "senseRange": 60,
  "predicate": [
    "visioner:lighting:darkness:partial",
    "not:visioner:sense:darkvision-any"
  ]
}
```

Grants darkvision only in partial darkness and if you don't already have it.

### Example 3: Cover-Dependent AC

```json
{
  "key": "FlatModifier",
  "selector": "ac",
  "value": 2,
  "type": "circumstance",
  "predicate": ["visioner:cover:standard-or-better"]
}
```

+2 AC when you have standard or greater cover.

### Example 4: Hide When Concealed and In Dim Light

```json
{
  "key": "PF2eVisionerVisibility",
  "mode": "set",
  "status": "hidden",
  "predicate": [
    "visioner:visibility:concealed-to-any",
    "visioner:lighting:darkness:partial"
  ]
}
```

Automatically become hidden when you're concealed and in dim light.

### Example 5: Tremorsense-Dependent Detection

```json
{
  "key": "PF2eVisionerVisibility",
  "direction": "to",
  "mode": "decrease",
  "steps": 1,
  "predicate": ["visioner:sense:tremorsense"]
}
```

Better detection when you have tremorsense.

### Example 6: AVS-Only Effect

```json
{
  "key": "PF2eVisionerVisibility",
  "mode": "increase",
  "steps": 1,
  "predicate": [
    "visioner:avs:enabled",
    "visioner:lighting:darkness:complete"
  ]
}
```

Increases concealment in complete darkness, but only when AVS is enabled.

### Example 7: Light-Carrier Bonus

```json
{
  "key": "FlatModifier",
  "selector": "perception",
  "value": 1,
  "predicate": ["visioner:lighting:token:has-light"]
}
```

+1 Perception when carrying light.

### Example 8: Multi-Condition Stealth Boost

```json
{
  "key": "PF2eVisionerVisibility",
  "status": "hidden",
  "predicate": [
    "self:condition:prone",
    "visioner:cover:has-any",
    "visioner:lighting:darkness:partial",
    "not:visioner:visibility:hidden-to-any"
  ]
}
```

Become hidden when prone, with cover, in dim light, and not already hidden.

### Example 9: Sense-Based Cover Negation

```json
{
  "key": "PF2eVisionerCover",
  "mode": "remove",
  "predicate": [
    "visioner:sense:tremorsense:precise",
    "target:condition:on-ground"
  ]
}
```

Ignore cover against grounded targets when you have precise tremorsense.

### Example 10: Conditional Invisibility Detection

```json
{
  "key": "PF2eVisionerVisibility",
  "direction": "to",
  "mode": "set",
  "status": "observed",
  "predicate": [
    "target:condition:invisible",
    "visioner:sense:darkvision-any",
    "visioner:lighting:darkness:complete"
  ]
}
```

Can see invisible creatures in complete darkness if you have darkvision.

## Advanced Patterns

### Combining Multiple Options

```json
{
  "predicate": [
    "visioner:visibility:concealed-to-any",
    "visioner:cover:standard-or-better",
    "visioner:sense:low-light",
    "visioner:lighting:darkness:partial"
  ]
}
```

All conditions must be true (AND logic).

### OR with Multiple Options

```json
{
  "predicate": [
    {
      "or": [
        "visioner:visibility:hidden-to-any",
        "visioner:cover:standard-or-better"
      ]
    }
  ]
}
```

Either hidden OR has good cover.

### Negation Patterns

```json
{
  "predicate": [
    "not:visioner:visibility:hidden-to-any",
    "not:visioner:cover:has-any"
  ]
}
```

Not hidden and no cover (vulnerable).

### Complex Visibility Logic

```json
{
  "predicate": [
    "visioner:visibility:concealed-to-any",
    {
      "or": [
        "visioner:lighting:darkness:partial",
        "visioner:lighting:darkness:complete"
      ]
    },
    "not:visioner:sense:darkvision-any"
  ]
}
```

Concealed, in dim or darkness, without darkvision.

## Integration with PF2e Roll Options

Visioner options work alongside PF2e's native options:

```json
{
  "predicate": [
    "self:condition:prone",
    "visioner:cover:has-any",
    "target:enemy",
    "attack:ranged"
  ]
}
```

Combines:
- PF2e condition (`self:condition:prone`)
- Visioner state (`visioner:cover:has-any`)
- PF2e targeting (`target:enemy`)
- PF2e attack type (`attack:ranged`)

## Dynamic Updates

Visioner roll options are **dynamically generated** each time roll options are requested. This means:

✅ Always reflects current state  
✅ Updates when visibility/cover changes  
✅ Responds to AVS recalculations  
✅ Tracks sense modifications  

No caching issues or stale data!

## Performance

Roll option generation is **highly optimized**:

- Lazy evaluation (only when needed)
- Short-circuit on missing dependencies
- Minimal API calls
- Reuses existing data structures

Adding custom options has **negligible performance impact**.

## Debugging

### View All Roll Options

```javascript
// Get rule element's roll options
const token = canvas.tokens.controlled[0];
const ruleElement = /* your rule element */;
const options = ruleElement.getRollOptions();
console.log(Array.from(options));
```

### Filter Visioner Options

```javascript
const options = ruleElement.getRollOptions();
const visionerOptions = Array.from(options).filter(opt => 
  opt.startsWith('visioner:')
);
console.log(visionerOptions);
```

### Test Specific Option

```javascript
const options = ruleElement.getRollOptions();
const hasOption = options.has('visioner:visibility:hidden-to-any');
console.log('Has option:', hasOption);
```

### View by Category

```javascript
const options = Array.from(ruleElement.getRollOptions());

console.log('Visibility:', options.filter(o => o.startsWith('visioner:visibility:')));
console.log('Cover:', options.filter(o => o.startsWith('visioner:cover:')));
console.log('Senses:', options.filter(o => o.startsWith('visioner:sense:')));
console.log('AVS:', options.filter(o => o.startsWith('visioner:avs:')));
console.log('Lighting:', options.filter(o => o.startsWith('visioner:lighting:')));
```

## Common Pitfalls

### 1. Token Context Required

Custom options require token context. They won't work for effects without a token:

```json
// ❌ Won't have custom options (no token)
{
  "key": "FlatModifier",
  "selector": "ac",
  "value": 2,
  "predicate": ["visioner:cover:has-any"]
}

// ✅ Works (effect on token)
{
  "key": "PF2eVisionerCover",
  "coverLevel": "standard",
  "predicate": ["visioner:cover:has-any"]
}
```

### 2. Case Sensitivity

Options are case-sensitive:

```json
["visioner:visibility:hidden-to-any"]  // ✅ Correct
["Visioner:Visibility:Hidden-To-Any"]  // ❌ Wrong
["visioner:visibility:Hidden-to-any"]  // ❌ Wrong
```

### 3. State vs Capability

Distinguish between what you CAN do vs what IS:

```json
["visioner:sense:darkvision"]          // You HAVE darkvision
["visioner:lighting:darkness:complete"] // It IS dark
```

### 4. Timing

Options reflect state at evaluation time:

```json
// If visibility changes mid-combat, predicates re-evaluate
["visioner:visibility:hidden-to-any"]
```

## Best Practices

### 1. Use Aggregate Options

Prefer aggregate options for simplicity:

```json
// ✅ Simple and clear
["visioner:visibility:hidden-to-any"]

// ❌ Overly specific (unless needed)
["visioner:visibility:target:abc123:hidden"]
```

### 2. Combine with Filters

Use targetFilter for static conditions, predicates for dynamic:

```json
{
  "targetFilter": {
    "actorType": "character"  // Static
  },
  "predicate": [
    "visioner:visibility:hidden-to-any"  // Dynamic
  ]
}
```

### 3. Document Complex Predicates

Add comments explaining what conditions trigger:

```json
{
  "description": {
    "value": "<p>Applies when hidden with cover in dim light</p>"
  },
  "predicate": [
    "visioner:visibility:hidden-to-any",
    "visioner:cover:has-any",
    "visioner:lighting:darkness:partial"
  ]
}
```

### 4. Test Incrementally

Build predicates one option at a time:

```json
// Step 1: Test visibility alone
["visioner:visibility:hidden-to-any"]

// Step 2: Add cover
["visioner:visibility:hidden-to-any", "visioner:cover:has-any"]

// Step 3: Add lighting
[
  "visioner:visibility:hidden-to-any",
  "visioner:cover:has-any",
  "visioner:lighting:darkness:partial"
]
```

## Future Enhancements

Planned additions:

1. **More granular ranges**: `visioner:visibility:within:30:hidden`
2. **Detection mode options**: `visioner:detection:bypassed-by:tremorsense`
3. **Light source types**: `visioner:lighting:source:magical`
4. **Cover types**: `visioner:cover:type:wall` vs `visioner:cover:type:creature`
5. **AVS details**: `visioner:avs:last-update:recent`

## Conclusion

Custom Visioner roll options make predicates **incredibly powerful**. They expose all of Visioner's state in a clean, predictable format that integrates seamlessly with PF2e's predicate system.

You can now create rule elements that respond to:
- ✅ Visibility relationships
- ✅ Cover situations  
- ✅ Active senses
- ✅ AVS state
- ✅ Lighting conditions

Combined with PF2e's native options and targetFilters, this creates an **extremely flexible and powerful** rule element system. 🎉
