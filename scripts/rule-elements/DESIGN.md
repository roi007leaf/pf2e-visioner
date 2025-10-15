# Rule Element System Design

## Overview

The PF2E Visioner Rule Element system provides a comprehensive, modular, and user-friendly way to programmatically control visibility, cover, detection, and other Visioner features through PF2e's rule element system.

## Architecture

### Design Principles

1. **Modular**: Each rule element type handles one specific concern
2. **Composable**: Multiple rule elements can work together on the same item
3. **Generic**: Support all major features without hardcoding specific cases
4. **User-friendly**: Clear schemas with helpful hints and validation
5. **Performant**: Batch operations, cache-aware, avoid redundant work
6. **Safe**: Input validation, loop prevention, graceful degradation

### Component Hierarchy

```
BaseVisionerRuleElement (abstract)
├── Common functionality for all rule elements
├── Token selection & filtering
├── Direction handling
├── Range checking
├── Duration management
└── Lifecycle hooks

Specialized Rule Elements (concrete)
├── VisibilityRuleElement        - Manage visibility states
├── CoverRuleElement              - Manage cover states
├── DetectionRuleElement          - Grant/modify senses
├── LightConditionRuleElement     - Modify light perception
├── AVSConfigRuleElement          - Configure AVS behavior
└── WallInteractionRuleElement    - Modify wall interactions
```

## Schema Design

### Common Schema Properties

All rule elements share these common properties:

#### Target Selection

- `subject`: Who is the primary actor (self, target, controlled, specific-token)
- `observers`: Who observes/interacts with the subject (all, allies, enemies, specific-tokens)
- `targetFilter`: Additional filtering criteria
  - `disposition`: friendly/neutral/hostile/secret
  - `hasCondition`: Filter by condition presence
  - `lackCondition`: Filter by condition absence
  - `actorType`: character/npc/hazard/vehicle
  - `range`: Maximum distance

#### Operation

- `mode`: How to apply the effect (set, increase, decrease, remove, toggle)
- `value`: The specific value to apply
- `steps`: Number of steps for increase/decrease operations

#### Lifecycle

- `trigger`: When to apply (onCreate, onDelete, beforeRoll, afterRoll, onTurnStart, onRoundStart)
- `duration`: How long it lasts
  - `rounds`: Number of combat rounds
  - `minutes`: Number of minutes
  - `encounter`: Until combat ends
  - `permanent`: Doesn't expire
- `requiresInitiative`: Only works in active combat

#### Direction & Effects

- `direction`: Visual relationship (from, to, bidirectional)
- `effectTarget`: Who receives ephemeral effects (subject, observer, both, none)

### Specialized Schemas

#### 1. VisibilityRuleElement

Controls visibility states between tokens.

**Additional Properties:**

- `status`: The visibility state to apply (observed, concealed, hidden, undetected)
- `condition`: Optional condition to apply alongside visibility
- `applyFlatCheck`: Whether to apply flat check effects
- `applyOffGuard`: Whether to apply off-guard condition

**Example:**

```json
{
  "key": "PF2eVisionerVisibility",
  "subject": "self",
  "observers": "enemies",
  "direction": "from",
  "mode": "set",
  "status": "hidden",
  "effectTarget": "subject",
  "duration": { "rounds": 10 },
  "range": 60
}
```

#### 2. CoverRuleElement

Controls cover states between tokens.

**Additional Properties:**

- `coverLevel`: The cover level to apply (none, lesser, standard, greater)
- `applyBonuses`: Whether to apply AC/Reflex bonuses
- `allowHide`: Whether this cover allows Hide action

**Example:**

```json
{
  "key": "PF2eVisionerCover",
  "subject": "self",
  "observers": "all",
  "direction": "from",
  "mode": "set",
  "coverLevel": "standard",
  "applyBonuses": true,
  "duration": { "encounter": true }
}
```

#### 3. DetectionRuleElement

Grants or modifies detection capabilities (senses).

**Additional Properties:**

- `sense`: The sense to grant/modify (darkvision, low-light-vision, tremorsense, etc.)
- `range`: Range of the granted sense
- `acuity`: Acuity level (precise, imprecise, vague)
- `modifyExisting`: Whether to modify an existing sense or grant a new one

**Example:**

```json
{
  "key": "PF2eVisionerDetection",
  "subject": "self",
  "mode": "set",
  "sense": "darkvision",
  "range": 60,
  "acuity": "precise",
  "duration": { "minutes": 10 }
}
```

#### 4. LightConditionRuleElement

Modifies how tokens perceive light conditions.

**Additional Properties:**

- `lightLevel`: Override light level perception (bright, dim, darkness, magical-darkness)
- `ignoreLight`: Ignore natural light conditions
- `ignoreDarkness`: Ignore natural darkness

**Example:**

```json
{
  "key": "PF2eVisionerLight",
  "subject": "self",
  "mode": "set",
  "lightLevel": "bright",
  "duration": { "rounds": 1 }
}
```

#### 5. AVSConfigRuleElement

Configures automatic visibility system behavior.

**Additional Properties:**

- `enableAVS`: Enable/disable AVS for specific tokens
- `avsMode`: AVS computation mode (full, fast, manual)
- `updateFrequency`: How often to update (immediate, throttled, manual)

**Example:**

```json
{
  "key": "PF2eVisionerAVS",
  "subject": "self",
  "mode": "set",
  "enableAVS": false,
  "duration": { "permanent": true }
}
```

#### 6. WallInteractionRuleElement

Modifies how tokens interact with walls.

**Additional Properties:**

- `seeThrough`: See through specific wall types
- `hearThrough`: Hear through specific wall types
- `wallTypes`: Which wall types are affected (sight, sound, move, light)

**Example:**

```json
{
  "key": "PF2eVisionerWall",
  "subject": "self",
  "mode": "set",
  "seeThrough": true,
  "wallTypes": ["sight"],
  "duration": { "minutes": 1 }
}
```

## Implementation Guidelines

### Base Class Pattern

```javascript
class BaseVisionerRuleElement extends game.pf2e.RuleElement {
  static defineSchema() {
    return {
      // Common properties defined here
      subject: new fields.StringField({ choices: [...], initial: 'self' }),
      observers: new fields.StringField({ choices: [...], initial: 'all' }),
      // ... etc
    };
  }

  // Common methods
  getTokensForSubject() { /* ... */ }
  getTokensForObservers() { /* ... */ }
  filterByRange(tokens, origin) { /* ... */ }
  filterByCondition(tokens, condition) { /* ... */ }
  checkDirection(observer, subject) { /* ... */ }

  // Lifecycle hooks (to be overridden)
  onCreate(actorUpdates) { /* ... */ }
  onDelete(actorUpdates) { /* ... */ }
  beforeRoll(domains, rollOptions) { /* ... */ }
  afterRoll({ roll, domains }) { /* ... */ }
  onUpdateEncounter({ event }) { /* ... */ }
}
```

### Specialized Class Pattern

```javascript
class VisibilityRuleElement extends BaseVisionerRuleElement {
  static defineSchema() {
    const schema = super.defineSchema();

    // Add specialized properties
    schema.status = new fields.StringField({
      choices: ['observed', 'concealed', 'hidden', 'undetected'],
      initial: 'hidden',
    });

    return schema;
  }

  // Implement specific logic
  async applyVisibilityChange() {
    const { sourceTokens, targetTokens } = this.getDirectionalTokens();

    // Use API for batch operations
    await api.bulkSetVisibility(updates, options);
  }
}
```

## Usage Examples

### Example 1: Hide Action

```json
{
  "name": "Hide",
  "type": "effect",
  "system": {
    "rules": [
      {
        "key": "PF2eVisionerVisibility",
        "subject": "self",
        "observers": "enemies",
        "direction": "from",
        "mode": "set",
        "status": "hidden",
        "effectTarget": "subject",
        "duration": { "rounds": 10 }
      }
    ]
  }
}
```

### Example 2: See Invisibility Spell

```json
{
  "name": "See Invisibility",
  "type": "effect",
  "system": {
    "rules": [
      {
        "key": "PF2eVisionerVisibility",
        "subject": "self",
        "observers": "all",
        "direction": "to",
        "mode": "decrease",
        "steps": 2,
        "targetFilter": {
          "hasCondition": "invisible"
        },
        "duration": { "minutes": 10 }
      }
    ]
  }
}
```

### Example 3: Create Cover

```json
{
  "name": "Wall of Stone",
  "type": "effect",
  "system": {
    "rules": [
      {
        "key": "PF2eVisionerCover",
        "subject": "self",
        "observers": "all",
        "direction": "bidirectional",
        "mode": "set",
        "coverLevel": "greater",
        "applyBonuses": true,
        "allowHide": true,
        "duration": { "permanent": true }
      }
    ]
  }
}
```

### Example 4: Grant Darkvision

```json
{
  "name": "Darkvision Spell",
  "type": "effect",
  "system": {
    "rules": [
      {
        "key": "PF2eVisionerDetection",
        "subject": "target",
        "mode": "set",
        "sense": "darkvision",
        "range": 60,
        "acuity": "precise",
        "duration": { "minutes": 10 }
      }
    ]
  }
}
```

### Example 5: Blur Vision (Blinded-like effect)

```json
{
  "name": "Blur Vision",
  "type": "effect",
  "system": {
    "rules": [
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
        "duration": { "rounds": 5 }
      }
    ]
  }
}
```

## Technical Considerations

### Performance

1. **Batch Operations**: Always use bulk APIs when affecting multiple tokens
2. **Cache Awareness**: Clear relevant caches when rule elements change
3. **Debouncing**: Prevent rapid re-application of the same rule element
4. **Early Exit**: Check for no-op cases before doing expensive work

### Safety

1. **Loop Prevention**: Track recent changes with timestamps
2. **Validation**: Validate all inputs against schema
3. **Graceful Degradation**: Fail silently with warnings, don't break gameplay
4. **Permission Checks**: Respect user permissions for all operations

### Compatibility

1. **API Usage**: Only use public Visioner API, not internal functions
2. **PF2e Integration**: Follow PF2e rule element patterns
3. **Foundry Best Practices**: Use standard Foundry patterns and hooks
4. **Module Conflicts**: Namespace everything, avoid global pollution

## Migration Path

### Phase 1: Base Infrastructure

- Create BaseVisionerRuleElement class
- Refactor existing VisibilityRuleElement to use base
- Add common utilities and services

### Phase 2: Core Rule Elements

- Implement CoverRuleElement
- Implement DetectionRuleElement
- Add comprehensive tests

### Phase 3: Advanced Rule Elements

- Implement LightConditionRuleElement
- Implement AVSConfigRuleElement
- Implement WallInteractionRuleElement

### Phase 4: Polish & Documentation

- Add example compendium
- Write user documentation
- Add migration tools for existing rule elements
