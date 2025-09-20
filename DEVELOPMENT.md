# Development Guide

This guide helps developers set up and test the PF2E Visioner module.

## Setup for Testing

### Prerequisites

- FoundryVTT v13.341 or newer
- PF2E system v6.0.0 or newer
- GM access to a test world

### Installation for Development

1. **Clone/Copy the module to your FoundryVTT modules directory:**

   ```
   [FoundryVTT Data]/modules/pf2e-visioner/
   ```

2. **Enable the module in your test world:**
   - Go to Game Settings → Manage Modules
   - Find "PF2E Visioner" and enable it
   - Save and return to game

### Testing Checklist

#### Basic Functionality

- [ ] Module loads without errors (check browser console)
- [ ] Token manager opens with `Ctrl+Shift+V`
- [ ] Token HUD shows eye icon when token is selected
- [ ] Context menu shows "Manage Token Visibility and Cover" option

#### UI Testing

- [ ] Observer info displays correctly at top
- [ ] Tab navigation works between Visibility and Cover tabs
- [ ] Bulk action buttons work for all visibility states
- [ ] Bulk action buttons work for all cover states
- [ ] Token table shows all scene tokens except observer
- [ ] Dropdown menus update visibility states
- [ ] Dropdown menus update cover states
- [ ] Cover legend displays mechanical effects correctly
- [ ] Apply/Reset/Cancel buttons function properly

#### Visual Effects Testing

- [ ] Controlled token acts as observer
- [ ] Other tokens change appearance based on visibility settings
- [ ] Hidden tokens become semi-transparent (0.5 alpha)
- [ ] Undetected tokens become barely visible (0.1 alpha)
- [ ] Concealed tokens become dimmed (0.7 alpha)
- [ ] Invisible tokens disappear completely (0.0 alpha)
- [ ] Visual indicators appear on tokens (if enabled)
- [ ] Cover indicators show correct icons and colors
- [ ] Cover states display mechanical effects in tooltips

#### Data Persistence

- [ ] Visibility settings save when scene is reloaded
- [ ] Cover settings save when scene is reloaded
- [ ] Settings persist across FoundryVTT restarts

#### Rule Elements Integration

- [ ] Hidden condition applies proper PF2E mechanical effects
- [ ] Concealed condition triggers DC 5 flat checks
- [ ] Conditions show red triangular indicators around tokens
- [ ] Attack rolls respect flat check requirements
- [ ] Visual effects maintain PF2E-consistent appearance
- [ ] Multiple observer tokens can have different visibility maps
- [ ] Multiple observer tokens can have different cover maps
- [ ] Deleting tokens cleans up their visibility and cover data

#### PF2E Integration

- [ ] Auto-apply conditions setting works (when enabled)
- [ ] PF2E conditions are applied/removed correctly
- [ ] Module works with synthetic actors
- [ ] Compatible with PF2E actor sheets

## Common Testing Scenarios

### Scenario 1: Basic Stealth Encounter

1. Create a scene with 3-4 tokens (1 PC, 2-3 NPCs)
2. Select the PC token as observer
3. Set one NPC as "Hidden", another as "Undetected"
4. Verify visual changes apply immediately
5. Switch to controlling different tokens and verify visibility changes

### Scenario 2: Complex Multi-Observer Setup

1. Create scene with multiple PC tokens
2. Set different visibility relationships for each PC
3. Example: PC1 sees Enemy1 as Hidden, PC2 sees Enemy1 as Observed
4. Switch between controlling PC1 and PC2
5. Verify each sees different visual states

### Scenario 3: Bulk Operations

1. Create scene with many tokens
2. Use bulk "Hidden" button to set all targets as hidden
3. Use bulk "Observed" to reset all
4. Verify all changes apply correctly

## Development Tools

### Module Structure

The module is now organized into multiple files for better maintainability:

- `scripts/main.js` - Entry point and initialization
- `scripts/constants.js` - Configuration and constants
- `scripts/api.js` - Public API and core functionality
- `scripts/token-manager.js` - ApplicationV2 UI component (renamed from visibility-manager.js)
- `scripts/visual-effects.js` - Visual effects management
- `scripts/hooks.js` - FoundryVTT hooks registration
- `scripts/settings.js` - Settings and keybindings
- `scripts/utils.js` - Utility functions

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed documentation.

### Browser Console Commands

```javascript
// Access the module API
window.PerTokenVisibility;

// Get controlled token's visibility map
canvas.tokens.controlled[0]?.document.getFlag('pf2e-visioner', 'visibility');

// Force update visuals
PerTokenVisibility.updateTokenVisuals();

// Open visibility manager for specific token
PerTokenVisibility.openVisibilityManager(canvas.tokens.controlled[0]);

// Check current settings
PerTokenVisibility.areVisualEffectsEnabled();
PerTokenVisibility.areGMHintsEnabled();
```

### Debug Settings

Enable these in browser console for debugging:

```javascript
// Enable debug logging
CONFIG.debug.hooks = true;

// Monitor module hooks
Hooks.on('controlToken', (...args) => console.log('controlToken', args));
```

## Known Issues & Limitations

### Current Limitations

- Visibility only applies when tokens are controlled by GM
- No real-time multiplayer visibility updates (planned for future)
- Visual effects don't persist through token animations
- Limited integration with advanced PF2E automation modules

### Browser Compatibility

- Tested in Chrome/Chromium browsers
- Firefox support expected but not extensively tested
- Safari compatibility unknown

## Rule Elements Integration

The module is designed to work seamlessly with PF2E's Rule Elements system for advanced automation scenarios.

### Predicate Integration

The module provides roll options that can be used in Rule Element predicates:

```json
{
  "key": "FlatModifier",
  "selector": "strike-damage",
  "predicate": ["per-token-visibility:target:hidden"],
  "type": "circumstance",
  "value": 2,
  "label": "Sneak Attack (Hidden Target)"
}
```

### Available Roll Options

- `per-token-visibility:target:hidden` - Target is hidden from current observer
- `per-token-visibility:target:concealed` - Target is concealed from current observer
- `per-token-visibility:target:undetected` - Target is undetected by current observer
- `per-token-visibility:target:visible` - Target is visible to current observer
- `per-token-visibility:observer:has-darkvision` - Observer has darkvision
- `per-token-visibility:observer:has-tremorsense` - Observer has tremorsense

### Example Use Cases

#### Sneak Attack with Hidden Targets

```json
{
  "key": "DamageDice",
  "selector": "strike-damage",
  "predicate": ["class:rogue", "per-token-visibility:target:hidden"],
  "diceNumber": "ceil(@actor.level/2)",
  "dieSize": "d6",
  "damageType": "precision",
  "label": "Sneak Attack"
}
```

#### Flat Check Automation

```json
{
  "key": "RollOption",
  "option": "flat-check-required",
  "predicate": [
    {
      "or": ["per-token-visibility:target:hidden", "per-token-visibility:target:concealed"]
    }
  ]
}
```

#### Visual Condition Bonuses

```json
{
  "key": "FlatModifier",
  "selector": "perception",
  "predicate": ["per-token-visibility:target:concealed", "action:seek"],
  "type": "circumstance",
  "value": 2,
  "label": "Seeking Concealed Target"
}
```

### API Integration

The module exposes an API for advanced integrations:

```javascript
// Check visibility between two tokens
const isHidden =
  game.modules.get('pf2e-visioner')?.api?.getVisibilityBetween(observerToken, targetToken) ===
  'hidden';

// Set visibility programmatically
await game.modules
  .get('pf2e-visioner')
  ?.api?.setVisibilityBetween(observerToken, targetToken, 'concealed');

// Update all token visuals
await game.modules.get('pf2e-visioner')?.api?.updateTokenVisuals();
```

## Bulk Visibility Override Bar (Added 2025-09)

All action preview dialogs (Seek, Hide, Sneak, Create a Diversion, Consequences, Point Out, Take Cover) now expose a unified bulk visibility override control.

Key Elements:

- Template partial: `templates/partials/bulk-override.hbs`
- Injected context: `bulkOverrideStates` (array of { value, icon, label, cssClass })
- Handlers: `_onBulkOverrideSet` / `_onBulkOverrideClear` in `scripts/chat/dialogs/base-action-dialog.js`
- Styling: `.bulk-override-bar` block in `styles/dialog-layout.css`

Behavior:

- Clicking a state button sets `overrideState` for every outcome row and recomputes `hasActionableChange`.
- Clear button removes all overrides, restoring each row's calculated visibility change.
- Changes remain ephemeral until Apply / Apply All is triggered (which still creates AVS overrides as before).

Adding to New Dialogs:
Insert the partial just above the results table:

```
{{> "pf2e-visioner.bulk-override"}}
```

If context is missing it simply renders nothing (safe no-op).

Testing:

- See `tests/unit/bulk-override.test.js` for coverage of set & clear mechanics.

Accessibility:

- Buttons inherit existing tooltip infrastructure; future enhancement could add ARIA live region updates when bulk operations fire.

## Contributing

### Code Style

- Use ESModule imports/exports
- Follow FoundryVTT v13 API patterns
- Use ApplicationV2 for all UI components
- Implement proper error handling
- Add JSDoc comments for public methods

### Testing

- Test with minimal modules enabled first
- Test in multiple browsers if possible
- Verify compatibility with popular PF2E modules
- Test performance with large numbers of tokens

### Pull Requests

- Include clear description of changes
- Add relevant test scenarios
- Update documentation as needed
- Follow existing code patterns
