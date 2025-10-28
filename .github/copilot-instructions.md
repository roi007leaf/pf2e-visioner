# PF2E Visioner – Copilot Instructions

**Purpose**: Give coding AIs crisp, actionable guardrails for this repo. Follow these rules unless a maintainer explicitly asks otherwise.

## Quick Start - Most Critical Rules

1. **Check HANDOVER.md first** - Contains current architecture, recent changes, and critical gotchas
2. **Never use timers** - No setInterval/setTimeout for core flows; use hooks and events
3. **Always batch operations** - Never loop over tokens with individual updates
4. **Deep-merge flags** - Never overwrite `flags["pf2e-visioner"]` objects; always merge
5. **Every bug needs a test** - Add regression tests for all bugfixes
6. **Use i18n for all UI text** - No hardcoded strings; update lang/*.json

## Code Quality & Style

- **Keep functions focused**: Break long functions into smaller, single-purpose functions
- **Self-documenting code**: Use clear names; add comments only for complex algorithms or non-obvious behavior
- **Maintain readability**: Clean, idiomatic code is preferred over clever code
- **Don't modify unprompted**: Only change code you're specifically instructed to modify
- **Don't rename without instruction**: Preserve existing function/variable names unless explicitly asked
- **Don't refactor unprompted**: Focus on the requested task, not code reorganization
- **If uncertain, say so**: Don't guess or make assumptions; ask for clarification

## Communication & Output Style

- **Be concise**: Keep answers short and to the point
- **No verbose explanations**: Don't explain what you're about to do before doing it
- **Use tools, not codeblocks**: Never print code changes in chat; use edit tools instead
- **Use terminal, not suggestions**: Run commands directly; don't tell user to run them
- **Action over words**: Prefer taking action over describing planned actions
- **Direct responses**: Answer questions directly without preamble

## Architecture Principles

- **Event-driven architecture**: Use Foundry hooks, debounced events, or batch cycles instead of timers
- **Flag-based persistence**: All state persists via token/scene flags under `flags["pf2e-visioner"]`
- **Deep-merge only**: Use service methods to merge flags; never overwrite entire flag objects
- **Batch operations**: Favor Scene.updateEmbeddedDocuments over individual token updates
- **ApplicationV2 only**: All UI uses Foundry v13's ApplicationV2 framework
- **No hidden side effects**: Prefer services and stores with explicit dependency injection
- **Synchronous hot paths**: Keep render-critical paths synchronous; async only when necessary
- **Service-based architecture**: Use stores for state, services for orchestration

## Testing Requirements

- **Run tests in terminal**: Use VS Code task "Run unit tests", not internal tool
- **Test coverage for bugs**: Every bugfix requires a regression test if none exists
- **Don't modify failing tests**: If an old unit test fails, fix the code, not the test
- **Keep tests separate**: Never mix test code and production code
- **Preserve debug logs**: Don't delete debug logs until user confirms bug is fixed
- **Use Jest**: Testing framework is Jest, not Vitest

## Localization & Accessibility

- **i18n keys only**: All user-facing text uses localization keys from lang/*.json
- **Update all locales**: Add English translations, mark other locales with TODO
- **CSS custom properties**: All colors use CSS custom properties; no hardcoded hex values
- **Colorblind support**: Respect colorblind modes; test with all accessibility settings

## External References

- **Foundry API**: https://foundryvtt.com/api/ for Foundry-related questions
- **PF2e System**: https://github.com/foundryvtt/pf2e for system API and patterns
- **PF2e Rules**: https://2e.aonprd.com/ for game rules references
 
## Architecture You Must Respect

- **Stores** (single-responsibility): `scripts/stores/*` – visibility/cover maps, simple get/set
- **Services** (cross-cutting): `scripts/services/*` – orchestration, perception refresh, visuals, sockets
- **UI controllers**: `scripts/managers/*` – thin ApplicationV2 controllers
- **Hooks**: `scripts/hooks/*` – registration split by concern; `hooks/registration.js` composes
- **Cover/Visibility engines**: `scripts/cover/*`, `scripts/visibility/*` – effect aggregation, batch processing
- **Chat automation**: `scripts/chat/*` – actions, dialogs, results
- **Public API**: `scripts/api.js` – stable surface. Internal helpers in `services/api-internal.js`
- **Rule Elements**: `scripts/rule-elements/*` – PF2e rule element integrations for visibility/cover effects

## State Contracts

### Visibility States (PF2e)
- **observed**: Full visibility, no penalties
- **concealed**: DC 5 flat check to target
- **hidden**: Requires Seek, DC 11 flat check
- **undetected**: Unknown location, cannot target

### Cover States (PF2e)
- **none**: No AC bonus
- **lesser**: +1 AC
- **standard**: +2 AC
- **greater**: +4 AC

### Flag Structure
```javascript
// Visibility: per-observer state
token.flags["pf2e-visioner"].visibility = {
  [observerId]: "observed" | "concealed" | "hidden" | "undetected"
}

// Cover: per-attacker state
token.flags["pf2e-visioner"].cover = {
  [attackerId]: "none" | "lesser" | "standard" | "greater"
}

// Overrides: manual GM overrides
token.flags["pf2e-visioner"]["avs-override-from-${observerId}"] = true

// Scene: party token cache
scene.flags["pf2e-visioner"].partyTokenStateCache = {
  [tokenId]: { visibility, cover, effects }
}
```

**CRITICAL**: Always deep-merge flags, NEVER overwrite:
```javascript
// ❌ WRONG - wipes all data
await token.update({"flags.pf2e-visioner": newData});

// ✅ CORRECT - use service
await VisibilityMapService.setVisibilityState(token, observer, state);
```

## Performance Patterns

- **Batch writes and effect rebuilds**: Avoid per-target loops with immediate awaits
- **Defer heavy work**: GM or token owners to avoid duplicate computation
- **Avoid refreshLighting**: Refresh vision/occlusion only when needed
- **Debounce/react to hooks**: Avoid feedback loops from move/animate/lighting

## UI/UX Conventions

- **CSS custom properties**: All colors from `styles/*.css`; never hardcode hex values
- **Colorblind modes**: Support Protanopia, Deuteranopia, Tritanopia, Achromatopsia
- **Responsive design**: Token Manager and dialogs work on all screen sizes
- **Bulk actions**: Support Apply/Revert per-row and bulk Apply All/Revert All

## Testing + Quality Gates

- **Jest test suite must pass**: Use provided npm scripts
- **Maintain coverage**: Add unit tests for helpers, integration tests for flows
- **Run linting**: Keep ESModule imports tidy
- **Deterministic tests**: Use provided Foundry/PF2e mocks
- **Never change production for tests**: Fix tests instead
- **No debug logs in tests**: Use debugger expressions, tell user to run in debug

## Do/Don't Examples

### Do ✅
- Add a service and register it via hooks/registration or API init
- Read/merge token flags with defensive null checks
- Batch update token flags and then trigger a single visuals refresh
- Use i18n keys; update `lang/*.json` when introducing user-facing text

### Don't ❌
- Write directly to `token.document.flags.pf2e-visioner = {...}` (overwrites!)
- Call `canvas.perception.update({ refreshLighting: true })`
- Add long-lived timers or polling for visibility/cover
- Introduce UI inline styles or hardcoded colors
- Use time-based solutions when event/hook-based alternatives exist

## Common Pitfalls (and Correct Approach)

- **Token vs TokenDocument**: When in doubt, operate on TokenDocument for persistence; use `token.document`
- **Cross-client updates**: Prefer socket-based perception refresh via services; avoid duplicating work
- **Effect lifecycle**: Aggregate effects are intentional; clean up after roll-time effects
- **Party tokens**: Respect preservation/restoration services and caches; avoid manual flag operations

## How to Add a Feature Safely

1. **Identify the layer(s)**: Store vs service vs UI
2. **Add minimal store getters/setters**: Pure data, then a service for orchestration
3. **Wire hooks/UI to call the service**: Keep UI thin
4. **Write unit tests**: Helpers/service tests and integration tests if flow touches canvas/chat
5. **Update docs**: README/DEVELOPMENT/ARCHITECTURE if behavior changes

## File Map for Common Tasks

- **Visibility map read/write**: `scripts/stores/visibility-map.js`
- **Cover map read/write**: `scripts/stores/cover-map.js`
- **Visual refresh**: `scripts/services/visual-effects.js`
- **Hook wiring**: `scripts/hooks/registration.js`, `scripts/hooks/*.js`
- **Chat automation**: `scripts/chat/**` (dialogs, processors, services)
- **Public API**: `scripts/api.js`
- **Rule elements**: `scripts/rule-elements/pf2e-visioner-effect.js`

## Localization and Accessibility

- **Add English strings** to `lang/en.json` and mirror to other locales with TODO comments
- **Keep ARIA/tooltips consistent**: Reuse existing tooltip helpers
- **Colorblind modes**: Test all four modes (Protanopia, Deuteranopia, Tritanopia, Achromatopsia)

## Security/Permissions

- **Assume limited permissions**: Guard actions by role; GM-first for destructive ops
- **Token ownership**: Check token.isOwner before allowing state changes

## When in Doubt

- **Check HANDOVER.md first**: Align with patterns there
- **Prefer small, reversible changes**: Add TODO comments with clear follow-ups
- **Performance impact**: Add benchmark test or micro-benchmark under tests

## Auto-Visibility System (AVS) Structuring

- **Core orchestration**: Lives in services; keep hot-path math/data pure and synchronous
- **Dependency Injection (DI)**: Register services once and pass them explicitly; don't reach for globals

### Key Components
- **Event-Driven Visibility System (EDS)**: Reacts to hooks and delegates to services; avoid long async ops
- **BatchProcessor**: Entry to batch recompute; never mutate flags directly—go through services
- **Spatial index & filters**: Use viewport/range filtering before heavy processing

### Caches (Use, Don't Reinvent)
- **PositionBatchCache**: Snapshot token positions for the batch
- **VisibilityMapBatchCache**: Snapshot original per-observer maps to compare/reconcile
- **OverrideBatchCache**: Memoize per-pair manual overrides; read via OverrideService
- **Global caches**: GlobalLos/GlobalVisibility caches with TTL; prefer for repeated queries

### Services Contract
- **VisibilityMapService**: Single source of truth for reading/writing visibility maps; deep-merge writes only
- **OverrideService**: Best-effort sync lookup `getActiveOverrideForTokens(observer, target)`; only read in hot paths
- **Visual effects service**: Trigger one consolidated refresh after batch writes; do not call `refreshLighting`

### AVS Do/Don't

#### Do ✅
- Wire EDS → BatchProcessor with services injected via DI
- Filter candidates by viewport and max range before per-pair work
- Batch flag updates and perform a single visuals/perception refresh via services
- Keep batch steps side-effect free until the final commit phase

#### Don't ❌
- Don't access `visibilityMapFunctions` or other legacy function deps—use services
- Don't await per-target writes in a loop; collect and batch
- Don't compute the same pair twice—check caches first
- Don't introduce timers/polling to drive AVS; rely on hooks and debounced signals

## Rule Elements System

The module supports PF2e rule elements for advanced visibility and cover modifications:

### PF2eVisionerEffect Rule Element
- **Purpose**: Apply visibility/cover modifications through PF2e's rule element system
- **Location**: `scripts/rule-elements/pf2e-visioner-effect.js`
- **Integration**: Registered with PF2e system during module initialization
- **Usage**: Can be added to items to modify visibility states or cover levels

### Rule Element Patterns
- **Validation**: Always validate rule element data before applying effects
- **Compatibility**: Ensure rule elements work with PF2e system version
- **Documentation**: Update RULE_ELEMENTS.md when adding new rule element types
- **Testing**: Add unit tests for rule element logic and integration tests for PF2e interaction

## Recent Feature Updates

### Sound-Blocking Walls
- **Detection**: Uses `CONFIG.Canvas.polygonBackends.sound.testCollision()` for sound-blocking walls
- **Rules**: When sight AND sound blocked, targets become "undetected" (not just "hidden")
- **Senses**: Tremorsense, scent, and lifesense bypass sound-blocking walls
- **Files**: `VisionAnalyzer.js`, `StatelessVisibilityCalculator.js`

### Movement Action Support
- **Tremorsense**: Now uses `movementAction` property instead of elevation
- **Flying detection**: `movementAction === 'fly'` means tremorsense fails
- **Cache invalidation**: Movement action changes clear all caches
- **Files**: `StatelessVisibilityCalculator.js`, `TokenEventHandler.js`

### Lighting Cache Management
- **Multi-layer caches**: Position, LOS, visibility, and lighting caches
- **Invalidation**: Event handlers MUST clear caches when state changes
- **TTL-based**: Caches have time-to-live to prevent stale data
- **Coordination**: BatchOrchestrator coordinates cache clearing across all layers

## Commands You Can Run

- **Run unit tests**: VS Code task "Run unit tests" (npm test)
- **Re-run subset**: "Re-run unit tests (subset)" task where provided
- **Coverage report**: npm run test:coverage
- **Linting**: npm run lint
