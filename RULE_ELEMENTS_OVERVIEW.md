# Rule Elements System - Overview

A high-level overview of how Visioner's rule element system works.

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User Creates                          │
│          Rule Element on Item/Feat/Effect                │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
         ┌────────────────────┐
         │  Item equipped on  │
         │  Token's Actor     │
         └─────────┬──────────┘
                   │
                   ▼
    ┌──────────────────────────────────┐
    │  RuleElementService extracts     │
    │  all visioner-* rule elements    │
    │  Cache: 1s TTL per token+actor   │
    └──────────────┬───────────────────┘
                   │
       ┌───────────┴───────────┐
       │                       │
       ▼                       ▼
┌─────────────┐         ┌─────────────┐
│ AVS System  │         │   Dialogs   │
│ (Auto Vis)  │         │  (Preview)  │
└──────┬──────┘         └──────┬──────┘
       │                       │
       ▼                       ▼
┌──────────────────────────────────────┐
│  Query RuleElementService:           │
│  - Extract rules from token          │
│  - Test predicates                   │
│  - Apply modifiers                   │
└──────────────┬───────────────────────┘
               │
               ▼
      ┌────────────────┐
      │  Modified      │
      │  State         │
      │  Returned      │
      └────────┬───────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
┌─────────────┐  ┌──────────────┐
│ Write Flags │  │ Show Preview │
│ (AVS/Cover) │  │ (Dialog)     │
└─────────────┘  └──────────────┘
```

## Three Types of Rule Elements

### 1. Visibility Rule Elements

**Purpose**: Control how others see you

**Key**: `visioner-visibility`

**Examples**:

- Invisibility effects
- Camouflage abilities
- Stealth feats
- Environmental concealment

**States** (in order of worse → better for you):

1. `observed` - Normal visibility
2. `concealed` - +5 DC, 20% miss chance
3. `hidden` - +10 DC, 50% miss chance
4. `undetected` - +15 DC, cannot be targeted

---

### 2. Cover Rule Elements

**Purpose**: Control cover bonuses

**Key**: `visioner-cover`

**Examples**:

- Shield abilities
- Defensive stances
- Environmental cover
- Anti-cover feats

**States** (in order of none → best):

1. `none` - No cover
2. `lesser` - +1 AC
3. `standard` - +2 AC, +4 Stealth
4. `greater` - +4 AC, +4 Stealth

---

### 3. Detection Rule Elements

**Purpose**: Grant special senses

**Key**: `visioner-detection`

**Examples**:

- Darkvision
- Tremorsense
- Lifesense
- Echolocation
- Scent

**Acuity**:

- `precise` - Can pinpoint exact location
- `imprecise` - Can detect presence but not exact location
- `vague` - General awareness only

---

## How Modifiers Work

### Set State (Override)

```json
{
  "state": "hidden"
}
```

**Effect**: Forces the state to `hidden`, ignoring current state and all other modifiers.

**Priority**: Highest (overrides everything)

**Use Case**: Absolute effects like "Invisibility"

---

### Upgrade State (Improve)

```json
{
  "modifier": {
    "action": "upgrade",
    "from": "observed",
    "to": "concealed"
  }
}
```

**Effect**: If current state is `observed`, change it to `concealed`. Otherwise, no change.

**Priority**: Medium (applied in order)

**Use Case**: Conditional improvements like "Camouflage in forests"

---

### Downgrade State (Worsen)

```json
{
  "modifier": {
    "action": "downgrade",
    "from": "hidden",
    "to": "concealed"
  }
}
```

**Effect**: If current state is `hidden`, change it to `concealed`. Otherwise, no change.

**Priority**: Medium (applied in order)

**Use Case**: Enemy abilities that reduce your concealment

---

### Penalty/Bonus (Flat Modifier)

```json
{
  "modifier": {
    "penalty": -2
  }
}
```

**Effect**: Applies a -2 penalty to detection/visibility calculations (makes you harder to detect).

**Priority**: Low (cumulative)

**Use Case**: Flat bonuses to Stealth-like abilities

---

## Predicate System

Predicates determine **when** a rule element applies.

### Basic Predicates

```json
"predicate": ["enemy"]  // Only affects enemies
```

### Multiple Conditions (AND)

```json
"predicate": [
  "enemy",
  "visioner:cover:none"
]
// Must be enemy AND have no cover
```

### Multiple Conditions (OR)

```json
"predicate": [
  {"or": [
    "ally",
    "self:condition:helpful"
  ]}
]
// Must be ally OR you have helpful condition
```

### Numeric Comparisons

```json
"predicate": [
  {"gte": ["visioner:distance", 30]}  // Greater than or equal to 30
]
```

```json
"predicate": [
  {"lte": ["visioner:distance", 10]}  // Less than or equal to 10
]
```

---

## Integration Points

### 1. AVS (Auto-Visibility System)

**When**: During batch processing after token movement

**Where**: `BatchProcessor.js`

**What**: Calls `RuleElementService.applyVisibilityModifiers()` for each observer-target pair

**Result**: Modified visibility states are written to flags

---

### 2. Cover System

**When**: When setting cover between tokens

**Where**: `CoverStateManager.js`

**What**: Calls `RuleElementService.applyCoverModifiers()` for each attacker-target pair

**Result**: Modified cover states are written to flags

---

### 3. Action Dialogs

**When**: When computing action outcomes for preview

**Where**: All action handlers (`HideAction.js`, `SeekAction.js`, etc.)

**What**: Uses `getVisibilityBetweenWithRuleElements()` and `getCoverBetweenWithRuleElements()` wrappers

**Result**: Dialog shows modified states in preview (doesn't write to flags until applied)

---

## Data Flow Example

Let's trace a rule element through the system:

### Step 1: Item Created

```json
// On "Shadow Cloak" item
{
  "key": "visioner-visibility",
  "selector": "all",
  "state": "concealed",
  "range": 60,
  "predicate": ["enemy"]
}
```

### Step 2: Item Equipped

- Player equips "Shadow Cloak"
- Item is now on token's actor
- Rule element is ready to be extracted

### Step 3: Token Moves

- Token with cloak moves
- AVS `BatchProcessor` runs
- For each observer looking at cloaked token:

### Step 4: Rule Element Extracted

```javascript
// RuleElementService.getRuleElementsForToken(cloakedToken)
const rules = [
  {
    key: 'visioner-visibility',
    selector: 'all',
    state: 'concealed',
    range: 60,
    predicate: ['enemy'],
  },
];
```

### Step 5: Predicates Tested

```javascript
// For Observer 1 (enemy, 50 feet away)
- "enemy": ✓ Pass (is enemy)
- range: 60: ✓ Pass (50 < 60)
→ Rule applies!

// For Observer 2 (ally, 40 feet away)
- "enemy": ✗ Fail (is ally, not enemy)
→ Rule doesn't apply

// For Observer 3 (enemy, 70 feet away)
- "enemy": ✓ Pass (is enemy)
- range: 60: ✗ Fail (70 > 60)
→ Rule doesn't apply
```

### Step 6: Modifiers Applied

```javascript
// For Observer 1
baseState: "observed"
→ Apply rule: state = "concealed"
→ Final state: "concealed"

// For Observer 2 & 3
baseState: "observed"
→ No rules apply
→ Final state: "observed"
```

### Step 7: States Written

- Observer 1 sees cloaked token as `concealed`
- Observer 2 sees cloaked token as `observed` (ally)
- Observer 3 sees cloaked token as `observed` (out of range)

---

## Performance Considerations

### Caching Strategy

```
┌─────────────────────────────────────┐
│  RuleElementService Cache           │
│  Key: ${token.id}-${actor.uuid}     │
│  TTL: 1000ms (1 second)             │
└─────────────────────────────────────┘
```

**Cache Hit Rate**: Typically >95% during normal gameplay

**Cache Invalidation**: Automatic on item/effect changes via hooks

### Batch Processing

```
Instead of:
┌───────────────────────────────────┐
│ For each observer:                │
│   For each target:                │
│     Extract rules (N×M times)     │
└───────────────────────────────────┘

We do:
┌───────────────────────────────────┐
│ For each observer:                │
│   Extract rules once (cached)     │
│   For each target:                │
│     Test predicates, apply mods   │
└───────────────────────────────────┘
```

**Impact**: Minimal performance overhead (< 1ms per pair)

---

## Custom Roll Options

Rule elements can use these Visioner-specific roll options in predicates:

### Distance

- `visioner:distance:5`
- `visioner:distance:10`
- `visioner:distance:15`
- ... (auto-generated for every 5 feet)

### Direction

- `visioner:direction:observer-to-target`
- `visioner:direction:target-to-observer`

### Visibility States

- `visioner:visibility:observed`
- `visioner:visibility:concealed`
- `visioner:visibility:hidden`
- `visioner:visibility:undetected`

### Cover States

- `visioner:cover:none`
- `visioner:cover:lesser`
- `visioner:cover:standard`
- `visioner:cover:greater`

### Conditions

- `visioner:condition:concealed`
- `visioner:condition:hidden`
- `visioner:condition:undetected`
- `visioner:condition:invisible`
- `visioner:condition:blinded`
- `visioner:condition:flat-footed`

### Senses

- `visioner:sense:darkvision`
- `visioner:sense:low-light-vision`
- `visioner:sense:greater-darkvision`
- `visioner:sense:tremorsense`
- `visioner:sense:lifesense`
- `visioner:sense:echolocation`
- `visioner:sense:scent`

---

## Resolution Order

When multiple rule elements apply to the same pair:

1. **Set State** (highest priority)
   - Overrides everything
   - Only one "set" applies (last one wins)

2. **Upgrade/Downgrade** (medium priority)
   - Applied in order
   - Can stack if targeting different state transitions

3. **Penalties/Bonuses** (lowest priority)
   - Cumulative
   - All applicable penalties stack

### Example Resolution

```javascript
// Rules on token:
Rule 1: state = "hidden"
Rule 2: upgrade "observed" → "concealed"
Rule 3: penalty = -2

// Resolution:
Step 1: Apply "set state" → "hidden"
Step 2: Skip upgrade (state already set)
Step 3: Apply penalty -2 (modifies calculations)

// Final: Token is "hidden" with -2 penalty
```

---

## Error Handling

### Graceful Fallback

```javascript
try {
  const modified = service.applyVisibilityModifiers(observer, target, baseState);
  return modified.state;
} catch (error) {
  console.warn('Rule elements failed:', error);
  return baseState; // Use original state if rule elements fail
}
```

**Philosophy**: Rule elements should enhance, not break, the system.

### Validation

- Invalid JSON → Logged warning, rule ignored
- Missing required fields → Logged warning, rule ignored
- Invalid predicates → Logged warning, rule skipped
- Out of range → Rule doesn't apply (normal behavior)

---

## Testing Strategy

### Unit Tests (60+ tests)

Test `RuleElementService` in isolation:

- Rule extraction
- Predicate testing
- Modifier application
- Cache behavior

### Integration Tests (40+ tests)

Test rule elements with systems:

- AVS integration scenarios
- Cover integration scenarios
- Multiple rule elements
- Edge cases

### System Tests (23+ tests)

Test that systems call the service:

- BatchProcessor calls service
- CoverStateManager calls service
- Action handlers use wrappers

**Total**: 123+ tests covering rule element functionality

---

## When to Use Each Type

### Use Visibility Rule Elements When...

- Creating stealth-enhancing items/feats
- Implementing concealment effects
- Building invisibility or partial invisibility
- Environmental effects (fog, darkness, etc.)

### Use Cover Rule Elements When...

- Creating defensive items/feats
- Implementing shield abilities
- Building environmental cover effects
- Anti-cover abilities (ignoring or reducing cover)

### Use Detection Rule Elements When...

- Granting special senses
- Improving existing senses
- Conditional sense abilities
- Temporary sense effects

---

## Resources

- **[RULE_ELEMENTS_QUICKSTART.md](./RULE_ELEMENTS_QUICKSTART.md)** - Get started in 5 minutes
- **[RULE_ELEMENTS_EXAMPLES.md](./RULE_ELEMENTS_EXAMPLES.md)** - 13 detailed examples
- **[CUSTOM_ROLL_OPTIONS.md](./CUSTOM_ROLL_OPTIONS.md)** - Complete predicate reference
- **[INTEGRATION.md](./INTEGRATION.md)** - Technical integration details
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture

---

## Summary

**Rule elements** let you create custom visibility, cover, and detection abilities using PF2e's rule element system. They:

- ✅ Work consistently across AVS, cover, and dialogs
- ✅ Use predicates for conditional application
- ✅ Cache for performance
- ✅ Gracefully fall back on errors
- ✅ Are fully tested (123+ tests)

**Start with the Quick Start guide**, then explore the examples!
