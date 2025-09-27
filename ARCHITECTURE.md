# Module Architecture

This document explains the modular architecture of the PF2E Visioner module.

## File Structure

```
pf2e-visioner/
├── scripts/
│   ├── main.js              # Entry point and module orchestration
│   ├── constants.js         # Configuration and constants
│   ├── utils.js             # Facade re-exporting stores/services + general helpers
│   ├── api.js               # Public API and main functionality
│   ├── token-manager.js     # ApplicationV2 UI (thin controller/view)
│   ├── managers/token-manager/
│   │   ├── actions.js       # Extracted action handlers (form/apply/toggles/bulk)
│   │   └── highlighting.js  # Selection highlighting handlers
│   ├── visual-effects.js    # Visual effects and token rendering
│   ├── hooks.js             # Thin shim delegating to modular hooks in scripts/hooks/
│   ├── hooks/               # Modular hooks by concern
│   │   ├── registration.js  # Central registrar composing small hook modules
│   │   ├── lifecycle.js     # ready/canvasReady + socket + hover tooltips
│   │   ├── ui.js            # Token HUD, directory context, TokenConfig injection
│   │   ├── token-events.js  # create/delete token handlers
│   │   ├── combat.js        # encounter filter reset
│   │   └── chat.js          # chat styles + processing
│   ├── helpers/             # Pure helper utilities
│   │   ├── cover-helpers.js
│   │   └── visibility-helpers.js
│   ├── cover/               # Cover effect modules
│   │   ├── aggregates.js    # ensure aggregate, meta update, reflex/stealth dist
│   │   ├── batch.js         # batch update + dedupe + reconcile against maps
│   │   ├── update.js        # single-target cover update
│   │   └── cleanup.js       # cleanup utilities
│   ├── visibility/          # Visibility (off-guard) effect modules
│   │   ├── utils.js         # effect lock + shared constants
│   │   ├── update.js        # single-target visibility update
│   │   ├── batch.js         # batch visibility updates
│   │   └── cleanup.js       # cleanup utilities
│   ├── stores/              # Single-responsibility state stores
│   │   ├── visibility-map.js
│   │   ├── cover-map.js
│   ├── services/            # Cross-cutting operations/services
│   │   ├── scene-cleanup.js
│   │   └── api-internal.js  # Internal helpers for Pf2eVisionerApi
│   └── settings.js          # Module settings and keybindings
├── templates/
│   └── token-manager.hbs    # Handlebars template for UI (renamed from visibility-manager.hbs)
├── styles/
│   └── visibility-manager.css # CSS styling (now includes cover styles)
├── lang/
│   └── en.json             # English localization
├── module.json             # Module manifest
├── README.md               # User documentation
├── CHANGELOG.md            # Version history
├── DEVELOPMENT.md          # Development guide
└── ARCHITECTURE.md         # This file
```

## Module Components

### Core Files

#### `scripts/main.js`

- **Purpose**: Entry point and module initialization
- **Responsibilities**:
  - Initialize the module on Foundry's `init` hook
  - Orchestrate the loading of all other components
  - Expose the global API
- **Dependencies**: All other module files

#### `scripts/constants.js`

- **Purpose**: Centralized configuration and constants
- **Exports**:
  - `MODULE_ID`: The module identifier
  - `MODULE_TITLE`: Human-readable module name
  - `VISIBILITY_STATES`: Configuration for all visibility states
  - `COVER_STATES`: Configuration for all cover states
  - `DEFAULT_SETTINGS`: Module settings configuration
  - `KEYBINDINGS`: Keybinding configurations
- **Dependencies**: None (base file)

#### `scripts/utils.js`

- **Purpose**: Facade for public helpers; re-exports stores/services to enforce single source of truth
- **Re-exports**:
  - From `stores/visibility-map.js`: `getVisibilityMap`, `setVisibilityMap`, `getVisibilityBetween`, `setVisibilityBetween`
  - From `stores/cover-map.js`: `getCoverMap`, `setCoverMap`, `getCoverBetween`, `setCoverBetween`
  - From `services/scene-cleanup.js`: `cleanupDeletedToken`, `restoreDeletedTokenMaps`
- **Local helpers**: UI helpers like `createVisibilityIndicator`, `createCoverIndicator`, token filtering, etc.

### User Interface

#### `scripts/token-manager.js`

- **Purpose**: ApplicationV2-based UI for managing visibility and cover
- **Class**: `VisionerTokenManager`
- **Responsibilities**:
  - Render the token management interface with tabbed visibility and cover controls
  - Handle form submissions and user interactions
  - Provide bulk actions for multiple tokens
  - Manage window positioning and behavior
  - Switch between visibility and cover management tabs
- **Dependencies**: `constants.js`, `utils.js`, `visual-effects.js`

#### `templates/token-manager.hbs`

- **Purpose**: Handlebars template for the UI
- **Features**:
  - Tabbed interface for visibility and cover management
  - Observer token information display
  - Bulk action buttons for both visibility and cover
  - Token tables with dropdowns for both visibility and cover states
  - Cover legend showing mechanical effects
  - Responsive design elements
- **Dependencies**: Localization keys from `lang/en.json`

#### `styles/visibility-manager.css`

- **Purpose**: Modern CSS styling for FoundryVTT v13
- **Features**:
  - CSS custom properties integration
  - Responsive design breakpoints
  - Animation keyframes for visual effects
  - Theme-aware styling
  - Tab navigation styles
  - Cover-specific styling
- **Dependencies**: FoundryVTT v13 CSS custom properties

### Functionality

#### `scripts/api.js`

- **Purpose**: Public API and core functionality
- **Class**: `Pf2eVisionerApi`
- **Key Methods**:
  - `openVisibilityManager()`: Open the UI
  - `getVisibilityBetween()`: Query visibility states
  - `setVisibilityBetween()`: Modify visibility states
  - `updateTokenVisuals()`: Refresh visual effects
  - Various utility and state query methods
- **Dependencies**: All other component files

#### `scripts/visibility-effects.js`

- **Purpose**: Visual effects and token appearance management
- **Key Functions**:
  - `updateTokenVisuals()`: Update all token appearances
  - `applyVisibilityState()`: Apply effects to individual tokens
  - `resetTokenAppearance()`: Reset tokens to normal
  - `addVisibilityIndicator()`: Add visual indicators
  - `removeVisibilityIndicator()`: Remove visual indicators
- **Dependencies**: `constants.js`, `utils.js`

### Integration

#### `scripts/hooks.js`

- **Purpose**: FoundryVTT hooks registration and handling
- **Registered Hooks**:
  - `ready`: Module ready notification
  - `controlToken`: Update visuals when tokens are controlled
  - `getTokenHUDButtons`: Add HUD button
  - `getTokenDirectoryEntryContext`: Add context menu
  - `canvasReady` / `refreshToken`: Update visuals
- **Dependencies**: `constants.js`, `visibility-effects.js`, `utils.js`, `api.js`

#### `scripts/settings.js`

- **Purpose**: Module settings and keybindings management
- **Functions**:
  - `registerSettings()`: Register all module settings
  - `registerKeybindings()`: Register keyboard shortcuts
- **Dependencies**: `constants.js`, `visibility-effects.js`, `api.js`

## Data Flow

### Initialization Flow

1. `main.js` initializes on Foundry's `init` hook
2. `settings.js` registers module settings and keybindings
3. `hooks.js` registers all FoundryVTT event handlers
4. Global `PerTokenVisibility` API is exposed

### Visibility Management Flow

1. User opens visibility manager via hotkey, HUD, or context menu
2. `api.js` validates permissions and controlled tokens
3. `visibility-manager.js` creates ApplicationV2 instance
4. Template renders with current visibility data from `utils.js`
5. User makes changes and submits form
6. `visibility-effects.js` updates token appearances
7. Changes are persisted via token flags

### Visual Update Flow

1. Token control change triggers `controlToken` hook
2. `hooks.js` calls `updateTokenVisuals()`
3. `visibility-effects.js` reads visibility data for controlled token
4. Each target token gets appropriate visual effects applied
5. Visual indicators are added/removed based on settings

## Benefits of This Architecture

### Maintainability

- **Single Responsibility**: Each file has a clear, focused purpose
- **Loose Coupling**: Components interact through well-defined interfaces
- **Easy Testing**: Individual components can be tested in isolation

### Readability

- **Clear Structure**: File names and organization make functionality obvious
- **Focused Files**: No single file is overwhelming in size
- **Documentation**: Each file has clear purpose and dependencies

### Extensibility

- **Modular Design**: New features can be added without affecting core components
- **Clean API**: Other modules can integrate via the public API
- **Configurable**: Constants and settings are centralized for easy modification

### Performance

- **ES Modules**: Modern JavaScript module system with tree-shaking
- **Lazy Loading**: Some modules are imported only when needed
- **Efficient Updates**: Visual effects only update when necessary

## Development Workflow

### Adding New Features

1. Determine which component should contain the new functionality
2. Add any new constants to `constants.js`
3. Implement core logic in the appropriate component file
4. Update the UI template and styles if needed
5. Expose public methods through `api.js` if needed
6. Add appropriate tests and documentation

### Debugging

- Each component can be debugged independently
- Console access via `window.PerTokenVisibility`
- Clear separation makes error tracing easier
- Modular imports allow for selective debugging

### Testing

- Individual components can be unit tested
- Integration tests can focus on component interactions
- UI components can be tested separately from business logic
- Mock dependencies are easier to create with this structure

## AVS performance components (September 2025)

- LightingRasterService: fast, approximate darkness sampling along a ray using LightingCalculator. Used as an optional fast path inside VisibilityCalculator. On errors or absence, it falls back to the precise shape-based detector. No behavior changes, only speed.
- HashGridIndex: uniform spatial hash replacing the transient quadtree for per-batch candidate queries (build, queryRect, queryCircle). It’s API-compatible with SpatialBatchIndex and typically faster for Foundry-scale token counts.

Both components are per-batch/transient and side-effect free. They follow our golden rules: no timers, batch-only, no lighting refresh. A unit test checks HashGrid vs. SpatialBatch parity on deterministic data.
