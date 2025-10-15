# Rule Elements - Quick Start Guide

Get started with Visioner rule elements in 5 minutes!

## What Are Rule Elements?

Rule elements let you create custom visibility, cover, and detection abilities on items, feats, and effects. They're the same system PF2e uses for everything else, but specifically for Visioner features.

## Three Types

| Type           | Key                   | What It Does                                         |
| -------------- | --------------------- | ---------------------------------------------------- |
| **Visibility** | `visioner-visibility` | Control how others see you (concealed, hidden, etc.) |
| **Cover**      | `visioner-cover`      | Control cover bonuses (lesser, standard, greater)    |
| **Detection**  | `visioner-detection`  | Grant special senses (darkvision, tremorsense, etc.) |

## Your First Rule Element

Let's create a magical cloak that makes you **concealed from enemies within 60 feet**.

### Step 1: Open Your Item

1. Create or open an item in Foundry (like "Shadow Cloak")
2. Click the **Rules** tab
3. Click **+ Add Rule Element**

### Step 2: Add the JSON

Paste this into the rule element:

```json
{
  "key": "visioner-visibility",
  "selector": "all",
  "state": "concealed",
  "range": 60,
  "predicate": ["enemy"]
}
```

### Step 3: Save and Test

1. **Save** the item
2. **Equip** it on a token
3. **Open Token Manager** to see it working
4. **Check visibility** - enemies within 60 feet should see you as concealed!

## Common Patterns

### Pattern 1: Set a State

Forces a specific visibility/cover state:

```json
{
  "key": "visioner-visibility",
  "selector": "all",
  "state": "hidden"
}
```

**Result**: You are hidden from everyone.

---

### Pattern 2: Upgrade State

Improves your state by one level:

```json
{
  "key": "visioner-visibility",
  "selector": "all",
  "modifier": {
    "action": "upgrade",
    "from": "observed",
    "to": "concealed"
  }
}
```

**Result**: If you're observed, you become concealed.

---

### Pattern 3: Grant Cover

Gives you cover bonuses:

```json
{
  "key": "visioner-cover",
  "selector": "all",
  "modifier": {
    "action": "upgrade",
    "from": "none",
    "to": "lesser"
  }
}
```

**Result**: You always have at least lesser cover (+1 AC).

---

### Pattern 4: Grant Senses

Gives you special senses:

```json
{
  "key": "visioner-detection",
  "sense": "darkvision",
  "range": 60,
  "acuity": "precise"
}
```

**Result**: You have 60-foot darkvision.

---

## Using Predicates (Conditions)

Predicates make rule elements conditional. Here are the most useful ones:

### By Relationship

```json
"predicate": ["enemy"]      // Only affects enemies
"predicate": ["ally"]       // Only affects allies
```

### By Distance

```json
"predicate": [
  {"lte": ["visioner:distance", 30]}  // Within 30 feet
]
```

```json
"predicate": [
  {"gte": ["visioner:distance", 60]}  // Beyond 60 feet
]
```

### By Current State

```json
"predicate": ["visioner:visibility:observed"]  // Only when observed
"predicate": ["visioner:cover:none"]           // Only when no cover
```

### By Conditions

```json
"predicate": ["target:condition:prone"]        // Target is prone
"predicate": ["self:condition:hidden"]         // You have hidden condition
```

### Combine Multiple

```json
"predicate": [
  "enemy",
  {"lte": ["visioner:distance", 30]},
  "visioner:cover:none"
]
```

**Result**: Only affects enemies within 30 feet who have no cover.

---

## 5 Ready-to-Use Examples

### 1. Invisibility Cloak

Makes you hidden from everyone:

```json
{
  "key": "visioner-visibility",
  "selector": "all",
  "state": "hidden"
}
```

---

### 2. Tower Shield Mastery

Provides greater cover when you have your shield raised:

```json
{
  "key": "visioner-cover",
  "selector": "all",
  "modifier": {
    "action": "upgrade",
    "to": "greater"
  },
  "predicate": ["self:condition:shield-raised"]
}
```

---

### 3. Sniper's Camouflage

Hidden from enemies beyond 60 feet if you have cover:

```json
{
  "key": "visioner-visibility",
  "selector": "all",
  "state": "hidden",
  "predicate": [
    "enemy",
    { "gte": ["visioner:distance", 60] },
    { "or": ["visioner:cover:lesser", "visioner:cover:standard", "visioner:cover:greater"] }
  ]
}
```

---

### 4. Night Vision Goggles

Grants darkvision 60 feet:

```json
{
  "key": "visioner-detection",
  "sense": "darkvision",
  "range": 60,
  "acuity": "precise"
}
```

---

### 5. Defensive Stance

Upgrades your cover by one step:

```json
{
  "key": "visioner-cover",
  "selector": "all",
  "modifier": {
    "action": "upgrade",
    "from": "none",
    "to": "lesser"
  }
}
```

```json
{
  "key": "visioner-cover",
  "selector": "all",
  "modifier": {
    "action": "upgrade",
    "from": "lesser",
    "to": "standard"
  }
}
```

---

## Key Properties Reference

### Required Properties

| Property   | Description          | Example                 |
| ---------- | -------------------- | ----------------------- |
| `key`      | Type of rule element | `"visioner-visibility"` |
| `selector` | Who it affects       | `"all"`                 |

### Optional Properties

| Property    | Description             | Example                 |
| ----------- | ----------------------- | ----------------------- |
| `state`     | Force a specific state  | `"hidden"`              |
| `modifier`  | Upgrade/downgrade state | `{"action": "upgrade"}` |
| `range`     | Distance limit (feet)   | `60`                    |
| `predicate` | Conditions to match     | `["enemy"]`             |

### Visibility States

From worst (for you) to best:

1. `"observed"` - Normal visibility
2. `"concealed"` - DC +5 to detect, 20% miss chance
3. `"hidden"` - DC +10 to detect, 50% miss chance
4. `"undetected"` - DC +15 to detect, cannot be targeted

### Cover States

From none to best:

1. `"none"` - No cover
2. `"lesser"` - +1 AC
3. `"standard"` - +2 AC, +4 to Stealth
4. `"greater"` - +4 AC, +4 to Stealth

### Modifier Actions

| Action            | What It Does                                  |
| ----------------- | --------------------------------------------- |
| `"set"`           | Force a specific state (overrides everything) |
| `"upgrade"`       | Improve state from one level to another       |
| `"downgrade"`     | Worsen state from one level to another        |
| `{"penalty": -2}` | Flat bonus/penalty to calculations            |

## Troubleshooting

### Not Working?

1. **Check the key** - Must be exactly `visioner-visibility`, `visioner-cover`, or `visioner-detection`
2. **Valid JSON** - Use [JSONLint](https://jsonlint.com/) to validate
3. **Item equipped** - Make sure the item is equipped/active
4. **Check predicates** - Test without predicates first
5. **Look at console** - Press F12 and check for errors

### Testing in Console

Check if your rule element is loaded:

```javascript
const token = canvas.tokens.controlled[0];
const service = game.modules.get('pf2e-visioner').api.getRuleElementService();
const rules = service.getRuleElementsForToken(token);
console.log('Rule elements:', rules);
```

## Next Steps

- **[RULE_ELEMENTS_EXAMPLES.md](./RULE_ELEMENTS_EXAMPLES.md)** - 13 detailed examples with explanations
- **[CUSTOM_ROLL_OPTIONS.md](./CUSTOM_ROLL_OPTIONS.md)** - Complete list of predicates
- **[INTEGRATION.md](./INTEGRATION.md)** - How rule elements work under the hood

## Need Help?

- Check the **examples document** for more complex use cases
- Look at **PF2e's own rule elements** for patterns
- Ask in the Visioner Discord/GitHub discussions

---

## Quick Copy-Paste Templates

### Make Me Harder to See

```json
{
  "key": "visioner-visibility",
  "selector": "all",
  "modifier": {
    "action": "upgrade",
    "penalty": -2
  }
}
```

### Give Me Cover

```json
{
  "key": "visioner-cover",
  "selector": "all",
  "modifier": {
    "action": "upgrade",
    "to": "standard"
  }
}
```

### Grant Me a Sense

```json
{
  "key": "visioner-detection",
  "sense": "darkvision",
  "range": 60,
  "acuity": "precise"
}
```

### Only Affect Enemies

```json
{
  "key": "visioner-visibility",
  "selector": "all",
  "state": "concealed",
  "predicate": ["enemy"]
}
```

### Only Within Range

```json
{
  "key": "visioner-visibility",
  "selector": "all",
  "state": "hidden",
  "range": 30
}
```

---

**Happy Sneaking!** 🥷
