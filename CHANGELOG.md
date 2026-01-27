# Changelog

## [5.6.1] - 2026-01-27

### 🐛 Fixed

- **Shared Vision Blindness Handling**: All vision sharing modes now properly respect blindness conditions
  - **One-way**: Blinded master cannot share vision, minion falls back to own vision
  - **Two-way**: Blinded master cannot share, but minion blindness doesn't prevent master from sharing
  - **Replace**: Blinded master causes minion to fall back to own vision
  - **Reverse**: Blinded minion causes master to fall back to own vision

## [5.6.0] - 2026-01-27

### ✨ Added

- **ShareVision Rule Element Operation**: Implemented vision sharing between tokens
  - **Four modes**: `one-way`, `two-way`, `replace`, `reverse` for flexible vision control
  - **Actor UUID based**: Master identification persists across scenes using actor UUIDs
  - **Predicate support**: Conditional vision sharing based on roll options
  - **Immediate vision refresh**: Controlled tokens see changes instantly
  - **Automatic cleanup**: Master token deletion/defeat removes all associated vision sharing
  - **Scene transition handling**: Vision sharing properly maintained when moving between scenes
  - **Reliable vision reinitialization**: `preUpdateToken`/`updateToken` hook pair ensures vision sources update after flag changes

- **Shared Vision Indicator**: Floating indicator showing active vision sharing relationships
  - **Master/Minion detection**: Automatically detects if controlled token is sharing vision or receiving it
  - **Multi-minion support**: Cycle through multiple minions when master has several
  - **Mode-specific icons**: Different icons for each vision sharing mode (arrows, exchange)
  - **Quick actions**: Left-click to pan, right-click to remove, cycle arrow for multiple minions
  - **Configurable size**: Client setting with small/medium/large/xlarge options (defaults to small)
  - **Draggable**: Position saved per-client
  - **Count badge**: Shows current minion index (1/3) when multiple minions exist
  - **Token config integration**: Works with both rule element and manual token config methods

### 🔧 Technical

- **Helper function**: Added `getSceneTokenIdFromActorUuid` to resolve actor UUIDs to scene token IDs
- **Flag system**: Uses `visionMasterActorUuid`, `visionMasterTokenId`, `visionSharingMode`, `visionSharingSources` flags
- **Detection wrapper**: Updated to handle reverse mode correctly
- **Cleanup hooks**: Master token deletion and scene changes trigger proper vision sharing removal
- **SharedVisionIndicator class**: Singleton pattern with refresh support and live size updates
- **Dual detection**: Checks both `visionMasterTokenId` (token config) and `visionMasterActorUuid` (rule elements)

### 🐛 Fixed

- **Token config vision mode dropdown**: Now works correctly on first try after selecting a master
- **Vision master actor UUID**: Token config now properly saves both token ID and actor UUID for persistence

## [5.5.1] - 2026-01-13

### 🐛 Bug Fixes

- **Vision for NPCs**: Fixed setting not fully applying on toggle
  - Now updates existing NPC tokens already on scenes
  - New NPC tokens created on canvas now inherit the setting (on/off)
  - NPC prototype tokens now sync so future drops inherit correctly

## [5.5.0] - 2026-01-10

### ✨ Added

- **Action Qualification Force Override**: Added `forceStartQualifies` and `forceEndQualifies` properties for `modifyActionQualification` rule elements
  - Allows effects to force Hide/Sneak prerequisites to pass regardless of cover/concealment
  - Useful for custom effects like "camouflage dye" that enable stealth without normal requirements
  - Supports both top-level flags (`hide.forceEndQualifies`) and position-scoped flags (`sneak.end.forceQualifies`)
  - Integrated into Hide/Sneak dialogs, action handlers, and turn-end validation

- **GM Vision AVS Warning**: GM-only banner warns that AVS won't work while PF2e GM Vision is active (no vision polygon)
  - Includes dismiss (×) and a persistent "Don't show again" option (client setting)

### 🐛 Bug Fixes

- **AVS Scene Disable**: Purging/cleanup no longer clears the per-scene "Disable AVS" flag

## [5.4.1] - 2026-01-09

- **Override Validation Indicator**: Fixed indicator showing for players; now GM-only
- **Override Validation Indicator**: Fixed indicator appearing on token control/selection; now only shows for actual movement/queued validations

## [5.4.0] - 2026-01-04

### ✨ Added

- **Override Validation Queue System**: Implemented LIFO queue for managing multiple token movement indicators
  - Processes most recent token movement first
  - Auto-advances to next indicator after accepting/rejecting current one
  - Shows queue position in indicator title (e.g., "(3 of 3)")
  - Visual queue badge displays total pending indicators
  - Tooltip shows next token in queue
  - Tokens moving multiple times update data without re-ordering in queue
  - Scrollable tooltip with increased size (300-450px) for better readability
  - Moving token highlighted in green with walking icon
  - Right-click now accepts only current indicator's overrides and advances to next

- **Sniping Duo Dedication**: Added support for the "designated spotter" not granting lesser cover for Strikes between duo members
  - Token Config UI to pick a Sniping Duo spotter
  - Auto-cover ignores the spotter as a blocker for eligible Strikes
  - Chat indicator added when Sniping Duo cover-ignore applies

## [5.3.1] - 2025-12-06

### 🛠️ Improved

- **Encounter Master Dialog**: Improved token selection UX
  - Filters out hazards and loot tokens from the selection list
  - Sorts tokens by proximity to the token being configured

## [5.3.0] - 2025-12-05

### ✨ Added

- **Encounter Master Token Setting**: Added ability to manually link tokens to a master token for encounter participation
  - Tokens with an Encounter Master set will be considered part of the encounter when their master is in combat
  - Useful for eidolons, companions, pets, or other minions not directly in the combat tracker
  - Accessible via Token Config → Vision tab → PF2E Visioner section
  - Visual dialog with token images and pan-to-token functionality for easy selection

## [5.2.2] - 2025-12-02

### 🐛 Bug Fixes

- Actually push the code

## [5.2.1] - 2025-12-02

### 🐛 Bug Fixes

- **Sneak End Position Qualification**: Fixed concealed, hidden, and undetected states not qualifying for sneak ending position
  - End position now correctly qualifies with concealed state
  - End position qualifies with hidden/undetected when `sneakAllowHiddenUndetectedEndPosition` setting is enabled
  - Fixed `ActionQualifier.checkSneakPrerequisites` incorrectly returning `qualifies: false` when no rule element sources exist

## [5.2.0] - 2025-12-02

### ✨ Added

- **Blinded Condition Terrain**: Creatures with the Blinded condition now treat all movement as difficult terrain (cost x2), reflecting the difficulty of moving without sight.
- **Darkness Spell Terrain**: Darkness spell templates now automatically create an attached Region that applies difficult terrain (cost x2) to all movement types (Climb, Swim, Fly, Stride) within the area.

## [5.1.1] - 2025-11-25

### 🐛 Bug Fixes

- **Wall Movement Property**: Fixed wall movement property changes incorrectly triggering AVS recalculation
  - Wall movement restrictions (`move` property) should not affect line of sight calculations
  - Removed incorrect check that excluded walls with `move=NONE` from sight blocking calculations

## [5.1.0] - 2025-11-21

### ✨ Added

- Scene setting: per-scene "Disable AVS for this Scene" flag with a localized tooltip (checkbox title) to suppress Auto-Visibility System calculations for the current scene.
- Ensure AVS honors the per-scene disable flag: added early-exit checks to the AVS batch pipeline and visibility recalculation entry points so no calculations are performed when the scene flag is enabled.
- Recalculate AVS state when the per-scene flag is changed: register an `updateScene` hook to trigger a recalculation when the scene flag is toggled.

## [5.0.2] - 2025-11-19

### 🗑️ Removed

- **Rule Elements**: Removed `PF2eVisionerVisibility` rule element
  - This rule element has been deprecated in favor of `PF2eVisionerEffect` which provides more comprehensive functionality
  - All references to `PF2eVisionerVisibility` have been removed from the codebase
  - Users should migrate existing items to use `PF2eVisionerEffect` instead

## [5.0.1] - 2025-11-19

### 🐛 Bug Fixes

- **Rule Elements**: Fixed `PF2eVisionerEffect` rule elements not working on feats, equipment, and other non-effect items
  - Previously only processed rule elements on items with `type: "effect"`
  - Now correctly processes rule elements on all item types (feats, equipment, effects, etc.)
  - Affects lifecycle reapplication, movement reapplication, and item update hooks

## [5.0.0] - 2025-10-24

**PF2eVisionerEffect Rule Element System:**

- Complete rule element framework for advanced visibility and cover control
- Eight operation types for comprehensive customization:
  - `modifySenses`: Modify sense ranges and precision (darkvision, hearing, etc.)
  - `overrideVisibility`: Force specific visibility states with direction control
  - `distanceBasedVisibility`: Apply visibility states based on distance bands
  - `overrideCover`: Provide or block cover to specific targets
  - `modifyActionQualification`: Control action prerequisites
  - `conditionalState`: Apply states based on conditions
  - `offGuardSuppression`: Suppress off-guard penalty from hidden/undetected attackers
- Predicate support at both rule and operation levels for conditional application
- Priority system for conflict resolution between multiple effects
- Source tracking for qualification checks and effect management
- Range limitations and directional control (to/from)
- Full PF2e roll options integration

**Off-Guard Suppression:**

- Suppress off-guard penalty when attacked by hidden/undetected creatures
- Removes ephemeral off-guard effects when suppression is active
- Works with attack roll pipeline and AVS ephemeral effect system
- Compatible with other off-guard sources (flanking, prone, etc.)

#### 📚 Documentation

- Comprehensive `RULE_ELEMENTS.md` with examples for all operations
- Operation-specific property references and use cases
- Homebrew guide with best practices
- Example JSON configurations for common feats and spells
- API documentation for rule element system

#### 🔧 Technical

- Extensive test coverage for all rule element operations
- Integration with existing visibility and cover systems
- Clean separation between rule element logic and effect application
- Support for both PC and NPC actors

## [4.5.7] - 2025-11-18

### ⚡ Performance Improvements

- Introduced a centralized, pan-aware RAF scheduler so HoverTooltips, visual-effects pulses, and other animations throttle or pause while the canvas is panning/zooming; scheduler has dedicated unit coverage
- Hover tooltips, cover overlays, and HUD badges now suspend DOM/PIXI work during pan/zoom and resume cleanly afterward, avoiding compounded FPS drops
- Cover visualization and wall label overlays respect viewport culling and use a dedicated render layer so showing all labels at once no longer tanks performance

### 🐛 Bug Fixes

- Hover tooltips no longer misinterpret keybind releases during pan/zoom
  - `onHighlightObjects(false)` clears `_savedKeyTooltipsActive`, preventing Alt/O overlays from relaunching immediately after keyup
  - Regression test (`hover-tooltips-keybind-state.test.js`) reproduces the pan-lock scenario to guard future changes
- Wall cover labels respect the keybinding lifecycle: holding the key shows all manual overrides simultaneously, releasing it clears every label and destroys the dedicated layer to avoid lingering sprites

## [4.5.6] - 2025-11-16

### ✨ Features

- **Lesser Cover Wall Override**: Added lesser cover as a wall cover override option
  - New "Lesser Cover Maximum" option in Wall Manager and wall quick config
  - Walls can now be set to provide up to lesser cover based on coverage thresholds
  - Added bulk action to set all walls to lesser cover
  - Cover cycling now includes lesser: auto → none → lesser → standard → greater → auto

### 🐛 Bug Fixes

- **Wall Cover Override Logic**: Fixed wall cover override behavior
  - Cover-granting overrides (lesser/standard/greater) now apply if wall intersects line, regardless of natural blocking
  - Override 'none' only applies if wall would naturally block (to remove natural cover)
  - Ensures overrides work correctly even when walls wouldn't naturally provide cover

### ⚡ Performance Improvements

- **UI Hook Optimization**: Reduced unnecessary UI re-renders
  - Token and wall cover cycling tools only re-render when icon/title actually changes
  - Update token tool only refreshes on visioner-related flag changes
  - Prevents redundant control panel updates during token/wall updates
- **Canvas Panning Performance**: Optimized operations during canvas panning
  - Skip wall identifier label refresh during active panning
  - Skip hover tooltip badge position updates during panning
  - Skip animation frame scheduling during panning to reduce RAF overhead
  - Cache canvas rect to avoid forced reflows during panning
  - Batch DOM transform updates to minimize layout thrashing

## [4.5.5] - 2025-11-14

### ✨ Features

- **Seek Template Dialog Enhancements**:
  - Added Shift+Click on "Setup Seek Template" button to skip dialog and use defaults burst 15ft.
  - Added "Always Skip Seek Template Dialog" setting to always use default values (15ft burst)
  - Changed label from "Radius" to "Length" when selecting line (ray) template type

### 🐛 Bug Fixes

- **Seek Template Dialog Close Button**: Fixed dialog not reopening after closing with X button
  - Dialog now properly resolves promise when closed via X button or Cancel
  - Ensures template setup can be used again after closing dialog

## [4.5.4] - 2025-11-12

### ✨ Features

- **Customizable Seek Template Dialog**: Added dialog to configure Seek template type and radius
  - Choose from burst (circle), cone (90 degrees), or line (ray) template types
  - Configurable radius in feet (defaults to 15 feet burst)
  - Works for both GM and player template creation

### 🐛 Bug Fixes

- **Seek Results Template Filtering**: Fixed Seek results dialog showing tokens outside template when reopened
  - Improved template lookup to check both `canvas.scene.templates` and `canvas.templates.placeables`
  - Fixed token ID consistency by using `actorToken.id` instead of `actor.id` for template matching
  - Filter out outcomes marked as `changed: false` when template is present
- **Template Type Resolution**: Fixed undefined `fallbackTemplate` variable error in event-binder

- **Window Minimization Support**: Fixed AVS visibility calculations not working when GM window is minimized
  - Replaced `requestAnimationFrame` with synchronous batch processing to bypass browser throttling
  - Added automatic perception refresh when window is restored from minimized state
  - Implemented Levels module compatibility: bypasses 3D collision detection when minimized, uses 2D geometric LOS
  - Window state listener detects minimize/restore and triggers full perception refresh on restore
  - Ensures all visibility state changes apply correctly even when Foundry window is in background
  - Perfect for GMs running multiple applications or streaming while game window is minimized

## [4.5.3] - 2025-11-09

### ✨ Features

- **Customizable Wall Cover Labels Keybind**: Replaced Alt key handling with a configurable keybinding for showing wall cover labels
  - New keybinding: "Show Wall Cover Labels" in Controls settings
  - Hold the configured key while the walls tool is active to display cover status labels (NONE, LESSER, STANDARD, GREATER) on walls
  - Labels automatically hide when the key is released or when switching away from the walls tool
  - Prevents interference with Foundry's native Alt-click functionality for wall selection
  - Only shows labels for walls with explicit cover overrides (AUTO labels are not displayed)

## [4.5.2] - 2025-11-02

### Changed

- **Lifesense Targeting**: Changed targeting from right-click/shift+right-click to T/Shift+T keys
  - Hover over lifesense indicators and press T to target token (releases others)
  - Shift+T adds/removes token from selection

## [4.5.1] - 2025-11-01

### 🐛 Bug Fixes

- Made wall cover labels performance better
- Remove tooltips from the screen when changing scenes

## [4.5.0] - 2025-01-XX

### 🎉 Major Release - Rule Elements System

#### ✨ New Features

## [4.4.13] - 2025-10-25

### 🐛 Bug Fixes

- **Rule Element Performance**: Fixed performance issue where tokens with rule elements triggered full AVS recalculation on movement
  - Rule elements now only trigger AVS recalculation when initially created (`onCreate`) or during encounter events (`onUpdateEncounter`)
  - Token movement with active rule elements no longer causes unnecessary recalculation of all tokens
  - AVS naturally picks up rule element flag changes through its normal event-driven batch processing
- **NPC Sneak Detection**: Fixed sneak speed calculations for NPCs with passive abilities
  - `FeatsHandler` now correctly detects passive actions (type: "action") in addition to feats
  - NPCs with abilities like "Swift Sneak" will now have proper sneak distance calculations displayed
  - Sneak distance chip in chat panels now works correctly for both PCs and NPCs

## [4.4.12] - 2025-10-24

### 🐛 Bug Fixes

- **Chat Action Detection**: Improved action detection logic to prevent false positives
  - Action type detection now relies strictly on PF2e system context flags rather than flavor text
  - Removed flavor text parsing for Sneak, Hide, Create a Diversion, Avoid Notice, and Take Cover actions
  - Prevents incorrect action detection when action names appear in unrelated messages (e.g., "Hide Shield", "Sneak Attack")
  - More reliable action identification through PF2e's `context.options` and `context.slug` fields
- **Wall Height Integration**: Fixed token height calculation to reject invalid Wall Height module flags
  - Wall Height token height flags with value 0 or null are now ignored
  - Falls back to size-based height calculation when Wall Height flag is invalid
  - Prevents tokens from being treated as having zero height when Wall Height module provides incomplete data

## [4.4.11] - 2025-10-23

### 🐛 Bug Fixes

- Fix recursion issue with dice so nice

## [4.4.10] - 2025-10-23

### ✨ Features

- **Camera Vision Aggregation**: Added option to aggregate visibility across multiple party tokens for camera/spectator accounts
  - New setting: "Camera Vision Aggregation" in Vision settings (disabled by default)
  - When enabled, accounts with observer permissions on multiple tokens will display the best (most permissive) visibility state
  - Visibility order: Observed > Concealed > Hidden > Undetected
  - Solves the issue where camera accounts would lose sight of enemies when their primary observer token went behind a wall
  - Enables proper streaming without leaking GM information or requiring invisible dummy actors
  - Perfect for broadcast/spectator setups where camera needs to see what any party member can see

## [4.4.9] - 2025-10-22

### Changes

- **Factors tooltip**: Changed (i) icon to use actual state icons
- **Hover Tooltips**: made ALT respect the Remove Target Hover Tooltips From Players setting
- **Lifesense Indicator**: Added Factors tooltip when lifsense is indicated on the canvas

## [4.4.8] - 2025-10-19

### ✨ Features

- **Visibility Factors Keybind**: Added customizable keybind to display detailed visibility factors for controlled tokens
  - Hold the keybind to show factor badges (info icon) above all other tokens from controlled token's perspective
  - Hover over badges to see comprehensive tooltip explaining visibility state:
    - Current visibility state (Observed, Hidden, Undetected, Concealed)
    - Lighting conditions (Bright Light, Dim Light, Darkness, Magical Darkness with ranks)
    - Detailed reasons including observer/target conditions, sense detection, and lighting interactions
  - No default keybind assigned - configure in Controls settings
  - Works alongside existing Alt/O keybind overlays
  - Badge positions update in real-time as tokens move
  - Includes support for all visibility factors:
    - Observer conditions (blinded, dazzled, deafened)
    - Target conditions (invisible, hidden, concealed, undetected)
    - Lighting factors (bright, dim, darkness, magical darkness ranks 1-5, greater magical darkness)
    - Sense detection (darkvision, low-light vision, greater darkvision, lifesense, tremorsense, scent, hearing, echolocation, and more)
    - Precise and imprecise sense acuity

## [4.4.7] - 2025-10-19

### 🐛 Bug Fixes

- **Wall Priority**: Walls now always block vision regardless of darkness presence - no more "darkvision through walls" edge cases
- **Precomputed Lighting**: Fixed precomputed lighting to also check for darkness between tokens, not just at token locations
- Ensures consistent "undetected" states when walls properly block line of sight
- Prevents false positives where tokens appeared "observed" when they should be "hidden" behind walls
- More accurate darkness detection catches magical darkness areas that single-ray sampling missed

## [4.4.6] - 2025-10-19

### 🐛 Bug Fixes

- **AVS Line of Sight**: Fixed incorrect visibility calculations during token movement/animation
  - **Primary Fix**: Batch processing now defers entirely when tokens are moving, waiting for movement to complete
  - **Secondary Fix**: Precomputed LOS cache is skipped for animating/dragging tokens as a safety net
  - Prevents stale LOS data from causing tokens to see through walls during movement
  - Ensures visibility calculations always use final token positions after movement completes
  - Fixes issue where dragging a token would incorrectly show visibility through walls
  - Implements defense-in-depth approach for maximum accuracy during token movement
- **Hybrid Vision Consensus**: Improved LOS algorithm using consensus between Foundry's vision polygon and full geometric validation
  - **Previous Approach**: Shot rays between all combinations of 9 observer points and 9 target points (81 rays total)
  - **New Approach**: Compare Foundry's vision polygon with complete geometric LOS algorithm, use consensus logic for final result
  - **Consensus Logic**: When both systems agree, trust the result; when they disagree, use geometric as tiebreaker
  - **Geometric Algorithm**: Center-to-target ray sampling requiring 2+ clear rays when center is blocked (same logic for validation and fallback)
  - **Fallback Logic**: If vision polygon unavailable, use the same conservative geometric sampling algorithm
  - More realistic vision model - you look from your eyes (center) toward different parts of the target
  - Handles edge cases where vision polygon and geometric LOS disagree by using more predictable geometric result
  - Significantly more efficient (90% fewer rays) while maintaining accuracy and flexibility through dual validation
  - Best of both worlds: Foundry's precision when it agrees, geometric predictability and flexibility when it doesn't

## [4.4.5] - 2025-10-19

### ⚡ Performance Improvements

- **AVS Feedback Loop Prevention**: Eliminated multiple feedback loops causing excessive visibility recalculations
  - Added flag-based guard in `LightingEventHandler` to prevent rapid re-triggering after batch completion
  - Skip perception refresh when no actual visibility changes occurred (`uniqueUpdateCount === 0`)
  - Suppress `lightingRefresh` events during `canvas.perception.update()` to prevent cascading updates
  - Skip processing module's own ephemeral effects in `ItemEventHandler` (identified by `aggregateOffGuard` flag)
  - Suppress both `refreshToken` hook processing AND `lightingRefresh` events during ephemeral effect sync
  - Uses `requestAnimationFrame` for precise, deterministic flag control instead of arbitrary timeouts
  - All suppression flags are cleared after the next render frame for optimal timing
  - Prevents cascading `refreshToken` → `lightingRefresh` → batch cycles during effect updates
- **Optimized Ephemeral Effect Sync**: Dramatically reduced unnecessary `refreshToken` events
  - Changed from syncing ALL tokens in scene to only syncing specific observer-target pairs that changed
  - Reduced complexity from O(allTokens × changedTokens) to O(updates)
  - Skip hazards and loot tokens entirely - they don't need visibility effects
  - Typical scenes now trigger 2-4 `refreshToken` events instead of 28+ after each batch
  - Ephemeral effect updates no longer trigger cascading `refreshToken` → `lightingRefresh` → batch cycles

## [4.4.4] - 2025-10-18

### 🐛 Bug Fixes

- Add some more AVS debug logs to help track down an issue

## [4.4.3] - 2025-10-18

### 🐛 Bug Fixes

- **AVS**: When a token gets dead or defeated, clear avs overrides and hide indicator
- **Visioner manager**: Filter out dead and defeated tokens

## [4.4.2] - 2025-10-17

### 🐛 Bug Fixes

- **_AVS_**: Fix player side not triggering AVS calculations

## [4.4.1] - 2025-10-15

### Changes

- Disable sneak fancy functions like blocking movement until start sneak and hide sneaking token if avs is turned off

## [4.4.0] - 2025-10-14

### ✨ Features

- **Sneak End Position Extended States**: Added optional setting to allow Hidden/Undetected states for sneak end positions
  - New setting: "Allow Hidden/Undetected for Sneak End Position" (disabled by default)
  - When enabled, sneak end positions qualify with Hidden or Undetected states (in addition to Concealed)
  - Visual indicator: Plus icon (+) appears in column header legend when setting is active
  - Setting located in General > Visioner Dialogs Settings

### Changes

- **Line of Sight Accuracy**: Fixed visibility issue by implementing comprehensive 9-point sampling
  - LOS now samples 9 points on each token: center + 4 corners (with 2px inset) + 4 edge midpoints
  - Creates 81 possible sight lines (9×9) to accurately detect visibility around partial obstacles
  - Previously used only 3 points per token, which could miss valid sight lines around corners

- **Hover Tooltip Performance**: Make sure tooltips appear for newly created tokens
  - Make sure tooltips doesnt render above ui elements

## [4.3.1] - 2025-10-13

### 🐛 Bug Fixes

- Fixed an issue with the mesh and turn marker

## [4.3.0] - 2025-10-12

### ✨ Features

- Added clickable badges to token hover tooltips for quick access to Token Manager
  - Click on observer badge to open Token Manager in observer mode for that token
  - Click on target badge to open Token Manager in target mode for that token
  - Highlights and scrolls to relevant row in Token Manager after opening
- Levels module integration for AVS calculations
  - When Levels module is present, AVS calculations will consider levels
  - Automatically detects Levels module and integrates without additional configuration

### 🐛 Bug Fixes

- Fixed tooltip showing above ui elements
- Fixed tooltip not hiding when panning the canvas
- Fixed tooltips now showing for newly added tokens without requiring a refresh

## [4.2.2] - 2025-10-09

### 🐛 Bug Fixes

- **Echolocation Sense Detection**: Fixed incorrect sense labeling when echolocation is active
  - Echolocation was being stored as "precise hearing" instead of "echolocation", causing incorrect badge icons
  - Detection map now correctly stores `sense: 'echolocation'` with `isPrecise: true`
  - Tooltips now properly show echolocation icon instead of hearing icon when echolocation is detecting targets
  - Sound-blocking walls now correctly prevent echolocation detection
  - Regular hearing remains as an imprecise sense even when echolocation is active

### ✨ Features

- **Cover Display Consolidation**: Moved cover badges from hover tooltips to keybind overlay (G key)
  - Hover tooltips now only show visibility and sense badges for cleaner display
  - Cover information (both manual and auto-cover) consolidated under G-key overlay
  - Manual cover badges show cog icon (⚙️) to distinguish from auto-calculated cover
  - Auto-cover badges show plain cover icon without additional markers
  - Keybind overlays now suppress hover tooltips while active for clearer viewing
  - Hover tooltips automatically restore after releasing keybind while still hovering

- **Global Scene Settings**: Added default settings for scene-specific visual indicators
  - New "Hidden Wall Indicator Width" setting in General UI (default: 10px, range: 1-30px)
    - Automatically updates wall visuals when changed
  - New "Dim Lighting Threshold" setting in General UI (default: 0.25, range: 0.0-1.0)
    - Controls what light level is considered "dim" for visibility and concealment calculations
    - Values below this threshold are treated as dim light (provides concealment in PF2E)
    - Affects how the module interprets lighting levels for automatic visibility states
    - **Automatically triggers AVS recalculation** when changed (global or per-scene) to immediately update visibility states
  - Scene Configuration now uses these global defaults when scene-specific values aren't set
  - Provides consistent defaults across all scenes while allowing per-scene customization

### Changes

- Changed scent and see invisibility sense badges icons to better match their meanings
  - Scent: changed to nose icon
  - See Invisibility: changed from dashed user icon to person with rays icon

## [4.2.1] - 2025-10-08

### 🐛 Bug Fixes

- **Immediate Door Visibility Updates**: Fixed issue where token visibility wasn't updating until a door was opened/closed
  - Wall changes (door open/close, wall create/update/delete) now trigger immediate visibility recalculation instead of using 100ms throttle
  - Resolves delay where players had to interact with a door before visibility states updated correctly

## [4.2.0] - 2025-10-08

### ✨ Features

- **Detection Badges System**: Added sense detection badges to visibility tooltips and dialogs
  - Hover tooltips now display which sense detected each token (vision, darkvision, tremorsense, lifesense, scent, hearing, etc.)
  - Sense badges appear alongside visibility and cover badges for comprehensive at-a-glance information
  - Seek dialog includes new "Detected By" column showing which sense was used to detect each target
  - All sense detection features respect AVS (Auto-Visibility System) setting - only shown when AVS is enabled
  - Supports: vision, light-perception, darkvision, greater-darkvision, low-light-vision, see-invisibility, echolocation, tremorsense, lifesense, scent, and hearing
  - Detection badges show even for "observed" targets to provide complete sensory information

## [4.1.1] - 2025-10-08

### ✨ Features

- Support for petal step feat (tremorsense logic)
- Recalculate AVS states when addin\removnig supported feats

## [4.1.0] - 2025-10-08

### 🐛 Bug Fixes

- movmentType fly now shows as undetected again for tokens senseing with Tremorsense

### ✨ Features

- **Wall Height Integration**: Added automatic support for the Wall Height module
  - Cover detection now respects wall elevation ranges, allowing tokens above walls to see over them
  - Visibility and line of sight calculations factor in wall heights when determining obstruction
  - Elevation-aware filtering prevents low walls from blocking sight between elevated tokens
  - No configuration required - automatically activates when Wall Height module is present

- All the module now uses locale keys (good luck translators!)

## [4.0.4] - 2025-10-07

### 🐛 Bug Fixes

- Handle a case where gridless scene darkness sources were not properly accounted for their points of shape

## [4.0.3] - 2025-10-07

### 🐛 Bug Fixes

- Remove console logs

## [4.0.2] - 2025-10-07

### 🐛 Bug Fixes

- Implemented movement blocking for players awaiting Sneak confirmation, preventing unintended actions during sneak attempts
- End-of-turn validation button now correctly appears when required, ensuring GMs can address deferred sneak checks
- Seek dialog now properly filters out hazards and loot from the defeated token filter, ensuring they always appear in results
- All dialogs now show or hide action buttons (Apply/Revert) based on the following criteria:
  - If the old visibility state is AVS-calculated and the new state is not AVS-calculated - show actions
  - If the old visibility state is AVS-calculated and the new state is AVS - hide actions
  - If the old visibility state is not AVS-calculated and AVS is selected or a state other than the old one - show actions
  - If the old visibility state is not AVS-calculated and the new state is the same state - hide actions
- All dialogs now check only the specific token that initiated the action when determining if the old state is AVS-controlled

## [4.0.1] - 2025-10-07

### 🐛 Hotfix

- Fixed issue with token visibility not updating correctly
- Improved error handling in UI hooks

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
