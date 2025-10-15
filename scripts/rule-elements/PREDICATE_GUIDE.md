# Predicate System Guide for Rule Elements

## Overview

All PF2E Visioner rule elements now support PF2e's predicate system. This allows you to conditionally apply effects based on roll options, conditions, traits, and other game state.

## What Are Predicates?

Predicates are conditional statements that determine when a rule element should apply. They use the same system as PF2e's core rule elements, making them familiar to anyone who has worked with PF2e automation.

### Basic Syntax

Predicates are arrays of strings or objects that must all be true for the rule element to apply.

```json
{
  "predicate": ["condition:prone", "enemy"]
}
```

This applies only when the target is prone AND an enemy.

## Predicate Operators

### Simple String Match

```json
["self:condition:prone"]
```

Checks if the actor has the "prone" condition.

### Negation (NOT)

```json
["not:self:condition:prone"]
```

Applies when the actor does NOT have the prone condition.

### OR Operator

```json
[
  {
    "or": ["self:condition:blinded", "self:condition:dazzled"]
  }
]
```

Applies when the actor has EITHER blinded OR dazzled.

### AND Operator

```json
[
  {
    "and": ["self:condition:prone", "target:enemy"]
  }
]
```

Both conditions must be true (though top-level array already uses AND).

### Complex Combinations

```json
[
  "self:condition:hidden",
  {
    "or": ["target:enemy", "target:hostile"]
  },
  "not:target:condition:blinded"
]
```

## Common Roll Options

### Actor/Self Options

- `self:condition:{slug}` - Actor has a condition
- `self:trait:{trait}` - Actor has a trait
- `self:type:{type}` - Actor type (character, npc, hazard, vehicle)
- `self:level:{number}` - Actor level
- `self:dying` - Actor is dying
- `self:wounded` - Actor is wounded
- `self:invisible` - Actor is invisible

### Target Options

- `target:condition:{slug}` - Target has a condition
- `target:trait:{trait}` - Target has a trait
- `target:enemy` - Target is an enemy
- `target:ally` - Target is an ally
- `target:type:{type}` - Target type

### Combat Options

- `combat` - In active combat
- `turn:own` - On the actor's turn
- `turn:other` - Not on the actor's turn
- `initiative` - Initiative tracker is active

### Attack Options

- `attack:melee` - Melee attack
- `attack:ranged` - Ranged attack
- `attack:spell` - Spell attack
- `attack:strike` - Strike attack

### Terrain/Environment

- `terrain:difficult` - On difficult terrain
- `terrain:hazardous` - On hazardous terrain
- `lighting:bright` - In bright light
- `lighting:dim` - In dim light
- `lighting:darkness` - In darkness

### Visioner-Specific Options

Rule elements automatically add these:

- `rule-element:pf2e-visioner` - Always present
- `rule-element:{ClassName}` - Specific rule element type
- `mode:{mode}` - Current mode (set, increase, etc.)
- `direction:{direction}` - Current direction (from, to, bidirectional)
- `subject:{subject}` - Subject type (self, target, etc.)
- `observers:{observers}` - Observer type (all, enemies, etc.)
- `in-combat` - When requiresInitiative is true and in combat

## Practical Examples

### 1. Hide Only When Prone

```json
{
  "key": "PF2eVisionerVisibility",
  "subject": "self",
  "observers": "enemies",
  "mode": "set",
  "status": "hidden",
  "predicate": ["self:condition:prone"]
}
```

### 2. Cover Only Against Ranged Attacks

```json
{
  "key": "PF2eVisionerCover",
  "subject": "self",
  "observers": "enemies",
  "mode": "set",
  "coverLevel": "standard",
  "predicate": ["attack:ranged"]
}
```

### 3. See Invisibility (Conditional on Target)

```json
{
  "key": "PF2eVisionerVisibility",
  "subject": "self",
  "observers": "all",
  "direction": "to",
  "mode": "decrease",
  "steps": 2,
  "predicate": ["target:condition:invisible"]
}
```

### 4. Darkvision Only in Darkness

```json
{
  "key": "PF2eVisionerDetection",
  "subject": "self",
  "mode": "set",
  "sense": "darkvision",
  "senseRange": 60,
  "predicate": [
    {
      "or": ["lighting:dim", "lighting:darkness"]
    }
  ]
}
```

### 5. Hide From Blinded Enemies Only

```json
{
  "key": "PF2eVisionerVisibility",
  "subject": "self",
  "observers": "enemies",
  "mode": "set",
  "status": "hidden",
  "predicate": ["target:condition:blinded"]
}
```

### 6. Increased Concealment When Dazzled

```json
{
  "key": "PF2eVisionerVisibility",
  "subject": "self",
  "observers": "all",
  "direction": "from",
  "mode": "increase",
  "steps": 1,
  "predicate": ["target:condition:dazzled"]
}
```

### 7. Combat-Only Defensive Cover

```json
{
  "key": "PF2eVisionerCover",
  "subject": "self",
  "observers": "enemies",
  "mode": "set",
  "coverLevel": "standard",
  "predicate": ["combat", "not:turn:own"],
  "requiresInitiative": true
}
```

### 8. Condition-Based Tremorsense

```json
{
  "key": "PF2eVisionerDetection",
  "subject": "self",
  "mode": "set",
  "sense": "tremorsense",
  "senseRange": 30,
  "acuity": "imprecise",
  "predicate": ["self:condition:stone-form"]
}
```

### 9. Ally-Only Visibility Boost

```json
{
  "key": "PF2eVisionerVisibility",
  "subject": "self",
  "observers": "allies",
  "direction": "from",
  "mode": "decrease",
  "steps": 1,
  "predicate": ["target:ally", "not:target:condition:blinded"]
}
```

### 10. Multi-Condition Stealth Boost

```json
{
  "key": "PF2eVisionerVisibility",
  "subject": "self",
  "observers": "enemies",
  "mode": "set",
  "status": "hidden",
  "predicate": [
    "self:condition:prone",
    {
      "or": ["lighting:dim", "lighting:darkness"]
    },
    "not:target:condition:blind-fight"
  ]
}
```

## Advanced Patterns

### Combining Predicates with Filters

```json
{
  "key": "PF2eVisionerVisibility",
  "subject": "self",
  "observers": "enemies",
  "mode": "set",
  "status": "hidden",
  "range": 30,
  "targetFilter": {
    "disposition": "hostile",
    "actorType": "character"
  },
  "predicate": ["self:condition:invisible", "not:target:condition:see-invisibility"]
}
```

This combines:

- Range limit (30 feet)
- Target filter (hostile player characters)
- Predicate (I'm invisible and target can't see invisibility)

### Stacking Multiple Predicates

```json
{
  "system": {
    "rules": [
      {
        "key": "PF2eVisionerVisibility",
        "mode": "set",
        "status": "concealed",
        "predicate": ["lighting:dim"]
      },
      {
        "key": "PF2eVisionerVisibility",
        "mode": "set",
        "status": "hidden",
        "predicate": ["lighting:darkness", "not:target:sense:darkvision"]
      }
    ]
  }
}
```

First rule applies in dim light (concealed).
Second rule applies in darkness to targets without darkvision (hidden).

### Dynamic Sense Granting

```json
[
  {
    "key": "PF2eVisionerDetection",
    "sense": "darkvision",
    "senseRange": 60,
    "predicate": ["self:heritage:dwarf"]
  },
  {
    "key": "PF2eVisionerDetection",
    "sense": "low-light-vision",
    "senseRange": 999,
    "predicate": ["self:heritage:elf"]
  }
]
```

Grants different senses based on heritage.

### Conditional Cover

```json
{
  "key": "PF2eVisionerCover",
  "coverLevel": "standard",
  "predicate": ["self:action:take-cover", "not:target:condition:true-seeing"],
  "durationRounds": 1
}
```

Cover only applies if you used Take Cover and target doesn't have true seeing.

## Fallback Behavior

If PF2e's Predicate system is not available, the rule element uses a simplified fallback:

1. Checks simple string matches (e.g., `"self:condition:prone"`)
2. Supports `not:` prefix for negation
3. Supports `or` and `and` operators in objects

This ensures compatibility even if PF2e's predicate implementation changes.

## Best Practices

### 1. Start Simple

Begin with simple predicates and add complexity as needed:

```json
["self:condition:prone"] // Good starting point
```

### 2. Use Negation Carefully

Negations can be confusing. Document why you're using them:

```json
[
  "self:invisible",
  "not:target:sense:see-invisibility" // Target can't see invisible
]
```

### 3. Combine with Target Filters

Use predicates for dynamic conditions, filters for static properties:

```json
{
  "targetFilter": {
    "actorType": "character", // Static: always player characters
    "range": 30 // Static: always 30 feet
  },
  "predicate": [
    "target:condition:blinded" // Dynamic: only when blinded
  ]
}
```

### 4. Test Incrementally

Add one predicate statement at a time and test:

```json
// Test 1
["self:condition:prone"]

// Test 2 (add more)
["self:condition:prone", "lighting:dim"]

// Test 3 (add OR)
["self:condition:prone", {"or": ["lighting:dim", "lighting:darkness"]}]
```

### 5. Document Complex Predicates

Add comments in your item descriptions:

```json
{
  "description": {
    "value": "<p>Provides concealment when prone in dim light or darkness.</p>"
  },
  "predicate": ["self:condition:prone", { "or": ["lighting:dim", "lighting:darkness"] }]
}
```

## Debugging Predicates

### Check Roll Options

In the console:

```javascript
// Get actor's roll options
const actor = canvas.tokens.controlled[0]?.actor;
const options = actor?.getRollOptions(['all']);
console.log(Array.from(options));
```

### Test Predicates Manually

```javascript
const predicate = ['self:condition:prone', 'lighting:dim'];
const options = new Set(['self:condition:prone', 'lighting:dim', 'combat']);

const result = game.pf2e.Predicate.test(predicate, options);
console.log('Predicate result:', result); // true
```

### Enable Rule Element Logging

Check the PF2e system settings for rule element debugging to see when predicates succeed/fail.

## Common Pitfalls

### 1. Typos in Condition Slugs

```json
["self:condition:prone"]      // ✅ Correct
["self:condition:Prone"]      // ❌ Wrong (case sensitive)
["self:condition:proned"]     // ❌ Wrong (not a real slug)
```

### 2. Missing Colons

```json
["self:condition:prone"]      // ✅ Correct
["selfconditionprone"]        // ❌ Wrong
["self-condition-prone"]      // ❌ Wrong
```

### 3. Confusing AND vs OR

```json
// This requires BOTH conditions (implicit AND)
["self:prone", "target:enemy"]

// This requires EITHER condition (explicit OR)
[{"or": ["self:prone", "target:enemy"]}]
```

### 4. Predicate Order Doesn't Matter

```json
["a", "b", "c"]  // Same as...
["c", "b", "a"]  // ...this
```

All top-level array elements are AND-ed together regardless of order.

## Future Enhancements

Planned features for predicate support:

1. **Visual Editor**: UI for building predicates without JSON
2. **Predicate Templates**: Pre-made predicates for common scenarios
3. **Testing Tools**: In-game predicate tester
4. **Auto-Complete**: Suggest valid roll options
5. **Validation**: Warn about typos or invalid options

## Conclusion

Predicates make rule elements incredibly powerful and flexible. They allow you to create dynamic, context-aware effects that respond to the game state, just like PF2e's core automation.

Start simple, test incrementally, and gradually build more complex conditional logic as you become comfortable with the system.
