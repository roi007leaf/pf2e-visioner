# Rule Elements - Practical Examples

This guide shows practical examples of how to create and use Visioner rule elements in your PF2e items, feats, and effects.

## ⚠️ Important: Rule Element Keys and Format

### Correct Keys

The rule element keys must be **PascalCase**, not kebab-case:

- ✅ `"PF2eVisionerCover"`
- ❌ `"visioner-cover"`
- ✅ `"PF2eVisionerVisibility"`
- ❌ `"visioner-visibility"`
- ✅ `"PF2eVisionerDetection"`
- ❌ `"visioner-detection"`

### JSON Format

Foundry VTT's rule element editor requires compact JSON without line breaks:

**✅ Correct (copy this into Foundry):**

```json
{"key":"PF2eVisionerCover","mode":"set","coverLevel":"lesser"}
```

**❌ Incorrect (will error):**

```json
{
  "key": "PF2eVisionerCover",
  "mode": "set"
}
```

### Where to Add Rule Elements

Rule elements must be added to **items on actors**, not directly to actors:

- ✅ **Effects** - Create a custom effect and add the rule element
- ✅ **Feats** - Add to existing or custom feats
- ✅ **Equipment** - Add to weapons, armor, or other gear
- ✅ **Stances** - Add to stance feats or stance effects
- ❌ **Actor directly** - This won't work

### How Rule Elements Work

Rule elements automatically apply during:

- ✅ **Attack rolls** - Modifies cover/visibility during strikes
- ✅ **Auto-cover detection** - Integrates with automatic cover system
- ✅ **Check dialogs** - Shows modified cover/visibility in roll dialogs
- ❌ **Manual overrides** - Rule elements don't apply to manually set states

**Important**: The effect/feat/item containing the rule element must be **active** (not expired) for it to apply.

### Understanding Direction and Targets

**WHO has the rule element matters!**

- **Observer** - The token looking/attacking
- **Target** - The token being looked at/attacked

**Example**: Blur spell makes the TARGET concealed, so the rule element goes **on the target's effect**:

```json
{"key":"PF2eVisionerVisibility","mode":"set","status":"concealed","qualifyConcealment":false}
```

When Observer attacks Target:

1. System checks Observer's rule elements (e.g., abilities that let them ignore cover)
2. System checks Target's rule elements (e.g., Blur makes them concealed)
3. Both sets of rules apply and combine

**Direction Property** controls which tokens the rule element affects:

- `"direction":"both"` - Applies regardless of who is observer/target (default)
- `"direction":"from"` - Only applies when this token is the observer
- `"direction":"to"` - Only applies when this token is the target

---

## Table of Contents

- [Basic Visibility Rule Elements](#basic-visibility-rule-elements)
- [Basic Cover Rule Elements](#basic-cover-rule-elements)
- [Detection Rule Elements](#detection-rule-elements)
- [Using Predicates](#using-predicates)
- [Complex Examples](#complex-examples)
- [Common Use Cases](#common-use-cases)

---

## Basic Visibility Rule Elements

### Example 1: Always Hidden

**Use Case**: A magical cloak that makes you hidden from all observers.

**For Foundry VTT (copy this):**

```json
{"key":"PF2eVisionerVisibility","mode":"set","status":"hidden"}
```

**Readable format:**

```json
{
  "key": "PF2eVisionerVisibility",
  "mode": "set",
  "status": "hidden"
}
```

**What it does:**

- Forces visibility state to `hidden` from all observers
- Always active (no predicates)
- Overrides auto-visibility detection
- Targets can still be attacked but attackers are off-guard

**Where to add it:** On a magical cloak item or a condition effect.

---

### Example 2: Upgrade Visibility by One Step

**Use Case**: An ability that makes you harder to see, upgrading visibility by one level.

**For Foundry VTT (copy this):**

```json
{"key":"PF2eVisionerVisibility","mode":"increase","steps":1}
```

**Readable format:**

```json
{
  "key": "PF2eVisionerVisibility",
  "mode": "increase",
  "steps": 1
}
```

**What it does:**

- Upgrades visibility by 1 step: observed → concealed → hidden → undetected
- Stacks with existing concealment/cover
- Works automatically

**Where to add it:** On a feat, spell effect, or stance.

---

### Example 3: Qualify for Sneak/Hide While Observed

**Use Case**: Obscuring mist, smokesticks, or environmental effects that let you use Sneak/Hide actions WITHOUT actually making you concealed (no flat check).

**For Foundry VTT (copy this):**

```json
{"key":"PF2eVisionerVisibility","mode":"set","status":"observed","qualifyConcealment":true}
```

**Readable format:**

```json
{
  "key": "PF2eVisionerVisibility",
  "mode": "set",
  "status": "observed",
  "qualifyConcealment": true
}
```

**What it does:**

- ✅ Keeps visibility as **observed** (attackers target normally, no flat check)
- ✅ **Qualifies for Sneak and Hide actions** despite being observed
- ✅ Works with Sneak/Hide dialogs and action prerequisites
- ✅ Meets concealment requirement without actual concealment
- ✅ No AC bonus (purely for action prerequisites)

**Common scenarios:**

- **Obscuring Mist** - Visual obstruction but not true cover
- **Smokesticks/Smoke Bombs** - Creates obscurement for sneaking
- **Environmental Effects** - Thick fog, heavy rain, sandstorm
- **Magical Obscurement** - Effects that don't provide mechanical protection

**How it works:**

The system checks for `qualifyConcealment` when you attempt Sneak/Hide actions. If `true`, you're treated as **concealed for action prerequisites only** (you can Hide/Sneak), but remain **observed for targeting** (no flat check to hit you).

**Note**: This is different from actual concealment - you remain fully visible for targeting purposes, but you qualify for stealth actions as if concealed. Set to `true` for this effect (see Example 4 for `false` behavior).

**Where to add it:** On spell effects (Obscuring Mist), consumables (Smokestick), or environmental conditions (Fog).

---

### Example 4: Concealed But Can't Hide (Blur Spell)

**Use Case**: Blur spell - target is concealed for attacks (flat check) but location is obvious so can't Hide/Sneak.

**IMPORTANT**: This rule element goes on the **Blur spell effect on the TARGET**, not on the observer!

**For Foundry VTT (copy this):**

```json
{"key":"PF2eVisionerVisibility","mode":"set","status":"concealed","qualifyConcealment":false}
```

**Readable format:**

```json
{
  "key": "PF2eVisionerVisibility",
  "mode": "set",
  "status": "concealed",
  "qualifyConcealment": false
}
```

**What it does:**

- ✅ Sets visibility to **concealed** (attackers get flat check to target)
- ✅ **Prevents Sneak and Hide actions** despite being concealed
- ✅ Location remains obvious for gameplay purposes

**Step-by-step setup:**

1. Find or create the "Blur" spell effect in PF2e system
2. Edit the effect and go to the Rules tab
3. Add a new rule element
4. Copy-paste the JSON above into the rule element editor
5. Save the effect
6. Apply the Blur effect to a token
7. When anyone attacks that token, they see concealment (flat check)
8. But that token CANNOT use Hide or Sneak actions

**Common scenarios:**

- ✅ Full concealment benefits for defense (flat check)
- ✅ Blocks stealth action prerequisites

**Common scenarios:**

- **Blur Spell** - Form appears blurry but location obvious
- **Displacement** - Image displaced but position known
- **Mirror Image** - Duplicates confuse attacks but not location
- **Illusory appearance** - Visual distortion without true hiding

**How it works:**

The system checks for `qualifyConcealment` when you attempt Sneak/Hide actions. If `false`, you're treated as **observed for action prerequisites** (can't Hide/Sneak), but remain **concealed for targeting** (flat check to hit you).

**Note**: `qualifyConcealment` has three states:

- `true` = Qualify when observed (obscuring mist)
- `false` = Disqualify when concealed (blur)
- `null` / omitted = Normal rules apply

**Where to add it:** On spell effects (Blur, Displacement, Mirror Image), or items that create visual distortion.

---

### Example 5: Harder to Detect (Detection Modifier)

**Use Case**: A feat that makes you harder to detect (future feature - not yet implemented).

```json
{
  "key": "PF2eVisionerDetection",
  "modifier": -2,
  "predicate": ["stealth"]
}
```

**What it does:**

- Applies detection modifier (when implemented)
- Makes it harder for others to detect you

**Note**: Detection modifiers are planned but not yet fully implemented.

---

## Basic Cover Rule Elements

### Example 6: Lesser Cover from All Sources

**Use Case**: A defensive stance that grants lesser cover from all attacks.

**For Foundry VTT (copy this):**

```json
{"key":"PF2eVisionerCover","mode":"set","coverLevel":"lesser"}
```

**Readable format:**

```json
{
  "key": "PF2eVisionerCover",
  "mode": "set",
  "coverLevel": "lesser"
}
```

**What it does:**

- Forces cover level to `lesser` for all attackers
- Always active (no predicates)
- Overrides any existing cover state

**Alternative (increase by 1 step):**

```json
{"key":"PF2eVisionerCover","mode":"increase","steps":1}
```

**Where to add it:** On an effect, stance feat, or defensive buff.

---

### Example 7: Greater Cover from Ranged Attacks

**Use Case**: A tower shield ability that provides greater cover, but only from ranged attacks.

**For Foundry VTT:**

```json
{
  "key": "PF2eVisionerCover",
  "mode": "set",
  "coverLevel": "greater",
  "predicate": ["item:tag:ranged"]
}
```

**Readable format:**

```json
{
  "key": "PF2eVisionerCover",
  "mode": "set",
  "coverLevel": "greater",
  "predicate": ["item:tag:ranged"]
}
```

**What it does:**

- Forces cover to `greater` against ranged attacks
- Only works when attacker has ranged weapon
- Overrides existing cover level

**Note**: The `item:tag:ranged` predicate checks if the attacker's equipped weapon has the "ranged" tag.

---

### Example 8: Reduce Enemy Cover

**Use Case**: A feat that reduces cover your enemies have by one step.

**For Foundry VTT:**

```json
{ "key": "PF2eVisionerCover", "mode": "decrease", "steps": 1, "predicate": ["enemy"] }
```

**Readable format:**

```json
{
  "key": "PF2eVisionerCover",
  "mode": "decrease",
  "steps": 1,
  "predicate": ["enemy"]
}
```

**What it does:**

- Reduces enemy cover by one level
- Only affects enemies (not allies)
- Works automatically

**Examples:**

- Greater → Standard
- Standard → Lesser
- Lesser → None
- None → None (no change)

**Where to add it:** On a feat like "Point-Blank Shot" or similar.

---

## Detection Rule Elements

### Example 9: Grant Darkvision

**Use Case**: An effect that grants darkvision 60 feet.

```json
{
  "key": "visioner-detection",
  "sense": "darkvision",
  "range": 60,
  "acuity": "precise"
}
```

**What it does:**

- Grants darkvision with 60-foot range
- Precise sense (can pinpoint targets)
- Stacks with existing senses (higher range wins)

---

### Example 10: Grant Tremorsense

**Use Case**: An earth elemental ability that grants tremorsense.

```json
{
  "key": "visioner-detection",
  "sense": "tremorsense",
  "range": 30,
  "acuity": "imprecise"
}
```

**What it does:**

- Grants tremorsense with 30-foot range
- Imprecise (can locate but not pinpoint)
- Allows detection through ground

---

### Example 11: Conditional Lifesense

**Use Case**: A necromancer ability that grants lifesense, but only against living creatures.

```json
{
  "key": "visioner-detection",
  "sense": "lifesense",
  "range": 60,
  "acuity": "precise",
  "predicate": ["target:trait:living"]
}
```

**What it does:**

- Grants lifesense with 60-foot range
- Only works against living creatures
- Precise when it applies

---

## Using Predicates

Predicates let you make rule elements conditional. Here are the available custom roll options:

### Visioner Roll Options

```javascript
// Direction
'visioner:direction:observer-to-target'; // Observer looking at target
'visioner:direction:target-to-observer'; // Target looking at observer

// Distance (automatically calculated)
'visioner:distance:5'; // Within 5 feet
'visioner:distance:10'; // Within 10 feet
'visioner:distance:30'; // Within 30 feet
// ... etc for every 5 feet

// Visibility States
'visioner:visibility:observed';
'visioner:visibility:concealed';
'visioner:visibility:hidden';
'visioner:visibility:undetected';

// Cover States
'visioner:cover:none';
'visioner:cover:lesser';
'visioner:cover:standard';
'visioner:cover:greater';

// Conditions (on target)
'visioner:condition:concealed';
'visioner:condition:hidden';
'visioner:condition:undetected';
'visioner:condition:invisible';
'visioner:condition:blinded';
'visioner:condition:flat-footed';

// Senses (on observer)
'visioner:sense:darkvision';
'visioner:sense:low-light-vision';
'visioner:sense:greater-darkvision';
'visioner:sense:tremorsense';
'visioner:sense:lifesense';
'visioner:sense:echolocation';
'visioner:sense:scent';
```

### PF2e Standard Roll Options

You can also use all standard PF2e roll options:

```javascript
'enemy'; // Target is an enemy
'ally'; // Target is an ally
'self:condition:hidden'; // You have hidden condition
'target:trait:undead'; // Target has undead trait
'item:tag:ranged'; // Equipped item has ranged tag
```

---

## Complex Examples

### Example 12: Sniper's Advantage

**Use Case**: A feat that grants you hidden status from enemies more than 60 feet away, but only if you have cover.

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

**What it does:**

- Forces `hidden` status
- Only against enemies
- Only at 60+ feet (using `gte` - greater than or equal)
- Only when you have at least lesser cover

---

### Example 13: Shadow Blending

**Use Case**: A shadow monk ability that upgrades your visibility in darkness.

```json
{
  "key": "visioner-visibility",
  "selector": "all",
  "modifier": {
    "action": "upgrade",
    "penalty": -4
  },
  "predicate": [{ "or": ["target:condition:darkness", "target:condition:dim-light"] }]
}
```

**What it does:**

- Applies -4 penalty to observers (harder to detect you)
- Works in darkness or dim light
- Requires custom darkness/dim-light conditions

---

### Example 14: Point-Blank Defense

**Use Case**: A defensive feat that gives better cover up close, but worse at range.

```json
{
  "key": "visioner-cover",
  "selector": "all",
  "modifier": {
    "action": "upgrade",
    "to": "standard"
  },
  "predicate": [{ "lte": ["visioner:distance", 10] }]
}
```

```json
{
  "key": "visioner-cover",
  "selector": "all",
  "modifier": {
    "action": "downgrade",
    "from": "standard",
    "to": "lesser"
  },
  "predicate": [{ "gte": ["visioner:distance", 30] }]
}
```

**What it does:**

- Within 10 feet: upgrade to standard cover
- Beyond 30 feet: downgrade standard to lesser
- Between 10-30 feet: no change

---

### Example 15: Selective Invisibility

**Use Case**: A spell that makes you hidden from enemies but observed by allies.

```json
{
  "key": "visioner-visibility",
  "selector": "all",
  "state": "hidden",
  "predicate": ["enemy"]
}
```

```json
{
  "key": "visioner-visibility",
  "selector": "all",
  "state": "observed",
  "predicate": ["ally"]
}
```

**What it does:**

- First rule: forces hidden from enemies
- Second rule: forces observed by allies
- Creates "selective" invisibility

---

## Common Use Cases

### Stealth Feats

**Camouflage** - Concealment in natural terrain:

```json
{
  "key": "visioner-visibility",
  "selector": "all",
  "modifier": {
    "action": "upgrade",
    "from": "observed",
    "to": "concealed"
  },
  "predicate": ["terrain:natural"]
}
```

**Terrain Stalker** - No penalty for difficult terrain on Stealth:

```json
{
  "key": "visioner-visibility",
  "selector": "all",
  "modifier": {
    "action": "upgrade",
    "penalty": -2
  },
  "predicate": ["self:difficult-terrain"]
}
```

---

### Defensive Feats

**Missile Shield** - Deflect ranged attacks with shield:

```json
{
  "key": "visioner-cover",
  "selector": "all",
  "modifier": {
    "action": "upgrade",
    "to": "standard"
  },
  "predicate": ["item:tag:ranged", "self:condition:shield-raised"]
}
```

**Combat Awareness** - Better against flanking:

```json
{
  "key": "visioner-cover",
  "selector": "all",
  "modifier": {
    "action": "upgrade",
    "from": "none",
    "to": "lesser"
  },
  "predicate": ["self:condition:flanked"]
}
```

---

### Special Abilities

**Ethereal** - Harder to see, easier to hide:

```json
{
  "key": "visioner-visibility",
  "selector": "all",
  "modifier": {
    "action": "upgrade",
    "penalty": -4
  }
}
```

**Shadow Step** - Hidden immediately after teleporting:

```json
{
  "key": "visioner-visibility",
  "selector": "all",
  "state": "hidden",
  "predicate": ["self:condition:just-teleported"]
}
```

---

## How to Add Rule Elements to Items

### Method 1: In Foundry VTT (Recommended)

1. Open the item/feat/effect in Foundry
2. Go to the **Rules** tab
3. Click **+ Add Rule Element**
4. Select **"Custom" or "Other"** (if Visioner types not listed)
5. Paste the JSON example
6. Save

### Method 2: In JSON Files (Module Developers)

If you're creating a module with custom items:

```json
{
  "name": "Shadow Cloak",
  "type": "equipment",
  "system": {
    "rules": [
      {
        "key": "visioner-visibility",
        "selector": "all",
        "state": "concealed",
        "range": 60,
        "predicate": ["enemy"]
      }
    ]
  }
}
```

---

## Testing Your Rule Elements

### In-Game Testing

1. **Apply the item/effect** to a token
2. **Open Token Manager** (from Visioner HUD button)
3. **Check the states** - you should see the rule element effects
4. **Test with different tokens** - verify predicates work correctly

### Using Browser Console

Check if rule elements are loaded:

```javascript
// Get rule elements for a token
const token = canvas.tokens.controlled[0];
const service = game.modules.get('pf2e-visioner').api.getRuleElementService();
const rules = service.getRuleElementsForToken(token);
console.log(rules);
```

Check modified visibility:

```javascript
const observer = canvas.tokens.controlled[0];
const target = canvas.tokens.controlled[1];
const result = service.applyVisibilityModifiers(observer, target, 'observed');
console.log('Modified state:', result.state);
console.log('Applied modifiers:', result.modifiers);
```

---

## Troubleshooting

### Rule Element Not Working

**Check these:**

1. **Correct key**: Must be `visioner-visibility`, `visioner-cover`, or `visioner-detection`
2. **Valid JSON**: Use a JSON validator to check syntax
3. **Predicates match**: Test predicates in console
4. **Item is equipped/active**: Passive items must be invested/equipped
5. **Range**: Check if target is within range

### Predicates Not Matching

**Common issues:**

- **Case sensitive**: `"Enemy"` ≠ `"enemy"`
- **Custom conditions**: Must actually exist on the token
- **Distance**: Measured in feet, not grid squares
- **Direction**: Make sure you're testing from the right perspective

### Multiple Rule Elements Conflicting

**Resolution order:**

1. **Set state** (overrides everything)
2. **Upgrade/downgrade** (applied in order)
3. **Penalties** (cumulative)

**Tip**: Use more specific predicates to avoid conflicts.

---

## Advanced Tips

### Combining Multiple Rule Elements

You can add multiple rule elements to the same item:

```json
{
  "system": {
    "rules": [
      {
        "key": "visioner-visibility",
        "selector": "all",
        "state": "concealed",
        "predicate": ["enemy"]
      },
      {
        "key": "visioner-cover",
        "selector": "all",
        "modifier": {
          "action": "upgrade",
          "to": "standard"
        }
      }
    ]
  }
}
```

### Using Range Effectively

- **No range**: Always applies (unlimited)
- **range: 30**: Only within 30 feet
- **Combine with distance predicates** for range bands

### Creating Custom Conditions

For predicates like `"target:condition:dim-light"`, you need to actually add those conditions to tokens. You can:

1. Create custom conditions in PF2e
2. Use Visioner regions for environmental effects
3. Add them via macros/scripts

---

## Next Steps

- **[CUSTOM_ROLL_OPTIONS.md](./CUSTOM_ROLL_OPTIONS.md)** - Complete list of available predicates
- **[INTEGRATION.md](./INTEGRATION.md)** - How rule elements integrate with systems
- **[API.md](../visioner-wiki/API.md)** - Programmatic access to rule elements

---

## Quick Reference

### Visibility States

- `observed` - Normal visibility
- `concealed` - 20% miss chance (DC +5 to detect)
- `hidden` - 50% miss chance (DC +10 to detect)
- `undetected` - Cannot target (DC +15 to detect)

### Cover States

- `none` - No cover
- `lesser` - +1 AC
- `standard` - +2 AC (+4 to Stealth to Hide)
- `greater` - +4 AC (Can Take Cover, +4 to Stealth to Hide)

### Modifier Actions

- `"set"` - Force a specific state (ignores current)
- `"upgrade"` - Improve state if it matches `from`
- `"downgrade"` - Worsen state if it matches `from`
- `"penalty": -2` - Flat modifier to detection/cover

### Common Predicates

- `"enemy"` / `"ally"` - Relationship
- `{"gte": ["visioner:distance", 30]}` - Distance check
- `"visioner:cover:standard"` - Has standard cover
- `"target:trait:undead"` - Target has trait
- `"item:tag:ranged"` - Equipped item tag
