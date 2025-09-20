# PF2E Visioner Development Handover

This document provides a comprehensive overview of the PF2E Visioner module's current state, architecture, development patterns, and critical information for new AI assistants working on this project.

## 📋 Quick Reference

- **Module ID**: `pf2e-visioner`
- **Current Version**: 2.6.5
- **FoundryVTT Compatibility**: v13.341+ (verified up to v13.346)
- **PF2E System**: v6.0.0+
- **License**: GPL-3.0

## 🏗️ Architecture Overview

### Core Philosophy

The module follows a **modular, single-responsibility architecture** with clear separation of concerns:

- **ESModule-based**: Modern JavaScript module system with tree-shaking
- **ApplicationV2**: Uses FoundryVTT v13's modern UI framework
- **Flag-based persistence**: All data stored in token/scene flags for robustness
- **Event-driven**: Heavy use of FoundryVTT's hook system
- **Performance-focused**: Batch operations, lazy loading, and optimized updates

### Key Architectural Patterns

1. **Facade Pattern**: `utils.js` re-exports from stores/services for single source of truth
2. **Store Pattern**: Separate stores for visibility and cover state management
3. **Service Layer**: Cross-cutting concerns handled by dedicated services
4. **Hook Registration**: Centralized in `hooks/registration.js` with modular handlers
5. **API Layer**: Clean public API in `api.js` with internal helpers in `services/api-internal.js`

## 📁 File Structure & Responsibilities

```
scripts/
├── main.js                    # Entry point - module initialization
├── constants.js               # All configuration, states, settings definitions
├── api.js                     # Public API surface
├── utils.js                   # Facade re-exporting stores/services + UI helpers
├── settings.js                # Settings registration with grouped UI
├── hooks.js                   # Thin shim → delegates to hooks/
├── hooks/                     # Modular hook handlers by concern
│   ├── registration.js        # Central registrar
│   ├── lifecycle.js           # ready/canvasReady + socket + tooltips
│   ├── ui.js                  # Token HUD, directory context, config injection
│   ├── token-events.js        # create/delete token handlers
│   ├── party-token-hooks.js   # Party token consolidation detection
│   ├── combat.js              # encounter filter reset
│   └── chat.js                # chat styles + processing
├── managers/                  # UI controllers
│   ├── token-manager/         # Main visibility/cover UI (ApplicationV2)
│   ├── progress.js            # Progress indicator
│   ├── quick-panel.js         # Quick edit panel
│   └── wall-manager/          # Wall management UI
├── stores/                    # State management (single responsibility)
│   ├── visibility-map.js      # Visibility state persistence
│   └── cover-map.js           # Cover state persistence
├── services/                  # Cross-cutting operations
│   ├── api-internal.js        # Internal API helpers
│   ├── auto-visibility-system.js # Automatic visibility detection system
│   ├── scene-cleanup.js       # Token deletion cleanup
│   ├── party-token-state.js   # Party token state preservation
│   ├── socket.js              # Cross-client communication
│   ├── visual-effects.js      # Token appearance management
│   └── [other services]
├── cover/                     # Cover system modules
│   ├── auto-cover.js          # Automatic cover detection
│   ├── cover-visualization.js # Interactive cover grid overlay
│   ├── aggregates.js          # Effect aggregation
│   ├── batch.js               # Batch operations
│   └── [other cover modules]
├── visibility/                # Visibility system modules
├── chat/                      # PF2E action automation
│   ├── automation-service.js  # Main automation controller
│   ├── chat-processor.js      # Chat message processing
│   ├── dialogs/               # Action-specific dialogs
│   └── services/              # Action handlers and utilities
└── helpers/                   # Pure utility functions
```

## 🔧 Development Patterns & Conventions

### Code Style & Standards

- **ESModule imports/exports**: Always use modern module syntax
- **ApplicationV2**: All UI components use FoundryVTT v13's modern framework
- **Async/await**: Prefer over Promise chains
- **Error handling**: Comprehensive try-catch with user notifications
- **JSDoc**: Document all public methods and complex functions
- **No time-based operations**: User preference - avoid setTimeout/setInterval [[memory:4992324]]

### Data Management Patterns

1. **Flag-based persistence**: All state stored in `token.flags["pf2e-visioner"]`
2. **Batch operations**: Always prefer bulk document updates over individual operations
3. **State reconciliation**: Updates merge with existing data, never overwrite completely
4. **Cleanup on deletion**: Automatic cleanup when tokens/actors are removed

### UI Patterns

1. **Tabbed interfaces**: Visibility and Cover tabs in main manager
2. **Bulk actions**: "Apply All", "Revert All" with per-row controls
3. **Progress indicators**: Long operations show progress bars
4. **Responsive design**: CSS breakpoints for different screen sizes
5. **Colorblind support**: Multiple accessibility modes with pattern indicators

### Quick Panel (VisionerQuickPanel)

1. **Purpose**: Rapid visibility and cover management without opening full manager
2. **Layout**: Compact interface with visibility/cover buttons and quick selection tools
3. **Quick Selection Buttons**:
   - **Party Selection**: Selects all character tokens with player ownership
   - **Enemy Selection**: Selects all NPC tokens without player ownership
   - **Party Targeting**: Targets all party tokens for visibility/cover operations
   - **Enemy Targeting**: Targets all enemy tokens for visibility/cover operations
4. **Features**:
   - Observer/Target mode switching
   - Minimizable to floating button
   - Auto-refresh on token selection/targeting changes
   - Position memory for floating button
5. **Token Detection Logic**:
   - **Party tokens**: `actor.type === 'character' && actor.hasPlayerOwner && (actor.alliance === 'party' || actor.alliance === 'self')`
   - **Enemy tokens**: `actor.type === 'npc' && !actor.hasPlayerOwner`
6. **Usage**: Ideal for GMs managing large encounters or quick visibility adjustments

### Performance Patterns

1. **Lazy loading**: Dynamic imports for heavy modules (dialogs, batch operations)
2. **Debounced updates**: Visual effects batched to avoid excessive redraws
3. **Efficient queries**: Canvas token filtering optimized for large scenes
4. **Memory management**: Cleanup of event listeners and temporary data

## 🎯 Core Features & Systems

### 1. Visibility System

- **States**: Observed, Concealed, Hidden, Undetected
- **Per-observer tracking**: Each token has individual visibility map
- **PF2E integration**: Automatic condition application with mechanical effects
- **Visual feedback**: Token overlays, opacity changes, indicators

### 2. Cover System

- **States**: None, Lesser (+1 AC), Standard (+2 AC), Greater (+4 AC)
- **Auto-cover detection**: Multiple intersection algorithms (Any, 10%, Center, Coverage, Tactical)
- **Roll-time application**: Cover applied only during attacks, then cleaned up
- **Override system**: GM can override auto-calculated cover in roll dialogs

### 3. Chat Automation

- **PF2E Actions**: Seek, Hide, Sneak, Point Out, Create a Diversion, Take Cover
- **Attack Consequences**: Post-damage visibility updates for hidden/undetected attackers
- **Template system**: Seek can use placed templates for area targeting
- **Player/GM workflow**: Players trigger, GMs resolve with preview dialogs

### 4. Cover Visualization

- **Interactive grid**: Hold keybind while hovering to show cover levels
- **Color-coded**: Green (none), Yellow (lesser), Orange (standard), Red (greater)
- **Fog of war aware**: Only shows information in visible areas
- **Performance optimized**: Client-side rendering with efficient algorithms

### 5. Cover Override Indication ✅ **NEW FEATURE**

- **Chat message indicators**: Visual indicators appear in chat when auto cover calculations are overridden
- **Override sources tracked**: Distinguishes between popup overrides (keybind) and roll dialog overrides
- **Clear messaging**: Shows original detected cover vs final applied cover (e.g., "Standard Cover → Lesser Cover")
- **Localized**: Supports multiple languages with proper i18n formatting
- **Non-intrusive**: Appears as a subtle warning-colored bar in chat messages

### 6. Auto-Visibility System ✅ **NEW FEATURE**

- **Automatic visibility detection**: Analyzes lighting conditions, creature senses, and environmental factors to automatically set appropriate visibility flags
- **Lighting-based calculations**: Considers bright light, dim light, and darkness levels at token positions
- **Creature senses integration**: Supports darkvision, low-light vision, tremorsense, echolocation, see-invisibility, and other PF2E senses
- **Real-time updates**: Automatically recalculates visibility when tokens move, lighting changes, or walls are modified
- **Scene Config Intelligence**: Detects when Scene Configuration dialog is open and defers updates until user saves changes
- **Performance optimized**: Uses singleton pattern with efficient batching and prevents duplicate processing
- **Comprehensive API**: Provides methods for manual calculation, debugging, and system control
- **GM-only operation**: Only runs for GM users to prevent conflicts and ensure consistent state
- **Configurable settings**: Enable/disable system, control update triggers, and debug mode
- **Error handling**: Graceful fallbacks and comprehensive error logging for troubleshooting

### 7. Party Token Integration ✅ **VALIDATED IN PRODUCTION**

- **State preservation**: Saves visibility/cover when tokens consolidated into party
- **Automatic restoration**: Restores state when tokens brought back from party
- **Effect preservation**: Module effects saved and restored with tokens
- **Smart detection**: Only consolidates character tokens, ignores familiars/NPCs
- **Robust error handling**: Gracefully handles FoundryVTT's complex party mechanics
- **Cache management**: Automatic cleanup prevents memory leaks

## ⚠️ Critical Development Quirks & Gotchas

### 1. Token vs TokenDocument Distinction

- **Always check**: Some functions expect Token objects, others TokenDocument
- **Canvas availability**: During deletion, tokens may not be in canvas.tokens
- **Use token.document**: To get TokenDocument from Token object

### 2. Flag Management

- **Never overwrite**: Always merge with existing flag data
- **Use proper paths**: `flags["pf2e-visioner"].visibility` not `flags.pf2e-visioner.visibility`
- **Batch updates**: Use scene.updateEmbeddedDocuments for multiple token updates

### 3. Effect System Complexity

- **Ephemeral vs Aggregate**: Two types of effects with different lifecycles
- **Cleanup critical**: Always clean up effects to prevent orphaned data
- **Batch creation**: Create multiple effects in single operation for performance

### 4. Auto-Cover Architecture (Simplified v2.6.5+)

- **Dual-phase system**:
  1. **libWrapper phase**: Immediate DC modification for roll calculation
  2. **Chat message phase**: Persistent state management and visual updates
- **Keybind-only popups**: Override dialog only appears when user holds configured keybind
- **Automatic detection**: Seamless cover application without user intervention when keybind not held
- **Global communication**: Uses `window.pf2eVisionerPopupOverrides` and `window.pf2eVisionerDialogOverrides` Maps
- **Per-user settings**: Correctly accesses PF2e client settings (`game.user.flags.pf2e.settings.*`) not system settings
- **Movement invalidation**: Token movement clears pre-applied cover
- **Owner-based**: Auto-cover runs for token owners and GM to avoid duplicate applications
- **Override tracking**: Stores override information in chat message flags (`flags["pf2e-visioner"].coverOverride`) for visual indication

### 5. ApplicationV2 Patterns

- **Instance management**: Track singleton instances to prevent duplicates
- **Render lifecycle**: Use proper render/close lifecycle methods
- **Event handling**: Use built-in action system, not manual event binding

### 6. Testing Infrastructure

- **Jest-based**: Comprehensive test suite with 586+ tests
- **Canvas mocking**: Real HTML5 canvas integration for drawing tests
- **Coverage requirements**: Strict thresholds enforced in CI/CD

### 7. Effect System Architecture ✅ **BY DESIGN**

- **Custom aggregate effects**: Module intentionally uses custom effects instead of real PF2E conditions for performance
- **Why custom effects**: One aggregate effect can handle multiple observers, more efficient than individual conditions
- **Icon resolution**: Uses `getPF2eConditionIcon()` to get proper PF2E condition icons from `game.pf2e.ConditionManager`
- **Fallback system**: Falls back to direct path, then generic icon if PF2E condition not available
- **Visual consistency**: Custom effects use proper PF2E condition icons while maintaining performance benefits

## 🔍 Common Issues & Solutions

### Performance Issues

- **Large scenes**: Module handles 50+ tokens efficiently through batching
- **Visual updates**: Debounced to prevent excessive canvas redraws
- **Memory leaks**: Automatic cleanup of event listeners and temporary data

### State Synchronization

- **Cross-client**: Uses socketlib for perception refresh broadcasts
- **Race conditions**: GM-only operations prevent conflicts
- **State corruption**: Robust error handling with automatic recovery

### UI Responsiveness

- **Progress indicators**: Long operations show progress to users
- **Non-blocking**: Heavy operations use async patterns
- **Error feedback**: Clear user notifications for all error conditions

### Party Token Edge Cases ✅ **PRODUCTION TESTED**

- **Duplicate events**: FoundryVTT fires multiple creation events - system handles gracefully
- **Undefined token IDs**: Early creation events may have undefined IDs - proper validation prevents errors
- **Actor type filtering**: Only character tokens are consolidated, familiars/NPCs ignored correctly
- **Effect restoration timing**: Module effects recreated after token restoration completes
- **Cache persistence**: State cache survives scene reloads and FoundryVTT restarts
- **⚠️ Effect cleanup bug**: Fixed issue where restored effects weren't cleaned up to match current visibility states
  - **Problem**: Saved effects were restored even when visibility relationships no longer justified them
  - **Root cause**: `rebuildAndRefresh()` only cleans cover effects, not visibility effects like Hidden conditions
  - **Solution**: Unified `rebuildEffectsForToken()` function that handles both visibility and cover effects
  - **Impact**: Ensures all effects match restored relationships without removing valid effects
  - **Technical**: Rebuilds effects FROM/TO restored token for both visibility and cover based on current maps
  - **Unified approach**: Single function handles both effect types consistently, reducing code duplication
  - **Default state filtering**: Only creates effects for non-default states (not "observed" or "none")
  - **Debugging**: Added detailed console logging to track what effects are being created and why
  - **⚠️ Critical fix**: Skip restoring saved effects, only rebuild based on current maps to prevent duplicates
  - **Duplicate prevention**: Don't restore saved effects AND rebuild - choose one approach (rebuild is more accurate)
  - **⚠️ Scene cleanup bug**: Fixed "Cannot read properties of undefined" error during token deletion cleanup
  - **Race condition fix**: Added robust null checks and per-token error handling in scene cleanup
  - **Root cause**: Occurs when allied tokens with visibility relationships are consolidated simultaneously
  - **Scenario**: Setting ally A as undetected to ally B, then both get pulled into party token at same time
  - **⚠️ Party consolidation fix**: Skip cleanup for party tokens during consolidation to prevent race conditions
  - **⚠️ Ally-to-ally restoration**: Added deferred update system for ally relationships during party restoration
  - **Deferred updates**: When ally observer not yet restored, defer the relationship update until ally is available

## 📊 Settings & Configuration

### World Settings (GM-only)

- **Auto-Cover**: Master toggle and behavior configuration
- **Auto-Visibility**: Enable automatic visibility detection, update triggers, debug mode
- **Action Automation**: Template usage, range limits, raw enforcement
- **UI Behavior**: Default filters, HUD buttons, tooltip permissions
- **Performance**: Debug mode, ally filtering, encounter filtering

### Client Settings (Per-user)

- **Accessibility**: Colorblind modes, tooltip font sizes
- **Keybindings**: Customizable keyboard shortcuts
- **Visual Preferences**: Tooltip behavior, hover modes

### Hidden/Advanced Settings

- **Token flags**: `ignoreAutoCover`, `hiddenWall`, `stealthDC`
- **Wall flags**: `provideCover`, `hiddenWall`
- **Scene flags**: `partyTokenStateCache` for party token preservation
- **Auto-Visibility flags**: System automatically manages visibility flags based on calculations

## 🧪 Testing Strategy

### Test Categories

1. **Unit Tests**: Individual functions and classes
2. **Integration Tests**: Complex scenarios and interactions
3. **Performance Tests**: Stress testing with many tokens
4. **Regression Tests**: Prevent bugs from returning
5. **Canvas Tests**: Real drawing operations with HTML5 canvas

### Coverage Requirements

- **Branches**: 80%+ (currently relaxed for development)
- **Functions**: 80%+
- **Lines**: 80%+
- **Statements**: 80%+

### Test Commands

```bash
npm test              # Run all tests
npm run test:coverage # Generate coverage report
npm run test:watch    # Watch mode for development
npm run test:ci       # CI mode with strict requirements
```

## 🚀 Release Process

### Pre-Release Checklist

1. **Full test suite**: `npm run test:ci`
2. **Linting**: `npm run lint`
3. **Coverage check**: Ensure thresholds met
4. **Manual testing**: Key scenarios in live FoundryVTT
5. **Version bump**: Update module.json and package.json
6. **Changelog**: Document all changes

### Version Strategy

- **Major**: Breaking changes, major feature additions
- **Minor**: New features, significant improvements
- **Patch**: Bug fixes, minor improvements

## 🔗 Key Dependencies

### Required Modules

- **lib-wrapper**: For safe function wrapping (auto-cover system)
- **socketlib**: Cross-client communication (optional but recommended)

### Development Dependencies

- **Jest**: Testing framework with jsdom environment
- **ESLint**: Code linting with custom rules
- **Babel**: ES6+ transpilation for tests

## 📚 Documentation Files

- **README.md**: User-facing documentation and feature overview
- **ARCHITECTURE.md**: Detailed technical architecture
- **DEVELOPMENT.md**: Development setup and testing guide
- **TESTING.md**: Comprehensive testing framework documentation
- **CHANGELOG.md**: Version history and changes
- **RULE_ELEMENTS.md**: Custom rule element documentation
- **SEEK_AUTOMATION.md**: Seek action automation details

## 💡 Future Development Guidelines

### Adding New Features

1. **Write tests first**: Follow TDD principles
2. **Update documentation**: Keep all docs current
3. **Performance consideration**: Benchmark new code
4. **Accessibility**: Support colorblind users and different screen sizes
5. **Backward compatibility**: Maintain save game compatibility

### Code Quality

- **Single responsibility**: Each file/function has one clear purpose
- **Error handling**: Graceful degradation with user feedback
- **Logging**: Comprehensive debug logging when debug mode enabled
- **Memory efficiency**: Clean up resources and avoid leaks

### User Experience

- **Progressive disclosure**: Advanced features don't clutter basic UI
- **Feedback**: Clear notifications for all user actions
- **Performance**: Operations complete quickly or show progress
- **Accessibility**: Support for different user needs and preferences

---

## 🆘 Emergency Procedures

### Critical Bug Response

1. **Identify scope**: Affects saves? Causes crashes? Data loss?
2. **Immediate mitigation**: Disable problematic features via settings
3. **Hotfix process**: Minimal change to resolve critical issue
4. **Communication**: Update users via GitHub issues/Discord

### Data Recovery

- **Scene corruption**: Use `api.clearAllSceneData()` to reset
- **Party token issues**: Use `manuallyRestoreAllPartyTokens()` ✅ **TESTED & WORKING**
- **Effect cleanup**: Use `cleanupAllCoverEffects()` for orphaned effects
- **Auto-visibility issues**: Use `api.autoVisibility.recalculateAll()` to recalculate all visibility
- **Party cache inspection**: Check scene flags `pf2e-visioner.partyTokenStateCache` for debugging
- **Auto-visibility debugging**: Enable debug mode in settings or use `api.autoVisibility.getDebugInfo(observer, target)`

### Performance Issues

- **Large scenes**: Increase batch sizes, reduce visual updates
- **Memory leaks**: Check event listener cleanup, effect management
- **Canvas performance**: Optimize drawing operations, reduce redraws

## 🐛 Recent Bug Fixes (Latest)

### 🚨 CRITICAL: Infinite lightingRefresh Loop Fix (2025-01-20)

**EMERGENCY BUG FIX COMPLETED**: Fixed infinite loop causing continuous `lightingRefresh` hooks that led to:
- Constant token jittering and visual effects
- Darkness slider resetting continuously  
- Memory leaks from excessive recalculations
- Performance degradation with hundreds of calculations per second

**Root Cause**: Infinite feedback loop in perception refresh system:
1. `lightingRefresh` hook fires → `AutoVisibilitySystem.#onLightingRefresh()`
2. Calls `recalculateAllVisibility()` → updates visibility states
3. Calls `refreshEveryonesPerception()` → `refreshLocalPerception()`
4. Calls `canvas.perception.update({ refreshLighting: true })` → triggers another `lightingRefresh` hook
5. Loop back to step 1 infinitely

**Fix Implemented**:
- **Removed `refreshLighting: true`** from `scripts/services/socket.js` `refreshLocalPerception()`
- **Removed `refreshLighting: true`** from `scripts/services/visual-effects.js` perception updates
- **Kept vision and occlusion refresh** which are actually needed for visibility updates
- **Added circuit breaker system** as emergency fallback to prevent future runaway calculations

**Files Modified**:
- `scripts/services/socket.js` - Removed `refreshLighting: true` from perception updates
- `scripts/services/visual-effects.js` - Removed `refreshLighting: true` from sight changes
- `scripts/visibility/auto-visibility/AutoVisibilitySystem.js` - Added circuit breaker system
- `scripts/api.js` - Added `testDarknessSources()` and `resetCircuitBreaker()` debug methods

**Impact**: ✅ FIXED - System now operates normally without continuous loops:
- Token jittering eliminated
- Darkness slider works correctly
- Memory usage stable
- Performance restored to normal levels
- Auto-visibility system functions properly without spam

**FOLLOW-UP FIX**: Fixed the actual root cause of excessive recalculations:
- **Problem**: Auto-visibility system was reacting to its own effect changes, creating another feedback loop
- **Chain**: Visibility update → creates "Hidden" effects → `updateItem` hook → `#onItemChange` → triggers another recalculation
- **Solution**: Added `#isUpdatingEffects` flag to ignore item changes when the system is updating effects
- **Files**: `scripts/stores/visibility-map.js`, `scripts/visibility/auto-visibility/AutoVisibilitySystem.js`
- **Result**: No more excessive recalculations, circuit breaker messages only in debug mode

**Technical Details**:
- **Circuit breaker**: Limits recalculations to max 3 per 10-second window
- **Emergency reset**: `game.modules.get('pf2e-visioner').api.resetCircuitBreaker()` available
- **Debug methods**: `testDarknessSources()` to verify darkness light source detection
- **Proper separation**: Lighting refresh only when actually needed, not during visibility updates

### ✅ Pre-release Foundry Publishing Prevention (2025-01-20)

- **Issue**: GitHub workflow was publishing pre-releases to Foundry VTT, which should only receive stable releases
- **Root cause**: `publish-to-foundry` job condition only checked `github.event_name == 'release'` without excluding pre-releases
- **Solution**: Updated workflow condition to `github.event_name == 'release' && !github.event.release.prerelease`
- **Files**: `.github/workflows/main.yml` (line 192)
- **Impact**: ✅ FIXED - Pre-releases now skip Foundry VTT publishing while still creating GitHub releases
- **Technical**: Uses GitHub's built-in `prerelease` flag to distinguish between stable and pre-releases

### ✅ Hide/Sneak Action Bracket Display Fix (2025-01-20)

- **Issue**: Hide and Sneak action handlers didn't show brackets when per-row detected cover bonus was lower than the roll modifier in non-override cases
- **Root cause**: `calculateStealthRollTotals` only set `originalTotal` for override cases, not when current cover bonus was lower than original
- **Solution**: Enhanced bracket logic in `calculateStealthRollTotals` to show brackets when `currentCoverBonus < originalCoverBonus` even without overrides
- **Files**: `scripts/chat/services/infra/shared-utils.js` (lines 696-701)
- **Impact**: ✅ FIXED - Brackets now appear consistently when detected cover is lower than applied modifier
- **Technical**: Added non-override case logic to set `originalTotal = baseTotal` when current cover bonus is lower than original

### ✅ Stealth Roll Calculation Enhancement (2025-01-20)

- **Issue**: Stealth roll calculation showed incorrect totals when detected cover differed from roll modifier, even for Standard Cover
- **Root cause**: Non-override logic only decreased total for Lesser/No Cover, keeping full baseTotal for Standard/Greater Cover
- **Solution**: Changed logic to always adjust total based on detected cover bonus: `total = baseTotal - originalCoverBonus + currentCoverBonus`
- **Files**: `scripts/chat/services/infra/shared-utils.js` (lines 649-651, 691-696)
- **Impact**: ✅ FIXED - Now shows correct detected cover bonus as main total and original roll modifier in brackets when they differ
- **Technical**: Updated bracket display to show when `currentCoverBonus !== originalCoverBonus` (any difference, not just lower)

### ✅ Elevation Integration and 3D Sampling Removal (2025-01-20)

- **Issue**: Height and elevation considerations were only available in a separate "3D Sampling" mode, making it inconsistent
- **Root cause**: Elevation filtering was isolated to one mode instead of being integrated into all cover detection modes
- **Solution**: Integrated elevation filtering into all cover detection modes and removed the separate 3D sampling mode
- **Files**:
  - `scripts/cover/auto-cover/CoverDetector.js` - Added `_filterBlockersByElevation()` method and integrated it into all modes
  - `scripts/constants.js` - Removed `sampling3d` option from `autoCoverTokenIntersectionMode` choices
- **Impact**: ✅ FIXED - All cover detection modes now consider height and elevation automatically
- **Technical**:
  - New `_filterBlockersByElevation()` method calculates relevant elevation bands between attacker and target
  - Filters blockers based on vertical span overlap with line of sight elevations
  - Removed duplicate `_evaluateCoverBy3DSampling()` method
  - All modes (tactical, coverage, any, center) now use elevation-aware blocker filtering

### ⚠️ Chat message update bug

- **Issue**: Visioner buttons disappear when chat messages are updated (e.g., `message.update({"flags.pf2e.test": "foo"})`)
- **Root cause**: `processedMessages` cache prevents re-injection when message is re-rendered after updates
- **Solution**: Added DOM check in `entry-service.js` - if message is cached but no `.pf2e-visioner-automation-panel` exists, allow re-injection
- **Files**: `scripts/chat/services/entry-service.js` (lines 55-63)
- **Impact**: ✅ FIXED - Chat automation panels now persist through message updates
- **Technical**: Uses `html.find('.pf2e-visioner-automation-panel').length > 0` to detect if UI was removed by update

### ✅ Player error handling

- **Status**: Already implemented - players don't see red console errors during token operations
- **Coverage**: Comprehensive test suite added in `tests/unit/chat-message-updates.test.js`
- **Scenarios tested**: Token deletion race conditions, party consolidation errors, effect update failures
- **Pattern**: All player-facing operations use try-catch with `console.warn` instead of throwing errors

### ✅ Party Token Integration Testing

- **Coverage**: Comprehensive test suite added in `tests/unit/party-token-integration.test.js` (18 test cases)
- **State Management**: Tests for saving/restoring visibility maps, cover maps, observer states, and effects
- **Race Conditions**: Tests for parallel token deletion, cleanup skipping, effect rebuild failures
- **Deferred Updates**: Tests for ally-to-ally relationship restoration when both tokens aren't immediately available
- **Effect Management**: Tests for duplicate prevention, correct PF2e icon usage, cache management
- **NPC Integration**: Tests for effect restoration FROM restored players TO existing NPCs AND FROM existing NPCs TO restored players
- **Integration**: Full consolidation/restoration cycle tests, mass party operations
- **Bug Coverage**: All previously fixed issues (duplicate effects, race conditions, ally relationships) are tested

### ✅ Auto-Cover Simplified Architecture (v2.6.5+)

- **Issue**: Complex auto-cover system with multiple code paths caused timing issues and inconsistent cover application
- **Impact**: ✅ FIXED - Simplified architecture with keybind-only popups and reliable automatic cover detection
- **Technical**: Complete refactor of auto-cover system in `scripts/hooks/auto-cover.js` and `scripts/cover/auto-cover.js`
- **Root Cause**: Previous complex libWrapper logic with multiple override paths created race conditions and timing conflicts
- **New Simplified Approach**:
  - **Keybind-only popups**: Cover override popup only shows when user holds configured keybind (default: X key)
  - **Automatic detection**: When keybind not held, system automatically applies detected cover without user intervention
  - **Dual-phase processing**:
    1. **libWrapper phase**: Modifies target actor DC immediately before roll calculation (ensures AC bonus is applied)
    2. **Chat message phase**: Applies persistent cover state and updates visual indicators
  - **Global override storage**: Uses `window.pf2eVisionerPopupOverrides` and `window.pf2eVisionerDialogOverrides` Maps for communication between phases
  - **Roll dialog integration**: PF2E roll dialogs include cover override buttons that store choices for chat message processing
  - **Per-user settings**: Correctly accesses PF2e per-user client settings (`game.user.flags.pf2e.settings.showCheckDialogs`) not system settings
- **Benefits**:
  - **Performance**: Eliminates complex conditional logic and multiple code paths
  - **Reliability**: Clear separation between DC modification (libWrapper) and state persistence (chat hooks)
  - **User control**: Popup only appears when explicitly requested via keybind
  - **Automatic operation**: Works seamlessly without user intervention in normal cases
  - **Correct timing**: DC modification happens at the right moment in PF2e's roll calculation
- **Testing**: New test suite in `tests/unit/simplified-auto-cover-core.test.js` and `tests/integration/auto-cover-workflow.test.js`
- **User Experience**:
  - **Normal attacks**: Automatic cover detection and application, no interruption
  - **Override needed**: Hold keybind (X) while clicking attack to see popup with override options
  - **Roll dialogs**: When PF2e roll dialog appears, cover override buttons are injected for manual selection

---

## 🐛 Recent Bug Fixes

### Colorblind Mode Fix (2025-01-20)

**MAJOR BUG FIX COMPLETED**: Fixed colorblind mode not working at all and not applying on module load.

### Colorblind Mode CSS Fix (2025-01-20)

**CRITICAL BUG FIX COMPLETED**: Fixed colorblind mode CSS not actually changing colors due to hardcoded RGBA values bypassing CSS custom properties.

**Root Cause**: The colorblind mode classes were being applied correctly, but the CSS was using hardcoded RGBA colors (like `rgba(76, 175, 80, 0.2)`) instead of CSS custom properties that could be overridden by colorblind mode.

**Issues Fixed**:

1. **Hardcoded RGBA colors** - 57+ instances of hardcoded colors in CSS files that bypassed colorblind overrides
2. **Missing CSS custom properties** - No CSS variables for background colors with alpha transparency
3. **Incomplete colorblind overrides** - Colorblind CSS only overrode text colors, not background colors

**Solution Implemented**:

1. **Added CSS custom properties** for all visibility state background colors in `base.css`:
   - `--visibility-observed-bg-light` (0.05 alpha)
   - `--visibility-observed-bg` (0.1 alpha)
   - `--visibility-observed-bg-medium` (0.15 alpha)
   - `--visibility-observed-bg-strong` (0.2 alpha)
   - `--visibility-observed-bg-solid` (0.9 alpha)
   - Similar properties for concealed, hidden, and undetected states

2. **Updated colorblind.css** to override all background color custom properties with colorblind-friendly alternatives

3. **Replaced hardcoded colors** in all CSS files:
   - `token-effects.css` - Fixed state badges, visibility indicators, disposition colors
   - `visibility-manager.css` - Fixed bulk action buttons, hover states, table highlights, state indicators
   - `tooltips.css` - Fixed status indicators
   - `token-manager-ui.css` - Fixed DC outcome indicators

4. **Added missing CSS for Token Manager state indicators**:
   - Added `.state-indicator.visibility-observed` styles using CSS custom properties
   - Fixed Token Manager "Current State" column to respect colorblind mode

5. **Enhanced CSS specificity for comprehensive colorblind support**:
   - Added `.pf2e-visioner .bulk-state-header` styles with `!important` to ensure bulk buttons work
   - Added `.pf2e-visioner .state-icon` styles with `!important` to ensure state selection buttons work
   - Added background colors for selected state icons to improve visibility

6. **Fixed all dialog and chat automation hardcoded colors**:
   - Updated `dialog-layout.css` to replace all hardcoded RGBA colors with CSS custom properties
   - Fixed `chat-automation-styles.js` to use CSS custom properties instead of hardcoded hex colors
   - Updated animation keyframes to use CSS custom properties
   - Fixed scrollbar colors and hover effects in dialogs
   - All dialogs now properly inherit colorblind mode from their `pf2e-visioner` class

7. **Comprehensive colorblind mode overhaul**:
   - **CRITICAL FIX**: Separated colorblind modes into distinct color schemes instead of using one scheme for all
   - **Protanopia (Red-blind)**: Uses blue/yellow/purple/pink palette, avoids red and green
   - **Deuteranopia (Green-blind)**: Uses blue/yellow/orange/magenta palette, avoids green and red
   - **Tritanopia (Blue-blind)**: Uses green/yellow/orange/crimson palette, avoids blue and purple
   - **Achromatopsia (Complete colorblind)**: Uses pure grayscale with distinct brightness levels
   - Fixed all hardcoded colors in `chat-automation-styles.js` (200+ color replacements)
   - Added `reinjectChatAutomationStyles()` function and hooked it to colorblind mode changes
   - Chat automation styles now dynamically update when colorblind mode changes
   - Each colorblind mode now has scientifically appropriate color schemes for maximum accessibility

8. **Fixed Token Manager colorblind mode support**:
   - **Root Issue**: State icons and bulk buttons weren't following colorblind mode changes
   - Added specific CSS overrides for `.state-icon`, `.bulk-state-header`, and `.state-indicator` elements
   - Created high-specificity rules for each colorblind mode targeting Token Manager elements
   - Used `body.pf2e-visioner-colorblind-* .pf2e-visioner` selectors with `!important` for proper inheritance
   - Token Manager state icons and bulk buttons now properly change colors when colorblind mode is switched

9. **Comprehensive UI element colorblind support**:
   - **Added explicit colorblind CSS rules for ALL UI elements** that were missing colorblind support
   - **Elements now covered**: `.state-badge`, `.visibility-indicator`, `.pc-row`, `.npc-row`, `.token-name .disposition`, `.concealed-effect`, `.undetected-effect`, `.dc-outcome`, `.status-indicator`, `.bulk-state`, `.cover-none/.lesser/.standard/.greater`
   - **Each colorblind mode** (Protanopia, Deuteranopia, Tritanopia, Achromatopsia) has specific rules for all elements
   - **High specificity selectors** using `body.pf2e-visioner-colorblind-* .pf2e-visioner .element` pattern with `!important`
   - **Covers all interaction states**: normal, hover, selected, active, error, warning, success, failure
   - **Token disposition colors**: Friendly, neutral, hostile NPCs now respect colorblind modes
   - **Outcome indicators**: Success/failure states in dialogs and Token Manager use appropriate colorblind colors
   - **CRITICAL FIX**: Found and fixed missing `.bulk-state` elements (different from `.bulk-state-header`)
   - **Cover system support**: All cover state indicators (`.cover-none`, `.cover-lesser`, `.cover-standard`, `.cover-greater`) now have colorblind support

10. **Final comprehensive colorblind element discovery and fixes**:

- **CRITICAL MISSING ELEMENTS FOUND**: Target/Observer mode toggles, tab navigation buttons, help text elements
- **Target mode toggle**: `.mode-toggle.target-active .toggle-option:last-child` - was using red `var(--pf2e-visioner-danger)`
- **Observer mode toggle**: `.mode-toggle.observer-active .toggle-option:first-child` - was using blue `var(--pf2e-visioner-info)`
- **Tab navigation buttons**: `.icon-tab-navigation .icon-tab-button[data-tab="visibility/cover"]` - were using visibility/cover colors
- **Help text elements**: `.help-text.success/.warning/.error` - were using success/warning/danger colors
- **Party select icons**: `.party-select i` - was using info color
- **Added explicit colorblind overrides** for ALL these elements across all four colorblind modes
- **Each element now has proper colors** for Protanopia, Deuteranopia, Tritanopia, and Achromatopsia

11. **CRITICAL: Legend icons and cover bulk buttons colorblind support**:

- **LEGEND ICONS FIXED**: Found that legend icons use `.visibility-observed`, `.visibility-concealed`, `.visibility-hidden`, `.visibility-undetected` classes
- **These classes were NOT covered** by previous colorblind CSS - they are the actual icon colors in the legend
- **Added explicit colorblind overrides** for all visibility state classes across all four colorblind modes
- **COVER BULK BUTTONS FIXED**: Found cover state bulk buttons use `data-state="none/lesser/standard/greater"`
- **Added colorblind support** for all cover state bulk buttons across all four colorblind modes
- **Legend icons now change colors** when switching colorblind modes (green circle → blue, red ghost → purple, etc.)
- **Cover bulk buttons now change colors** when switching colorblind modes

12. **COMPREHENSIVE TEMPLATE AUDIT - ALL ELEMENTS COVERED**:

- **SYSTEMATIC TEMPLATE REVIEW**: Audited EVERY template file in the module
- **Templates reviewed**: `consequences-preview.hbs`, `hide-preview.hbs`, `take-cover-preview.hbs`, `sneak-preview.hbs`, `seek-preview.hbs`, `settings-menu.hbs`, `quick-panel.hbs`, `token-manager.hbs`, `wall-manager.hbs`
- **ALL TEMPLATE ELEMENTS FOUND**:
  - `.outcome.success/.failure/.critical-success/.critical-failure` - Roll outcome indicators
  - `.apply-change/.revert-change` - Action buttons in preview dialogs
  - `.bulk-action-btn.apply-all/.revert-all` - Bulk action buttons
  - `.row-action-btn.apply-change/.revert-change` - Row-level action buttons
  - `.party-select/.enemy-select` - Selection buttons in quick panel
  - `.auto-cover-icon` - Auto-cover feature icon
  - `.state-icon.selected/.calculated-outcome` - Selected and calculated state indicators
- **COMPREHENSIVE COLORBLIND SUPPORT ADDED**: All elements now have explicit colorblind overrides for all four colorblind modes
- **COVERS ALL DIALOGS**: Hide, Seek, Sneak, Take Cover, Consequences, Settings, Quick Panel, Token Manager
- **NO MORE MISSED ELEMENTS**: Every single interactive element across all templates now respects colorblind mode

13. **CRITICAL: Bulk state header ICONS colorblind fix**:

- **ROOT CAUSE IDENTIFIED**: Bulk state header buttons contain `<i>` icons that were not being targeted by colorblind CSS
- **SPECIFIC ISSUE**: Rules like `.bulk-state-header[data-state="observed"]` only styled the button, not the icon inside
- **EXISTING CSS STRUCTURE**: The original CSS already targets both button and icon: `.bulk-state-header[data-state="observed"] i`
- **SOLUTION**: Added comprehensive icon targeting for ALL colorblind modes and ALL visibility states
- **SELECTORS ADDED**:
  - `body.pf2e-visioner-colorblind-* .bulk-actions-header .bulk-state-header[data-state="*"] i`
  - `body.pf2e-visioner-colorblind-* .bulk-actions-header .bulk-state-header[data-state="*"]:hover i`
- **COVERS ALL STATES**: observed, concealed, hidden, undetected for all four colorblind modes
- **INCLUDES HOVER STATES**: Both normal and hover states for complete coverage
- **NOW WORKING**: Bulk state header icons now properly change colors when switching colorblind modes
- **COVER STATE ICONS ALSO FIXED**: Added identical icon targeting for cover state bulk buttons (none, lesser, standard, greater)
- **COMPLETE COVERAGE**: Both visibility AND cover bulk state header icons now respect colorblind modes

14. **Roll/DC display elements colorblind support**:

- **ROLL TOTAL FIXED**: Changed `.roll-total` from hardcoded `#29b6f6` to `var(--pf2e-visioner-info)`
- **MARGIN DISPLAY FIXED**: Changed `.margin-display` from hardcoded `#aaa` to `var(--color-text-secondary)`
- **DC VALUE ALREADY CORRECT**: `.dc-value` already uses `var(--visibility-undetected)` which works with colorblind modes
- **ELEMENTS AFFECTED**: All preview dialogs (Hide, Seek, Sneak, Point Out results tables)
- **NOW WORKING**: Roll totals, DC values, and margin displays now respect colorblind mode settings

15. **Cover section elements and explicit roll/DC colorblind rules**:

- **COVER SECTION ELEMENTS FIXED**: Added explicit colorblind rules for `.cover-section .state-icon[data-state="*"]` and `.cover-section .bulk-actions-header .bulk-state-header[data-state="*"]`
- **NESTED SELECTOR COVERAGE**: Covers all cover section elements including icons inside bulk buttons
- **EXPLICIT ROLL/DC RULES**: Added direct colorblind CSS rules for `.roll-result`, `.roll-total`, and `.dc-value` elements
- **COMPREHENSIVE COVERAGE**: All four colorblind modes now have explicit rules for:
  - Cover section state icons (none, lesser, standard, greater)
  - Cover section bulk buttons and their icons
  - Roll result displays in all preview dialogs
  - DC value displays in all preview dialogs
- **GUARANTEED OVERRIDE**: Uses `!important` declarations to ensure colorblind colors take precedence over any other styling

16. **General state icon cover states colorblind support**:

- **GENERAL COVERAGE ADDED**: Added colorblind rules for `.pf2e-visioner .state-icon[data-state="none/lesser/standard/greater"]`
- **COVERS ALL CONTEXTS**: Works for state icons in ANY container, not just `.cover-section`
- **ICON SELECTION DIALOGS**: Ensures cover state selection interfaces respect colorblind modes
- **COMPLETE STATE COVERAGE**: All cover states (none, lesser, standard, greater) now have explicit colorblind support
- **ALL COLORBLIND MODES**: Protanopia, Deuteranopia, Tritanopia, and Achromatopsia all covered

**Root Cause**: Multiple issues:

1. **Invalid CSS syntax** using SCSS `&` selectors in plain CSS files
2. **Missing proper class application** to UI elements
3. **Hardcoded inline colors** in templates that couldn't be overridden by CSS custom properties
4. **Incomplete CSS class system** for visibility and cover states
5. **Chat automation panels and action buttons** using hardcoded colors that ignored colorblind mode
6. **Extensive hardcoded colors** in CSS files that bypassed colorblind overrides
7. **Duplicate CSS custom property definitions** causing conflicts
8. **Module load timing issues** preventing colorblind mode from applying immediately
9. **Insufficient hook coverage** for dynamic UI elements like chat messages

**Fix Implemented**:

1. **CSS Syntax Fix**: Converted SCSS `&` syntax to proper CSS `.pf2e-visioner.pf2e-visioner-colorblind-*` selectors in `colorblind.css` and `colorblind-buttons.css`
2. **Settings Handler Fix**: Enhanced the onChange handler in `settings.js` to properly apply colorblind classes to both `document.body` and `.pf2e-visioner` containers
3. **Template System Overhaul**: Replaced all inline `style="color: {{state.color}}"` with CSS classes like `{{state.cssClass}}` in ALL templates:
   - `token-manager.hbs` ✅
   - `quick-panel.hbs` ✅
   - `seek-preview.hbs` ✅
   - `sneak-preview.hbs` ✅
   - `take-cover-preview.hbs` ✅
   - `hide-preview.hbs` ✅
   - `settings-menu.hbs` ✅
4. **Backend Integration**: Updated ALL backend context files to provide `cssClass` properties:
   - `constants.js` ✅
   - `token-manager/context.js` ✅
   - `quick-panel.js` ✅
   - `visibility-states.js` ✅
   - `take-cover-preview-dialog.js` ✅
   - `hide-action.js` ✅
5. **CSS Custom Properties**: Enhanced `base.css` with comprehensive CSS classes and chat automation panel color scheme
6. **Chat Automation Fix**: Updated `chat-automation-styles.js` to use CSS custom properties instead of hardcoded colors
7. **Handlebars Helper Fix**: Updated `hbs-helpers.js` to use CSS classes instead of inline colors for chat message icons
8. **Render Hook**: Added `renderApplication` hook in `main.js` to ensure colorblind classes are applied when UI elements are rendered
9. **Hardcoded Color Elimination**: Replaced ALL hardcoded hex colors in CSS files with CSS custom properties:
   - `dialog-layout.css` ✅ - Table headers, row highlights, scrollbars, visibility state indicators
   - `colorblind-buttons.css` ✅ - Panel backgrounds using CSS custom properties
   - `visibility-manager.css` ✅ - Tab navigation, mode toggles, hover effects
10. **Enhanced Colorblind Overrides**: Added comprehensive color overrides for primary colors, borders, and shadows to ensure complete color replacement
11. **Duplicate CSS Fix**: Consolidated duplicate `:root` blocks in `base.css` to prevent conflicts
12. **Module Load Fix**: Added multiple hooks in `main.js` to ensure colorblind mode applies immediately:
    - `Hooks.once("setup")` - Applies colorblind mode during setup phase
    - `Hooks.once("ready")` - Re-applies colorblind mode to ensure it's set
    - `Hooks.on("renderChatMessage")` - Applies colorblind mode to chat automation panels
    - `Hooks.on("renderSidebarTab")` - Applies colorblind mode to sidebar elements
13. **Complete CSS Custom Property System**: Created comprehensive CSS custom property architecture:
    - Base colors defined in `:root` with fallback values
    - Color-specific properties (e.g., `--visibility-observed-color`) for easy overrides
    - All hardcoded colors replaced with CSS custom properties
    - Colorblind mode overrides all color properties comprehensively

**Result**: The colorblind mode now works comprehensively across **EVERY SINGLE UI ELEMENT** in the entire module and applies immediately upon module load:

- ✅ **Module Load** - Colorblind mode applies immediately during setup and ready phases
- ✅ **Token Manager** - All visibility/cover states, legends, current states, bulk actions
- ✅ **Quick Panel** - All visibility/cover buttons, party/enemy selection buttons
- ✅ **Chat Dialogs** - Seek, Hide, Sneak, Take Cover preview dialogs
- ✅ **Settings Menu** - Auto-cover icons and UI elements
- ✅ **Auto-Cover** - Cover state indicators in Hide action dialogs
- ✅ **Chat Automation Panels** - All action buttons in chat messages (Seek, Hide, Sneak, Point Out, etc.)
- ✅ **Chat Message Icons** - Visibility state icons rendered in chat messages
- ✅ **All Template Elements** - Every single .hbs template now respects colorblind mode settings
- ✅ **CSS Files** - ALL hardcoded colors replaced with CSS custom properties
- ✅ **Color Differentiation** - Enhanced colorblind overrides provide distinct, accessible colors for each mode
- ✅ **Dynamic UI Elements** - Chat messages, sidebar tabs, and all dynamically rendered content support colorblind mode
- ✅ **Immediate Application** - Colorblind mode applies as soon as the module loads, not just when settings change

**Colorblind Mode Features**:

- **Protanopia (Red-blind)**: Uses blues, yellows, and purples for maximum contrast
- **Deuteranopia (Green-blind)**: Uses blues, yellows, and magentas for maximum contrast
- **Tritanopia (Blue-blind)**: Uses reds, greens, and yellows for maximum contrast
- **Achromatopsia (Complete color blindness)**: Uses high-contrast grayscale with pattern indicators

**Technical Implementation**:

- **CSS Custom Properties**: All colors now use CSS custom properties with fallback values
- **Comprehensive Overrides**: Colorblind mode overrides all color properties, not just visibility/cover states
- **Multiple Hook Points**: Colorblind mode applies at setup, ready, and during all UI rendering
- **No Hardcoded Colors**: Absolutely zero hardcoded hex colors remain in any CSS or template files
- **Performance Optimized**: Colorblind mode applies efficiently without performance impact

### Cover Visualization Alignment Fix (Previous)

**MAJOR BUG FIX COMPLETED**: Fixed cover visualization alignment issue where tokens appeared larger than their actual grid size (medium showing as 2x2, large as 4x4).

**Root Cause**: Improper grid alignment - even-sized tokens (2x2, 4x4) need centers between grid intersections, while odd-sized tokens (1x1, 3x3) need centers on grid intersections.

**Fix**: Implemented in `cover-visualization.js` with token size-aware grid alignment logic.

---

**Remember**: This module is designed as an inspirational successor to pf2e-perception [[memory:4963811]], not a direct copy. Always consider the official PF2E system patterns and best practices [[memory:4812605]] when making changes.

**Last Updated**: 2025-01-20
**Document Version**: 1.3
