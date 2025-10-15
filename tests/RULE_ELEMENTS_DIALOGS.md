# Rule Element Integration with Action Dialogs

## Overview

Rule elements are integrated with all action dialog systems to ensure that dialog previews show accurate predictions that account for rule element modifiers.

## Integration Architecture

### Wrapper Functions

Rule element integration uses wrapper functions in `scripts/services/rule-element-aware-utils.js`:

- **`getVisibilityBetweenWithRuleElements(observer, target)`**: Reads visibility state from flags and applies rule element modifiers
- **`getCoverBetweenWithRuleElements(observer, target)`**: Reads cover state from flags and applies rule element modifiers

These wrappers:

1. Call the base store functions (`getVisibilityBetween`, `getCoverBetween`)
2. Query RuleElementService for applicable modifiers
3. Return the modified state

### Action Handler Integration

All action handlers use the rule-element-aware functions when computing outcomes:

#### HideAction (`scripts/chat/services/actions/HideAction.js`)

- Uses `getVisibilityBetweenWithRuleElements` to read current visibility state
- Uses `getCoverBetweenWithRuleElements` to read manual cover for stealth DC calculation
- Ensures Hide dialog shows accurate preview accounting for rule elements

#### ConsequencesAction (`scripts/chat/services/actions/ConsequencesAction.js`)

- Uses `getVisibilityBetweenWithRuleElements` when filtering valid targets
- Ensures Consequence Finder only shows targets that are actually Hidden/Undetected after rule elements

#### DiversionAction (`scripts/chat/services/actions/DiversionAction.js`)

- Uses `getVisibilityBetweenWithRuleElements` to determine current visibility
- Ensures Create a Diversion dialog shows accurate outcomes

#### SeekAction (`scripts/chat/services/actions/SeekAction.js`)

- Uses `getVisibilityBetweenWithRuleElements` to read current state before Seek
- Ensures Seek dialog predictions account for rule elements
- Works correctly with wall detection and special senses

#### SneakAction (`scripts/chat/services/actions/SneakAction.js`)

- Uses `getVisibilityBetweenWithRuleElements` in fallback visibility calculation
- Caches the function at start of `analyzeOutcome` for use in IIFE
- Ensures Sneak dialog shows accurate starting positions

#### PointOutAction (`scripts/chat/services/actions/PointOutAction.js`)

- Uses `getVisibilityBetweenWithRuleElements` when discovering targets
- Uses `getVisibilityBetweenWithRuleElements` in outcome analysis
- Ensures Point Out dialog only shows valid targets and accurate ally states

## How It Works

### Example Flow: Hide Action

1. **User triggers Hide action**
   - Dialog opens, calls `HideActionHandler.analyzeOutcome` for each observer

2. **Outcome computation**

   ```javascript
   // Read current visibility WITH rule elements
   const current = getVisibilityBetweenWithRuleElements(subject, actionData.actor);

   // Read cover for DC adjustment WITH rule elements
   const manualDetected = getCoverBetweenWithRuleElements(subject, hidingToken);
   ```

3. **Rule Element Service applies modifiers**
   - Extracts rule elements from observer's actor
   - Tests predicates
   - Applies visibility/cover modifiers
   - Returns modified state

4. **Dialog displays accurate preview**
   - Shows modified visibility states
   - DC calculations account for rule element cover modifiers
   - Player sees what will actually happen when applying

### Example: Cover-Granting Item

If an observer has an item with a rule element that grants lesser cover to all enemies:

```javascript
{
  "key": "visioner-cover",
  "selector": "all",
  "modifier": {
    "action": "upgrade",
    "from": "none",
    "to": "lesser"
  },
  "predicate": ["enemy"]
}
```

Then when a PC tries to Hide from that observer:

- `getCoverBetweenWithRuleElements` returns `"lesser"` instead of `"none"`
- Hide dialog shows the upgraded DC due to cover
- Player sees accurate prediction before committing

## Testing

### Integration Tests

`tests/integration/rule-elements-dialogs.test.js` verifies:

- **HideAction**: Calls rule-element-aware functions for visibility and cover
- **ConsequencesAction**: Calls rule-element-aware functions for target filtering
- **DiversionAction**: Calls rule-element-aware functions for visibility
- **SeekAction**: Calls rule-element-aware functions for current state
- **SneakAction**: Calls rule-element-aware functions in fallback path
- **PointOutAction**: Calls rule-element-aware functions for target discovery and analysis

### Test Strategy

Tests use mocked rule-element-aware functions to verify:

1. Functions are called with correct parameters
2. Functions are called at the right time (during outcome analysis)
3. Different targets can get different results (rule element specificity)

Tests do NOT verify exact return values because:

- Action handlers have additional processing beyond rule elements
- The important thing is that rule elements are CONSULTED, not that they dictate final outcome
- Final outcomes depend on many factors (feats, roll results, etc.)

## Performance

### Caching

Rule elements are cached by RuleElementService:

- Cache key: `${token.id}-${actor.uuid}`
- TTL: 1000ms (1 second)
- Invalidated on item/effect changes via hooks

### Batch Operations

Dialog outcome computation happens once when dialog opens:

- Each observer analyzed once
- Rule elements extracted once per observer
- Results cached for dialog lifetime

## Key Differences from Core Systems

### AVS and Cover Systems

- **Core systems (AVS, CoverStateManager)**: Write modified states to flags
- **Dialogs**: Read modified states for preview, don't write until user applies

### Consistency

All systems use the same RuleElementService, ensuring:

- Dialogs show same results that AVS/cover will apply
- No surprises when player applies action
- Rule elements work consistently across all features

## Common Patterns

### Reading Current State

```javascript
// CORRECT: Use rule-element-aware function
const current = getVisibilityBetweenWithRuleElements(observer, target);

// WRONG: Direct store read misses rule elements
const current = getVisibilityBetween(observer, target);
```

### Fallback Handling

```javascript
try {
  const service = getRuleElementService();
  const modified = service.applyVisibilityModifiers(observer, target, baseState);
  return modified.state;
} catch (error) {
  console.warn('Failed to apply rule elements:', error);
  return baseState; // Graceful fallback
}
```

## Troubleshooting

### Dialog shows different results than AVS

**Problem**: Dialog preview shows one state, but AVS applies different state

**Cause**: Dialog not using rule-element-aware functions

**Solution**: Update action handler to use `getVisibilityBetweenWithRuleElements` or `getCoverBetweenWithRuleElements`

### Rule elements not applying in dialog

**Problem**: Rule elements work in AVS but not in dialog preview

**Cause**: Mock issue in tests, or predicates not matching dialog context

**Solution**:

1. Check rule element predicates - dialog context might differ from AVS context
2. Verify custom roll options are populated correctly
3. Check RuleElementService cache invalidation

## Related Documentation

- [RULE_ELEMENTS_TESTING.md](./RULE_ELEMENTS_TESTING.md) - Testing architecture
- [INTEGRATION.md](../INTEGRATION.md) - Overall integration architecture
- [CUSTOM_ROLL_OPTIONS.md](../CUSTOM_ROLL_OPTIONS.md) - Available predicates
