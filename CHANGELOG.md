# Changelog

## [4.0.0] - 2025-10-03

### 🎉 Major Release - Architecture Refactor & Enhanced Automation

This is a **major release** featuring comprehensive refactoring, new automation features, and critical bug fixes.

### ✨ New Features

#### Enhanced Sneak Mechanics

- **Improved State Management**: Sneak actions now properly track and manage visibility states throughout the action lifecycle
- **Visual Indicators**: Enhanced feedback for sneaking tokens with improved UI
- **End-of-Turn Position Validation**: New dialog system for validating position requirements at turn end with defer functionality
- **AVS Control Integration**: Sneak and Hide actions now properly integrate with Auto Visibility System (AVS) control logic
- **Sneak-Aware Filtering**: Override validation indicator now filters appropriately based on sneak states

#### Region Behavior Enhancements

- **Visibility Region Behavior**: Added new visibility types to region behavior system
- **Concealment Region Behavior**: New concealment region type with proper activation/deactivation
- **Improved Logic**: Optimized concealment region behavior with better detection and state management

#### Feat Support

- **Camouflage Feat**: Implemented Camouflage feat support to bypass cover/concealment requirements in natural terrain
  - Properly evaluates terrain stalker selections
  - Integrates with cover and concealment detection
- **Terrain Stalker**: Enhanced Terrain Stalker logic to correctly relax end position requirements

#### Chat Automation Improvements

- **Enhanced Dialogs**: Improved filtering logic in chat dialogs (Seek, Hide, Sneak, Consequences, Point Out) for better clarity and consistency
- **Consequences Dialog**: Refactored preview dialog and action handler with improved error handling and override management
- **Override-Only Consequences**: Consequences button now only shows for overrides, reducing clutter

#### Visibility Detection

- **Lifesense Detection**: Enhanced lifesense detection by adding trait checks
  - Detects "mindless" trait for undead/constructs
  - Updated related visuals and tests
- **Acuity Preservation**: VisionAnalyzer now preserves sense acuity information for better detection accuracy

### 🔄 Refactoring & Architecture

#### Visibility System Refactor

- **New Calculation Workflow**: Implemented completely new visibility calculation workflow with comprehensive separation of concerns
- **StatelessVisibilityCalculator**: Main calculation logic extracted to ~200 lines (from 900+ lines)
  - Extracted 22+ focused methods with single responsibilities
  - Improved readability and maintainability
  - Modular, debuggable architecture
- **Movement Action Integration**: Refactored visibility calculation logic to incorporate movement actions and sound blocking
- **AVS Control Mechanism**: Added Auto Visibility System control flags to manage visibility state automation

#### Code Quality Improvements

- **Event Listener Management**: Simplified event listener management and cleanup in hover tooltips
- **Error Handling**: Enhanced error handling when removing token event listeners
- **Flag Management**: Comprehensive improvements to flag management and cleanup processes
- **Test Structure**: Enhanced test structure with better mocks and clearer organization

### 🐛 Fixed

#### Critical Visibility Bugs

- **Greater Darkvision Feat Detection**: Fixed critical bug where player characters with the Greater Darkvision feat could not see through rank 4 magical darkness
  - **Root Cause**: VisionAnalyzer was only checking `actor.system.perception.senses`, which the PF2e system doesn't always populate when vision comes from feats (vs. ancestry traits)
  - **Solution**: Added fallback mechanism to explicitly check actor feats when vision capabilities aren't found in senses
  - **PF2e Rules Compliance**: Now correctly implements:
    - Greater Darkvision + rank 4+ darkness = **observed** ✓
    - Darkvision + rank 4+ darkness = **concealed** ✓
    - No darkvision + rank 4+ darkness = **hidden** ✓
  - **Backward Compatible**: Senses always take priority over feats; only applies feat detection as fallback

- **Darkvision Feat Detection**: Also fixed detection of regular Darkvision feat using the same fallback mechanism

#### Wall & Vision Fixes

- **Wall Change Cache Clearing**: Wall property changes now trigger proper cache clearing for VisionAnalyzer
  - Wall direction changes (left → both) immediately recalculate visibility
  - Sight/sound blocking changes immediately update detection states
  - Observer conditions (deafened, blinded) properly re-evaluated after wall changes

- **Line of Sight in Darkness**: Adjusted line of sight checks to properly account for magical darkness in visibility calculations
  - Now correctly handles cross-boundary darkness scenarios
  - Improved detection of darkness along vision rays

- **Sight Blocking Logic**: Refined vision analyzer tests to use `canvas.walls.checkCollision` for accurate sight blocking
  - More consistent with Foundry's native vision system
  - Better integration with Wall Height module

#### Cover Detection Fixes

- **Wall Blocking Logic**: Updated wall blocking logic in CoverDetector for improved readability and accuracy
  - Wall direction tests adjusted to reflect changes in cover override logic
  - Better handling of partial walls and directional blocking

#### Action & Dialog Fixes

- **Visibility State Trust**: Updated visibility handling to trust AVS/getVisibilityBetween results
  - Removed redundant 'concealed' checks from conditions
  - Improved error logging in visibility helpers

- **Override Indicator**: Enhanced override indicator handling with proper cleanup
  - Fixed cleanup method calls after token deletion
  - Proper event listener removal

- **Tooltip Management**: Cleaned up tooltip visibility handling during canvas panning and hovering
  - Tooltips now properly hide during panning
  - Better state management for hover interactions

#### Feat Logic Fixes

- **Feat Qualification**: Removed unnecessary start qualification checks for Camouflage and other feats
  - Simplified feat handling logic
  - Clearer requirements for cover/concealment bypass

### 🗑️ Removed

- **Client Viewport Filtering**: Removed client viewport filtering feature as it was causing performance issues
  - Updated related references in code and tests
  - Simplified rendering pipeline

- **Deprecated Tests**: Removed outdated test suites
  - Echolocation and legacy lifesense tests (replaced with new implementation)
  - Override removal tests for action dialogs (functionality moved)

### 🔧 Technical

#### Test Coverage

- **Comprehensive New Tests**: Added extensive test suite for new features
  - Greater Darkvision feat detection tests (unit, integration, debug)
  - Wall change cache clearing tests
  - Sneak mechanics and filtering tests
  - Region behavior tests
  - AVS control mechanism tests
  - Lifesense trait detection tests

- **Test Refactoring**: Refactored existing tests for clarity and consistency
  - Greater Darkvision feat tests restructured
  - Import verification tests updated
  - Direction-aware override tests enhanced

#### Performance

- **Batch Processing Optimizations**: Enhanced visibility handling with movement detection and batch processing
  - Reduced redundant calculations
  - Better caching strategies
  - Improved AVS override cleanup

#### Documentation

- **Comprehensive Guidelines**: Added extensive PF2E Visioner development guidelines
  - Architecture documentation updated
  - Copilot instructions enhanced
  - Debug guides for Wall Height integration

#### Debug & Logging

- **Enhanced Debug Messages**: Added debug logging for feat-based vision detection
- **Import Verification**: Better import count verification in tests
- **Error Messages**: Improved error messages throughout the codebase

### ⚠️ Breaking Changes

While we've maintained backward compatibility where possible, this major version includes:

- **Refactored Visibility Calculation API**: Internal visibility calculation methods have new signatures
  - Public API remains unchanged
  - Internal integrations may need updates
- **AVS Control Flags**: New control mechanism may affect custom integrations with visibility system
- **Region Behavior Types**: New region behavior types may require scene updates for advanced users

### 📊 Statistics

- **Test Suites**: 134+ test suites, 1556+ tests passing
- **Code Reduction**: Main visibility calculator reduced by 78% (900 → 200 lines)
- **New Methods**: 22+ new focused methods in visibility calculation
- **Files Modified**: 50+ files updated across the codebase

---

## [3.1.5] - 2025-09-06

### 🐛 Fixed

- **Token Manager**: Target mode will show perception dc correctly again
  - Changed to partials usage instead of monoith template

## [3.1.4] - 2025-09-06

### 🐛 Fixed

- **Manual Cover**: Fixed Stealth and Saving Throw rolls handling of manual cover

## [3.1.3] - 2025-09-06

### 🐛 Fixed

- **Manual Cover**: Had an issue that only the first token gets the bonus, this is now fixed
  - Auto cover will trigger automatically if manual cover is set to 'none' if you really need no cover, use override methods

## [3.1.2] - 2025-09-05

### ✨ New Features

- **Manual Cover Indicators For Attack rolls**: Added visual indicators in chat messages of attack rolls to show when manual cover is applied, blocked override when manual cover is detected

- **Wall manager**:
  - Added progress bar and enhanced performance of updates
  - Added keybind to open wall manager

### 🐛 Fixed

- **Enforce RAW with Manual Cover**: Fixed manual cover doesnt qualify for enforce raw

- Fixed ephemeral effects duplication bug where rules were being added repeatedly on page refresh
- Improved rule deduplication in cover aggregates to prevent multiple identical rules
- Enhanced canonicalization process to prioritize higher cover bonuses when rules conflict
- Added defensive GM-only checks to prevent effect creation/deletion race conditions
- Improved error handling and logging for ephemeral effect management

## [3.1.1] - 2025-09-05

### 🐛 Fixed

- **Manual Cover Fixes**: Fixed issues with manual cover detection and application when it needs to take precedence over auto cover situations

- **Behavior Activation/Deactivation**: Fixed region behavior state management
  - **Activation**: Region behaviors now properly run activate when behavior is activated
  - **Deactivation**: Region behaviors now properly run when behavior is deactivated

## [3.1.0] - 2025-01-20

### ✨ New Features

#### Region Behavior System

- **PF2e Visioner Region Behavior**: Added custom region behavior for automatic visibility management
  - **Visibility State Control**: Set visibility state (observed, concealed, hidden, undetected) for tokens
  - **Inside Token Control**: Optional checkbox to apply visibility state between tokens inside the region
  - **Two-Way Region**: Optional checkbox to make tokens outside the region have the same visibility state to tokens inside
  - **Clean Exit**: Visibility relationships are reset to 'observed' when tokens exit regions
  - **Integration**: Fully integrated with existing PF2e Visioner visibility system and effects

- **Token config**: Add configs to protoype tokens config

### 🐛 Fixed

- **Point out dialog**: Weird rectangle is now gone
- **All Dialogs**: Names will be wrapped on word breaks

## [3.0.6] - 2025-09-02

### ✨ Enhanced

- **Wall Manager**: Added select and go to wall
- **Auto cover from walls**: Another grooming to the algorithm

## [3.0.5] - 2025-09-02

### 🐛 Fixed

#### Cover Detection

- **Door State Awareness**: Fixed cover calculation to properly respect door states
  - **Open doors/secret doors** no longer provide cover (consistent with Foundry's vision system)
  - **Closed/locked doors/secret doors** continue to provide cover as normal walls
- **Cover Override Precedence**: Cover overrides now take precedence over door states
- **Action Dialogs**: Use portraits instead of token images

### 🔧 Technical

## [3.0.4] - 2025-09-02

### ✨ Enhanced

#### Dialogs

- **Click on token image to go to current row token**: will select and pan to the token
- Name column word wrap

## [3.0.3] - 2025-09-02

### ✨ Enhanced

#### Wall Manager Interface Overhaul

- **Scrollable Table**: Added scrollable table container
- **Search & Filter System**: Comprehensive search and filter functionality:
  - **Text Search**: Search by identifier or wall ID with debounced input
  - **Type Filter**: Filter by Walls, Doors, or Secret Doors
  - **Hidden Filter**: Show only hidden walls, non-hidden walls, or all
  - **Cover Filter**: Filter by cover override type (Auto, None, Standard, Greater)
  - **Live Counter**: Shows total wall count and currently visible count
  - **Clear Filters**: One-click button to reset all filters
- **Clickable Wall Type Images**: Replaced dropdown with clickable wall type images:
  - **Left-click**: Cycles forward through Wall → Door → Secret Door
  - **Right-click**: Cycles backward through Wall → Secret Door → Door
  - **Visual Feedback**: Hover effects with orange border and scaling animations
- **Bulk Cover Actions**: Added bulk cover override buttons in header:
  - **Cover: Auto**: Sets all walls to automatic cover detection
  - **Cover: None**: Sets all walls to never provide cover
  - **Cover: Standard**: Sets all walls to maximum standard cover
  - **Cover: Greater**: Sets all walls to maximum greater cover

### 🔧 Technical Improvements

- **Performance**: Debounced search input for better performance with large datasets
- **Cover Priority Logic**: Simplified cover detection to prioritize walls when any wall provides cover, otherwise prioritize token blockers

## [3.0.2] - 2025-09-02

### 🔧 Fixed

#### Cover System Architecture Improvements

- **Wall Side Detection**: The algorithm was backwards, this is fixed

## [3.0.1] - 2025-09-01

### 🐛 Fixed

#### Wall Coverage Calculation Improvements

- **Directional Wall Logic**: Fixed critical bug where RIGHT directional walls weren't providing cover when attacked from the correct side
- **Coverage Percentage Accuracy**: Improved wall coverage percentage calculation by removing arbitrary center weight reduction that could underestimate cover
- **Foundry VTT Constants**: Updated directional wall logic to properly use Foundry's wall direction constants (BOTH: 0, LEFT: 1, RIGHT: 2)
- **Sampling Density**: Increased sampling points around target perimeter from 3 to 4 per edge for more accurate coverage detection
- **Corner Sampling**: Added explicit corner point sampling for better PF2e rule compliance
- **Cross-Product Calculation**: Enhanced mathematical precision in directional wall blocking logic

#### Point Out Action System Enhancements

- **ApplicationV2 Warning Dialogs**: Converted Point Out target selection warnings to modern Foundry ApplicationV2 framework
- **Player/GM Warning System**: Added comprehensive warning dialogs for when attempting Point Out without target selection

## [3.0.0] - 2025-09-01

### 🎉 Major Release - Advanced Visibility and Cover Toolkit

This major release represents a complete architectural overhaul, transforming PF2E Visioner from a perception toolkit into a comprehensive visibility and cover management system. The module has been rebuilt from the ground up with a modular auto-cover system, enhanced UI components, and extensive new features for tactical gameplay.

### ✨ New Features

#### 🛡️ Auto-Cover System (Complete Architectural Rewrite)

- **Modular Architecture**: Brand new auto-cover system with specialized components:
- **Enhanced Detection Modes**: Multiple intersection algorithms for precise cover calculation:
  - **Any Mode**: Ray intersects any part of blocker token
  - **10% Mode**: Grid-square-based intersection 10% threshold (default mode)
  - **Coverage Mode**: Percentage-based side coverage
  - **Tactical Mode**: Corner-to-corner line-of-sight using "best attacker corner" rule
- **Template Integration**: Full support for area effects and templates with proper cover bonuses
- **Elevation Integration**: Automatic height and elevation consideration across all modes
- **Directional Wall Support**: Walls with direction properties properly block cover only from intended sides using cross-product calculations
- **Wall Cover Status Display**: Alt+hover displays cover status labels

#### 🎯 Enhanced UI Components

- **Cover Override Management**: Comprehensive override system with ceiling behavior
- **Enhanced Dialogs**: Hide and Sneak dialogs now show cover information by default
- **Token Quick Panel**: Streamlined interface for rapid visibility state changes
- **Wall Management**: Enhanced wall tools with type indicators and quick toggles

### 🚀 Enhanced Features

#### Chat Automation Enhancements

- **Cover Integration**: Actions now consider cover prerequisites and bonuses

### 🐛 Fixed

- **Directional Wall Coverage**: Fixed issue where directional walls weren't properly respected due to Foundry's built-in collision detection bypassing custom logic
- **Tooltip System**: All tooltips now use proper data-tooltip properties instead of deprecated title attributes
- **Action Button Behavior**: Fixed "Apply All" and individual action buttons across all dialog types
- **State Persistence**: Improved flag management and state synchronization
- **Memory Management**: Enhanced cleanup of visual effects and temporary states
- **Token Filtering**: Fixed encounter filtering and ally detection across all actions
- **Cover Calculation**: Resolved edge cases in cover detection algorithms
- **UI Responsiveness**: Fixed dialog sizing and scrolling behavior
- **Socket Communication**: Improved reliability of multiplayer operations
- **Memory Optimization**: Reduced heap usage through efficient data structures

### 📋 Migration Notes

Users upgrading from 2.x should be aware that:

- Settings may need to be reconfigured due to reorganization
- Custom macros using the old API may need updates
- Some visual effects behavior may differ due to the new system
- Performance should be significantly improved, especially for large scenes

This release represents the most significant update to PF2E Visioner since its inception, providing a solid foundation for future enhancements while dramatically improving performance, reliability, and user experience.

## [2.7.1] - 2025-08-28

### Added

- Ability to hide quick edit button @camrun91

### Fixed

- Attack consequences displaying on non attack @camrun91
- Hide results showing on various checks @camrun91
- Sneak results could show on other checks @camrun91

## [2.7.0] - 2025-08-23

### Added

- Auto-cover: 3d sampling mode (experimental) will take creature elevation and size into consideration for both auto cover and visualization
- Visioner tools: add option to hide them

### Fixed

- Seek showing for messages with 'seek' text in them
- Colorblind support for tooltips
- Take cover showing for current conditions message
- Allow players to change client settings

## [2.6.9] - 2025-08-23

### Fixed

- Tests

## [2.6.8] - 2025-08-23

### Improved

- **Cover Visualization Performance**: Limit computation to the current viewport (with small padding) instead of scanning large scene areas. Significantly reduces work when zoomed/panned.

### Fixed

- **Viewport Conversion Reliability**: Use `canvas.stage.worldTransform.applyInverse` for screen→world mapping in `getViewportWorldRect()` to ensure correct results across PIXI versions. Removed earlier manual inverse math.
- Removed the overly restrictive GM-only wall-blocking prefilter from visualization iteration; viewport limiting now applies to all users while existing fog-of-war/visibility checks remain.

- Auto cover: no roll dialog will use off guard when applicable too

## [2.6.7] - 2025-08-21

### Fixed

- Color blind modes

### Added

- Quick edit - added party and enemies selectors
- Auto cover - show to gms if cover was overridden by any method

## [2.6.6] - 2025-08-21

### Fixed

- Ignore allies in visibility manager
- Auto cover for non roll dialog
- Per row rever will not revert all now

### Added

- MANY tests

## [2.6.5] - 2025-08-20

### Added

- **Cover Visualization**: Implemented fog of war awareness for cover grid
  - Players only see cover squares in areas they can currently see (respects fog of war)
  - Hidden/fogged areas show no cover visualization squares at all
  - Integrates with Foundry VTT's vision system to check grid position visibility
  - Prevents tactical information leakage in unexplored or currently invisible areas

- **Cover Visualization**: Enhanced token filtering to exclude non-blocking entities
  - Loot tokens no longer create gray "holes" in cover visualization
  - Hazard tokens no longer interfere with cover grid display
  - Only actual creatures and NPCs count for position occupation checks

- **Cover Visualization**: Implemented wall-based line-of-sight blocking for cover grid
  - Players see black squares instead of cover information for positions blocked by walls
  - Aggressive LOS blocking algorithm ensures clean visual separation at wall boundaries
  - Added comprehensive test coverage for wall blocking functionality

### Improved

- **Cover Visualization**: Enhanced drawing logic to completely hide squares in fogged areas
- **Cover Visualization**: More accurate token occupation detection for cover calculations

## [2.6.4] - 2025-08-19

### Fixed

- **Attack Consequences Dialog**: Fixed "Apply All" button showing "No visibility changes to apply" when there are actionable changes
  - Added test coverage to prevent similar bugs in the future

- **Seek Dialog**: Fixed "Error reverting change" when using per-row revert after apply-all
  - Revert operations now work correctly in the "Apply All → Per-Row Revert" sequence
  - Added test coverage to prevent similar bugs in the future

## [2.6.3] - 2025-08-19

### Fixed

- Tests

## [2.6.2] - 2025-08-19

### Fixed

- **Critical Bug Fixes - All Major Action System Issues Resolved**:
  - **Sneak Action**: "Apply Changes" button now correctly applies Undetected instead of Hidden on critical success
  - **Consequences Action**: "Apply All" now works correctly with Ignore Allies setting
  - **Create a Diversion Action**: "Apply All" now properly applies effects and respects Ignore Allies setting
  - **Seek Action**: "Apply Changes" now properly respects the Ignore Allies setting
  - **Individual Revert Buttons**: Now only revert the specific creature's outcome instead of all outcomes
  - **Ignore Allies Filter Logic**: Fixed inconsistencies across all actions when toggling Ignore Allies in dialogs
  - **Parameter Passing**: Fixed inconsistent parameter passing between dialogs and action handlers
  - **State Management**: Fixed dialog state tracking for bulk actions

- **Auto cover visualization**: undetected or foundry hidden will show as no cover

- **Enhanced Purge Functionality**:
  - Purge tool now intelligently detects selected tokens
  - Any tokens selected: Offers to clear all selected tokens' Visioner data with comprehensive cleanup (same as scene purge)
  - No tokens selected: Offers to clear entire scene data
  - More targeted cleanup options for better workflow efficiency

- **Comprehensive Testing Coverage Added**:
  - Added 586 comprehensive tests across 26 test suites
  - Real HTML5 canvas integration testing with actual drawing operations
  - Complete bug regression prevention testing
  - All action types thoroughly tested (Sneak, Hide, Seek, Point Out, Take Cover, Create a Diversion, Consequences)
  - All UI interactions tested (Apply Changes, Apply All, Revert All, Individual buttons)
  - Performance testing for large token sets and wall operations
  - Error handling and edge case coverage

### Changed

- Enhanced test infrastructure with Jest testing framework
- Added real canvas testing capabilities with `canvas` npm package
- Improved mock system for Foundry VTT globals in testing environment

## [2.6.1] - 2025-08-19

### Fixed

- AZERTY keyboard support (maybe??)
- Dont show attack consequences on damage taken messages
- Cover Visualization:
  - Allow hover and then hold keybind and not just keybind and then hover, also change default to Y

## [2.6.0] - 2025-08-19

### Added

- Toolbars reorganization:
  - Moved Visioner controls into native Foundry tool groups:
    - Tokens: Quick Edit, Provide Auto‑Cover toggle, Purge Scene Data
    - Walls: Wall Manager, Provide Auto‑Cover toggle, Hidden Wall toggle
  - Removed the standalone Visioner tool
- Wall Manager QoL:
  - Row highlight sync when selecting walls on the canvas
  - New Type column with icons/images for Wall, Door, Secret Door
- Consistent wall imagery via shared `getWallImage(doorType)` used across Visibility Manager and Wall Manager (Secret Door now distinct)

- **Cover Visualization System**: Interactive tactical positioning aid for cover analysis
  - Hold configurable keybind (default: Shift) while hovering over targets to activate
  - Shows colored grid overlay indicating cover levels at each position against hovered token
  - Color coding: Green (No Cover), Yellow (Lesser +1 AC), Orange (Standard +2 AC), Red (Greater +4 AC)
  - White square highlights selected token's current position
  - Dynamic range calculation automatically expands to cover all tokens on scene
  - Works for all auto-cover intersection modes (Any, 10%, Coverage, Tactical)
  - Client-specific rendering - each player sees only their own visualization
  - Player-configurable keybindings via FoundryVTT's native Controls settings
  - Optional encounter-only restriction setting
  - Smart occupation filtering - excludes squares occupied by other tokens (except tiny creatures sharing space)

- **Enhanced Auto-Cover Modes**: Refined intersection algorithms and added tactical for better tactical accuracy (NOT as pf2e rules)
  - **Tactical Mode**: Corner-to-corner line-of-sight calculations using "best attacker corner" rule
  - **Coverage Mode**: Side coverage algorithm with fixed 50% (Standard) and 70% (Greater) thresholds
  - **Any Mode**: Attack ray passes through blocker with any %
  - **10% Mode**: Grid-square-based intersection threshold - default mode

### Changed

- Token and Wall toggles semantics unified to “Provide Auto‑Cover” (ON = provides cover):
  - Tokens: invert `ignoreAutoCover` flag handling; active shows shield icon
  - Walls: `provideCover` true when active; shield icon when ON
- Increased Type icon size in Wall Manager for readability
- Hide auto cover dc reduction now also applies for manual cover (if the setting is on)
- Damage consequences changed to Attack consequences
- Aligned outcome for concealed and some action states

### Fixed

- Removed deprecated PerceptionManager.refresh calls; visuals update without deprecation warnings
- Encounter filter: ensured token‑ID matching to prevent non encounter copies of the same token filtered correctly
- **Tiny Creature Handling**: Improved calculations for tiny creatures auto cover
- Seek templates on rerolls now behave better

## [2.5.3] - 2025-08-17

### Fixed

- Tooltips: some more optimizations
- API: make sure auto cover skips blockers that have the same id as the controlled token

## [2.5.2] - 2025-08-17

### Added

- Take cover: support converting system effect to visioner one(for people that use the macro and dont just post the action in chat)
  - will bypass visioner take cover automation and will set to the effect selected by the system effect (basicaly will not increment the cover based on the current cover state)

### Fixed

- Tooltips: fixed all hover tooltips state and keyboard tooltips states (should be much more stable)
- Familiars will not be filtered when the encounter filter is turned on

## [2.5.1] - 2025-08-17

### Fixed

- Seek Action: when changing system condition to visioner, change it also to any player that doesnt have it's own visioner flag with the target

## [2.5.0] - 2025-08-17

### Added

- Quick panel:
  - Compacted the design a bit
  - Added minimize button to keep it handy when you need it
  - Added a keybind to open and close quick panel (default Ctrl-Shift-Q)
- Hidden walls:
  - Per scene wall indicator width slider
- Seek Action:
  - Support system conditions -> if a token has been set with a system condition (hidden\undetected) and the seek dialog is opened
    visioner will replace the system condition with it's own flags and reflect that in the results
- API:
  - Add getAutoCoverState function between a token and a target
- Enforce RAW:
  - Will now utilize auto cover(if turned on) to pass the prequisite for hide
- Hide:
  - New setting to add auto cover to the dialog (it will reduce dc instead of adding modifiers to the roll , default off)

### Fixed

- Seek Action: Hidden walls now properly appear in Seek template results
  - Template filtering now works correctly for both tokens and walls

### Changed

- Quick panel:
  - removed refresh button, now refreshes automatically when adding\removing selected tokens and adding\removing targeted tokens

## [2.4.0] - 2025-08-16

### Added

- Hidden walls support:
  - Turn on in the settings
  - Wall config -> under visioner settings turn on hidden wall checkbox
    - This will make the wall appear in the visibility manager and seek dialog
  - Set DC if you want
  - Walls auto start as hidden for tokens
  - Seek to discover wall
  - Hidden walls will light up purple and hidden doors and secret doors will light up yellow
  - EXPERIMENTAL: See through hidden walls you can observe!
- Quick panel in visioner tool -> accepts selected tokens and targets an able to set visioner relationship changes quickly between them
- Hidden wall toggle in visioner tool

### Fixed

- Added abunch of apply changes buttons that were missing in actions
- Diversion outcome column populated again

### Changed

- Removed button title, was not needed honestly

## [2.3.1] - 2025-08-16

### Changed

- Settings menu: saving now preserves values from unvisited tabs. Only submitted or previously edited fields are persisted; untouched settings are no longer reset.
- Added opt in for enable all tokens vision

### Fixed

- Dialogs: fixed apply changes missing for sneak.

## [2.3.0] - 2025-08-15

### Added

- Proficiency rank requirement for Seeking hazards and loot (token config). Seek will show "No proficiency" when the seeker's rank is too low and keep DC/override controls.
- Keybind to show current calculated Auto‑Cover from all tokens (default G). Press to display cover‑only badges; release to clear.
- Mystler Sneak RAW setting (default off) to enforce RAW outcome for Sneak.
- New settings structure with category tabs and an emphasized Auto‑Cover section.
- Add keybind to open token manager in the opposite mode (@Eligarf)
- polish translation (@Lioheart)

### Changed

- Ignore Allies is now per‑dialog (Seek/Hide/Sneak); the global setting only defines the default checkbox state.

### Fixed

- Hide dialog: restored missing "Apply Changes" button.
- Token Manager: fixed scrolling to the bottom when selecting a token; selected row stays in view.
- Now scrolls to bottom after injecting buttons in chat

## [2.2.0] - 2025-08-15

### Added

- Auto cover:
  - New `Token Intersection Mode: Coverage` that maps ray coverage across a blocking token to cover tiers using configurable thresholds.
    - Standard at ≥ `Auto-Cover: Standard Cover at ≥ %` (default 50)
    - Greater at ≥ `Auto-Cover: Greater Cover at ≥ %` (default 80)
  - Visioner tool: Consolidated GM controls to Ignore/Restore Auto-Cover on selected walls and tokens (highlighted when active).
    - Clear Cover (Target/Observer mode)
    - Make Observed (Target/Observer mode)
  - Hazard/Loot: Minimum Perception Proficiency (token config) required to detect (Untrained–Legendary). Enforced in live detection and Seek.
  - Seek results now always include hazards/loot (subject to template/distance filters). Below-rank entries show outcome "No proficiency", display the correct DC, and still provide override buttons.
  - Auto-cover dependents are hidden unless Auto-cover is enabled.
  - Coverage thresholds only shown when mode = Coverage.
  - Seek: hides both limit checkboxes and distance fields when “Use Template” is enabled; distance fields only shown when their respective limit toggles are on.
  - Tooltips: hides “Block Player Target Tooltips” unless “Allow Player Tooltips” is enabled; hides “Tooltip Font Size” unless “Enable Hover Tooltips” is enabled.

### Changed

- Auto-cover internals refactored into strategy helpers for readability and maintainability.
- Check roll integration now uses a libWrapper WRAPPER when available to avoid conflicts with PF2E Ranged Combat.
- Token and Wall toolbar in visioner tool toggles now reflect the currently selected documents and stay in sync on selection changes.

## [2.1.3] - 2025-08-13

### Fixed

- Auto cover:
  - respect metagaming ac reveals
  - Walls sidebar tool: added GM toggle to Ignore/Restore Auto-Cover for selected walls
  - new settings: coverage thresholds to map ray coverage across a blocking token to lesser/standard/greater

## [2.1.2] - 2025-08-12

### Fixed

- Auto cover:
  - allow players to set keybinds

## [2.1.1] - 2025-08-12

### Fixed

- Auto cover:
  - players could not see override controls
  - dialog height was weird

## [2.1.0] - 2025-08-12

### Added

- Auto cover:
  - now lets you override the cover applied to a roll in the roll dialog
  - now lets you set keybind that if held will let you override cover for the roll (for people that dont use roll dialog, you maniacs)

## [2.0.1] - 2025-08-12

### Fixed

- Auto cover:
  - now works with and without roll dialog
  - now gets reevaluated on token movement
  - walls intersection algorithm tuned to better check
  - removed any and cross modes

## [2.0.0] - 2025-08-12

### Breaking - Full Internal Rewrite and Module Restructure

- Project reorganized and rewritten for clarity and performance.

### Added

- Auto Cover (reworked):
  - Applies cover only if the line from attacker to target passes through a blocking token’s space.
  - Lesser vs Standard cover determined by relative size (blocking token ≥ 2 size categories larger => Standard).
  - Applies pre-roll via modifiers dialog or strike click capture; clears cover immediately after the roll’s message renders.
  - Multi-side evaluation: checks all token sides for walls; tokens use center-to-center line for accurate blocking.
  - Intersection mode for token blockers: new setting “Auto-Cover: Token Intersection Mode” with choices:
    - Any (default): center line intersecting any token edge counts.
    - Cross: center line must cross both opposite edges (top+bottom or left+right).
  - Ignore undetected blockers: new setting “Auto-Cover: Ignore Undetected Tokens” (skip blockers undetected to the attacker per Visioner map).
  - Respect token flag: new setting “Auto-Cover: Respect Token Ignore Flag”; if enabled, tokens with `flags.pf2e-visioner.ignoreAutoCover = true` will be ignored.
  - New token setting in vision tab: ignore as auto cover blocker.
  - Wall-level toggle: per-wall flag `flags.pf2e-visioner.provideCover` (when false) makes that wall not contribute to cover. Default set to true.
  - New wall setting: ignore as auto cover.
  - Prone blockers toggle: new setting “Auto-Cover: Prone Tokens Can Block” (default on). If disabled, tokens with a Prone condition won’t provide cover.
  - Ally/dead filters: existing settings integrated into auto-cover token filtering (ignore allies, ignore 0-HP tokens).
  - Gated by setting and enabled GM-only to avoid duplicates.
  - Auto-Cover live recompute: cover now recalculates when attacker or target moves/resizes during an active roll flow.
  - Auto-Cover blocker options:
    - Any (default)
    - Cross (ray must cross both opposite edges)
    - Ray through token center
    - Ray inside ≥10% of blocking token square
    - Ray inside ≥20% of blocking token square
  - Wall-level toggle: per-wall flag `flags.pf2e-visioner.provideCover` to exclude walls from cover.
  - Token UI: Ignore as Auto-Cover Blocker flag in Token Config Vision tab.
- Take cover action support
- Grouped Settings menu (ApplicationV2), scrollable, localized labels, and reliable select persistence.

- Seek Template and Range Improvements (stabilized from 1.x):
  - Strict filtering by player template (no generic fallback template).

- Chat Automation Quality of Life:
  - Point Out excludes loot, pings target on Apply.
  - Sneak lists only enemies (no allies).
  - Hide prerequisites enforced (concealed or standard/greater cover) and “No changes to apply” notification when relevant.
  - Players don’t see Apply buttons in panels.

- API:
  - Bulk visibility setter to apply many observer→target updates efficiently.

### Changed

- No more world reloads for several settings; they are now applied at runtime:
  - Ignore Allies, Seek template toggle, Seek range toggles, player tooltip toggles, auto cover.
- Hook registration centralized under `scripts/hooks/` with small registrars; heavy logic moved to feature folders.
- Imports largely hoisted to top-of-file for maintainability; kept dynamic imports only where lazy-loading is beneficial (dialogs, heavy batches).

### Fixed

- Hide action now respects the Ignore Allies setting (allied observers are filtered out).
- Auto Cover reliably applies to the current roll and then cleans up; prevents lingering effects.
- Template-based Seek respects only targets inside the player’s template and opens faster via sockets.
- Token Manager batch operations reconciled effects reliably and reduced redundant document operations.
- Sneak integration showing up on sneak attack damage rolls.

### Removed

- Legacy/unused files and integration paths related to the old effects coordinator code.

## [1.9.0] - 2025-08-11

### Added

- Stealth for loot tokens: Added possibility to hide loot from specific tokens and finding them with seek!
- Stealth DC override for loot tokens in Token Config:
  - Injected a Stealth DC number field into the Vision tab for loot actors.
  - Added a dedicated “PF2E Visioner” tab fallback for loot tokens when available.

### Changed

- Seek and Token Manager now respect the token-level Stealth DC override for loot tokens, falling back to the world default when unset.
- Removed Cover and visibility integration, rules will now explicitly follor enforce RAW setting

## [1.8.0] - 2025-08-11

### Added

- API: `api.clearAllSceneData()` to clear all per-token visibility/cover maps and all module-created effects across the scene, then rebuild and refresh visuals.
- Macros added:
  - Clear All Scene Data (calls `api.clearAllSceneData()`)
  - Open Token Manager(calls `api.openTokenManager()`)

### Improved

- Effects handling: will now use batching for better performance

## [1.7.1] - 2025-08-11

### Changed

- Enhanced tooltip size customization: Improved implementation of tooltip font size setting
- Added proper scaling of tooltip icons based on font size
- Added CSS variables for consistent tooltip sizing across all components
- Better responsiveness for tooltip elements at different font sizes

### Fixed

- Tooltips should now stick and not move with the canvas

## [1.7.0] - 2025-08-10

### Added

- Enforce RAW Setting: When disabled (default) will skip some conditions checks
- Multiple rules per effect: Instead of multiple effects, the module will now handle one effect with multiple rules per state

### Improved

- Memory optimization: Batch processing for visibility changes to reduce heap usage
- Token deletion cleanup: Automatically remove deleted tokens from visibility maps, visibility effects, and cover effects
- Performance: Optimized effect creation and updates to use bulk operations instead of individual promises
- Efficiency: Replaced Promise.all loops with direct bulk document operations for better memory usage
- Performance: Completely redesigned effect updates to batch all operations by state and effect type
- Performance: Implemented batched visibility and cover updates in token manager to drastically reduce individual updates
- UI Improvement: "Apply Current" now applies the current type (visibility or cover) for both observer and target modes
- UI Improvement: "Apply Both" now applies both types (visibility and cover) for both observer and target modes
- UI Improvement: Visibility Manager now closes immediately when applying changes and shows a progress bar
- Performance: Optimized cover effects system with bulk operations for better memory usage

### Fixed

- Chat Automation: Fixed encounter filtering not working properly for all actions (Seek, Point Out, Sneak, Hide, Create a Diversion, Consequences)
- Chat Automation: Fixed issue where players couldn't see the Seek template setup button when no valid targets were detected

## [1.6.1] - 2025-08-10

### Fixed

- Token Manager: Cover should now support highlight and go to row as well

## [1.6.0] - 2025-08-10

### Added

- Chat Automation: Added Apply Changes / Revert Changes to the automation panel for all actions

## [1.5.1] - 2025-08-10

### Changed

- Matching color for dialog theme on highlight row

## [1.5.0] - 2025-08-10

### Added

- Token Manager: Replaced Effects column with DC column in the Visibility tab.
  - Target mode shows Perception DC; Observer mode shows Stealth DC.
- New world setting: "Integrate roll outcome in the token manager".
  - Optional Outcome column compares the last relevant roll to the DC and displays degree-of-success (Success, Failure, Critical Success/Failure).
- Selection-based row highlighting across Token Manager and all action dialogs (Seek, Hide, Sneak, Create a Diversion, Point Out, Consequences):
  - Selecting tokens on the canvas highlights matching rows and auto-scrolls them into view.

### Changed

- Moved effects descriptions into the Current State tooltip.
- Unified PC and NPC table widths; responsive colgroups when Outcome is on/off.
- Outcome chip style matches action dialogs.
- If Outcome is enabled, the manager widens on open to ensure the column is visible.
- Removed hover-based row→token and token→row behavior to avoid conflicts; selection now drives row highlighting.

### Fixed

- Correct DC tooltip text and header alignment.
- Layout glitches when Outcome is disabled.

## [1.4.0] - 2025-08-09

### Added

- Hover tooltips now show Font Awesome icon badges aligned above tokens:
  - Left badge: visibility state icon
  - Right badge: cover icon when applicable
- PF2e hud support for tooltip position

### Changed

- Hover tooltips no longer render text labels; icons are used for a cleaner, compact look.
- Badge positioning uses world-to-screen transforms, keeping alignment stable under zoom/pan.
- Create a Diversion discovery now considers both observed and concealed creatures as valid observers, and outcomes display only those who can currently see the diverter.
- Hide possible when token got observers and is concealed OR (has standard OR great cover)
- Effects will show token name rather than actor

### Fixed

- Token Manager: resolved ReferenceError for `pairs2` in target-mode apply flows.
- Tooltip cleanup reliably removes DOM badges to prevent lingering elements after hover/Alt/O.

## [1.3.3] - 2025-08-09

### Fixed

- Damage Consequences: Only list targets that explicitly have the attacker as Hidden/Undetected; removed global condition fallback.
- Damage Consequences button is hidden when no outcomes exist and shown when at least one target qualifies.
- Token Manager/Visibility Manager: Reworked layout to a single outer scroll container; inner tables no longer create nested scrollbars.
- Sticky footer no longer overlaps content; center area flexes and scrolls correctly.

## [1.3.2] - 2025-08-09

## Fixed

- CSS class overrding default system one (sorry!)

## [1.3.1] - 2025-08-08

### Added

- New world setting: Integrate Cover with Visibility Rules (`integrateCoverVisibility`). When enabled, certain actions obey cover prerequisites. Specifically, Hide is only available if the acting token has at least Standard Cover from an observer.

### Changed

- Chat automation now hides the “Open Hide Results” button when no actionable changes are possible after applying visibility and cover checks (and the actual roll outcome when present).
- Hide observer discovery uses the same cover gating as the UI check to ensure consistency.

---

## [1.3.0] - 2025-08-08

### Visioner Token Manager (Visibility & Cover)

- Reworked Apply actions:
  - Apply Current now applies the active type (Visibility or Cover) for BOTH modes (Observer → Targets and Targets → Observer).
  - Apply Both now applies BOTH types for BOTH modes in one click.
- States persist reliably after changing type:
  - All map writes now merge into existing maps instead of overwriting.
  - Writes use `document.update({ flags... })` for stability.
  - Dialog refresh re-reads maps from flags on each render.
- Corrected table sorting per type (ally\npc):
  - Visibility order: Observed → Concealed → Hidden → Undetected.
  - Cover order: None → Lesser → Standard → Greater.

All notable changes to the PF2E Visioner module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.2] - 2025-08-08

### Fixed

- **Hide/Sneak/Create a diversion/Consequences Buttons**: Restored functionality of "Open Hide Results" and "Open Sneak Results" buttons in chat. Clicking now opens their preview dialogs as expected.
- **Generic Open Actions**: Added unified handling for other `open-*` actions (e.g., Create a Diversion, Consequences) for improved resilience.

## [1.2.1] - 2025-08-08

### Changed

- **Seek Template Player Logic**: Players will now be able to put their own seek templates, letting GMs open the results nicely
- **Point out Player Logic**: Players are now able to point out themselves, letting the GM open the results nicely, added ping on the pointed out token

## [1.2.0] - 2025-08-08

### Added

- **Seek via Template (30 ft Burst)**: Optional template-based Seek targeting
  - New setting to enable template mode for Seek
  - “Setup Seek Template” button in chat lets you place a 30 ft burst anywhere with live preview
  - Tokens inside the template are considered for Seek; edge intersections count
  - Button toggles to “Remove Seek Template” after placement

### Changed

- **Range Limitation Logic**: When using a template, combat/non-combat Seek distance limits are fully ignored
- **Colors**: Template colors use the current player's color; fallback to themed defaults

---

## [1.1.0] - 2025-08-08

### Added

- **Out of Combat Seek Distance Limitation**: Implemented distance limitations for Seek actions outside of combat
  - GMs can now configure maximum distance for out-of-combat Seek attempts
  - Distance is calculated automatically between seeker and potential targets
  - Setting can be adjusted in module configuration

## [1.0.2] - 2025-08-07

### Fixed

- **Visibility Manager Actor Image**: Fixed an issue with actor images

## [1.0.1] - 2025-08-07

### Fixed

- **Visibility Manager Mode Switching**: Fixed issue where toggling between observer and target mode would reset changes made in the previous mode
  - Changes in both modes are now preserved when toggling between modes
  - Apply Changes button now applies changes from both observer and target modes
- **Point Out Action**: Improved Point Out action to work when the pointer can see the target in any visibility state (observed, concealed, or hidden)

## [0.8.0] - 2025-08-10

### Added

- **Rule Element Initial Support**: Added custom rule element for controlling visibility states
  - Implemented PF2eVisionerVisibility rule element with direction control (TO/FROM)
  - Added schema with configurable options for subject, observers, mode, and status
  - Supports multiple observer types: all, allies, enemies, selected, targeted
  - Includes various modes: set, increase, decrease, remove
  - Provides duration control and range limitations
  - Effects are placed on the subject token for consistent behavior
  - Added comprehensive documentation and example items

### Fixed

- **Unification**: Matching colors through all dialogs for the visibility states

## [0.7.0] - 2025-08-08

### Added

- **Colorblind Mode**: Added accessibility option for different types of colorblindness
  - Multiple colorblind modes: Protanopia, Deuteranopia, Tritanopia, and Achromatopsia
  - Client-side setting that can be set individually by each user
  - Adds visual indicators and alternative color schemes for better visibility
  - Includes pattern indicators to help differentiate visibility states beyond color

### Fixed

- **Create a Diversion Button**: Fixed issue where the Create a Diversion button would appear even when there were no valid targets (creatures that can see the actor)
- **Create a Diversion Dialog**: Fixed issue where the Create a Diversion dialog would not open when clicking the button
- Added notification when attempting to use Create a Diversion with no valid targets
- Added detailed logging for Create a Diversion actions to help with troubleshooting

## [0.6.1] - 2025-08-07

### Changed

- **Improved Dialog Visibility Logic**: Dialog buttons now only appear when there are valid targets for actions, avoiding unnecessary notifications for all dialog types (Seek, Point Out, Hide, Sneak, Create a Diversion, and Consequences)

## [0.6.0] - 2025-08-07

### Added

- **Damage Consequences Dialog**: Added red-themed dialog that appears when a hidden or undetected token makes a damage roll, allowing the GM to update visibility states of affected targets

## [0.5.0] - 2025-08-07

### Added

- **Block Target Tooltips for Players**: Added setting to prevent players from seeing target tooltips when hovering over tokens, while still allowing them to see tooltips when holding O key or pressing Alt

## [0.4.0] - 2025-08-07

### Added

- **Custom Tooltip Size**: Added slider control for adjusting tooltip font size
- **Client-side Setting**: Font size preference is stored per-user rather than globally
- **Responsive Sizing**: Tooltip components scale proportionally with font size changes

## [0.3.0] - 2025-08-07

### Added

- **Custom Seek Distance**: Added configurable distance setting for Seek range limitation
- **Settings Organization**: Improved settings layout with logical grouping for better usability
- **Enhanced Notifications**: Updated range limit messages to show the custom distance

## [0.2.18] - 2025-08-06

### Improved

- **Dialog Layout**: Added scrollable table with fixed footer to action dialogs for better usability with many tokens
- **Dialog Sizing**: Fixed dialog height and scrolling behavior to ensure proper display of large result sets
- **Table Scrolling**: Enhanced table container to properly handle overflow with fixed headers and footers
- **Cross-Browser Compatibility**: Added JavaScript-based scrolling fixes for better cross-browser support
- **Direct DOM Manipulation**: Added dedicated scroll fix module that applies direct DOM styling to ensure consistent scrolling behavior across all browsers and Foundry versions
- **Themed Scrollbars**: Added color-matched scrollbars for each action dialog type (Hide, Seek, Point Out, Sneak, Create a Diversion) to enhance visual consistency

## [0.2.17] - 2025-08-06

### Fixed

- **Point out dialog wrong application**: fixed condition(hidden\undetected) change for wrong token

## [0.2.15] - 2025-08-06

### Fixed

- **Major bug**: Had an issue that effect would go on the defender when attacking a condition(hidden\undetected) attacker, this is now fixed

## [0.2.14] - 2025-08-06

### Added

- **Combat Seek Range Limitation**: New setting to limit Seek actions to 30 feet range in combat, following PF2e rules
- **Range Feedback**: Clear notifications when range limitation is active and targets are out of range

## [0.2.13] - 2025-08-06

### Improved

- **Consolidated DC Extraction**: Centralized perception and stealth DC extraction functions in shared utilities for consistent access paths across all automation dialogs
- **Simplified Data Access**: Optimized DC extraction to use definitive paths for both PC and NPC actors, removing complex fallback logic
- **Code Maintainability**: Standardized DC access patterns across all visibility-related dialogs (Hide, Seek, Sneak, Create a Diversion, Point Out)

## [0.2.7] - 2025-08-06

### Added

- **Player Tooltip Setting**: New "Allow Player Tooltips" setting enables non-GM players to see visibility indication tooltips from their controlled tokens' perspective
- **Ignore Allies Setting**: New "Ignore Allies" setting filters visibility dialogs so NPCs only see players and players only see NPCs, streamlining visibility management
- **Shared Utility Functions**: Extracted common ally filtering logic into reusable utility functions for better code maintainability

### Fixed

- **Hide Dialog Encounter Filter**: Fixed bug where "Apply All" button in Hide dialog ignored encounter filter and applied changes to all tokens instead of only encounter tokens
- **Encounter Filter Logic**: Encounter filter now properly maintains its state and shows empty results when no encounter tokens match, instead of automatically disabling the filter

### Improved

- **Code Organization**: Refactored all chat automation modules to use shared ally filtering utility, eliminating code duplication and ensuring consistency
- **Player Access Control**: Players can only see tooltips for their own controlled tokens when player tooltips are enabled, preventing information leakage
- **Setting Integration**: Both new settings require world restart and are properly integrated with the module's configuration system

## [0.2.5] - 2025-08-06

### Fixed

- **API**: Fixed API function with options

## [0.2.4] - 2025-08-06

### Added

- **API**: Added API function to update ephemeral effects for visibility changes

## [0.2.3] - 2025-08-05

### Fixed

- **Sneak visibility**: Fixed Sneak visibility logic to use effective new state instead of hardcoding 'undetected'

## [0.2.2] - 2025-08-05

### Fixed

- **CSS Syntax**: Fixed CSS syntax error in chat-automation-styles.js

## [0.2.1] - 2025-08-05

### Fixed

- **Sneak perception DC calculation**: Enhanced Sneak dialog perception DC retrieval with multiple fallback paths for different PF2e system versions, matching Create a Diversion's robust implementation

## [0.2.0] - 2025-08-05

### Added

- **Sneak Action Dialog**: Complete automation for PF2E Sneak actions with preview and outcome management
- **Create a Diversion Dialog**: Complete automation for PF2E Create a Diversion actions with preview and outcome management
- **Token hover highlighting**: Hover over token rows in dialogs to highlight tokens on canvas
- **Enhanced error handling**: Graceful handling of ephemeral effect cleanup errors
- **Initiative-based effects**: Support for ephemeral effects that track combat initiative

### Improved

- **Dialog styling consistency**: Unified text sizes, spacing, and layout across all action dialogs
- **Token image presentation**: Removed unnecessary tooltips and borders from token images in tables
- **UI responsiveness**: Optimized dialog width and column sizing for better proportions
- **Button state management**: Dynamic enabling/disabling based on actual changes from original state
- **Visual feedback**: Enhanced state icons and selection indicators for better user experience
- **Create a Diversion outcomes**: Fixed token images, centered action buttons, and added proper outcome text coloring
- **Perception DC calculation**: Improved DC retrieval with multiple fallback paths for different PF2e system versions

### Technical

- **ApplicationV2 compliance**: Proper use of built-in action system instead of manual event binding
- **Error resilience**: Try-catch blocks around visibility operations to prevent dialog crashes
- **Code organization**: Improved separation of concerns between dialog logic and template rendering

## [0.1.x] - 2025-01-31

### Fixed

- Resolved circular dependency issue causing "Cannot use import statement outside a module" error
- Fixed manifest warning about unknown "system" key by using correct v13 relationships format
- Implemented lazy loading for API components to prevent initialization conflicts

### Added

- Complete rewrite for FoundryVTT v13 compatibility
- Modern ApplicationV2-based visibility manager interface
- ESModule architecture for better performance and maintainability
- Comprehensive localization support (English included)
- Bulk actions for setting multiple tokens at once
- Visual indicators with animated effects
- Keyboard shortcut support (`Ctrl+Shift+V`)
- Token HUD integration for quick access
- Context menu integration
- Modern responsive CSS design with v13 theme support
- Auto-apply PF2E conditions option
- Socket support for future multiplayer features
- Hot reload support for development
- Comprehensive API for module developers
- Full TypeScript-style JSDoc documentation

### Changed

- Upgraded from ApplicationV1 to ApplicationV2 framework
- Improved data storage using modern flag system
- Enhanced visual effects system with better performance
- Redesigned UI with modern FoundryVTT v13 styling
- Better error handling and user feedback
- Optimized token visibility update logic

### Technical

- Minimum FoundryVTT version: v13.341
- Verified compatibility: v13.346
- PF2E system compatibility: v6.0.0+
- ESModule entry point instead of legacy scripts
- CSS Layer implementation for better module compatibility

## [0.1.0] - Previous Version

### Added

- Basic per-token visibility functionality
- Simple table-based interface
- Core visibility states (Observed, Hidden, Undetected, Concealed)
- Token appearance modification
- Flag-based data storage

### Compatibility

- FoundryVTT v12 and earlier
- Basic ApplicationV1 framework
