# GM Selected-Token Foundry-Hidden Secrecy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a GM's selected-token perspective hide Foundry-hidden targets exactly as a player observer perspective does, while restoring normal GM rendering after deselection.

**Architecture:** Remove account-role bypass from the centralized special-sense indicator decision. Extend the current-view render lock so GM-visible Foundry-hidden token art is suppressed only while a controlled or dragged observer establishes a token perspective.

**Tech Stack:** JavaScript ES modules, Foundry VTT token rendering, Jest 30, ESLint 9

---

### Task 1: Prove the GM indicator leak

**Files:**
- Modify: `tests/unit/services/system-hidden-token-highlights.test.js`

- [ ] **Step 1: Change the GM decision characterization into the required behavior**

Rename `keeps Foundry-hidden special-sense decisions available to a GM viewer` to
`blocks Foundry-hidden special-sense decisions in a GM observer perspective`. Remove the injected
`user` values from both Foundry-hidden decision tests and change the GM expectation to:

```js
expect(
  buildSystemHiddenIndicatorDecision({
    observer,
    token: target,
    senseContext: getSystemHiddenSenseContext(observer),
    grid: {
      size: 50,
      distance: 5,
      measurePath: jest.fn(() => ({ distance: 5 })),
    },
  }),
).toMatchObject({
  shouldShowIndicator: false,
  shouldShowScentIndicator: false,
});
```

- [ ] **Step 2: Exercise stale-indicator cleanup as a GM**

Rename the lifecycle test to
`removes a stale special-sense indicator when a GM target becomes Foundry hidden` and set:

```js
global.game.user.isGM = true;
```

Keep its existing expectations that the display object is removed, destroyed, and cleared from the
token.

### Task 2: Prove the GM token-art leak and safe deselection

**Files:**
- Modify: `tests/unit/services/current-view-hard-hide.test.js`

- [ ] **Step 1: Require the GM selected-token view to hard-hide Foundry-hidden targets**

Change the existing target decision test to:

```js
it('GM observer: Foundry-hidden token is hard-hidden from the selected-token view', () => {
  globalThis.game = { user: { isGM: true } };
  const t = target('t', 'character', { hidden: true });
  __setStoredVisibilityForTest(new Map([['obs:t', 'observed']]));
  expect(targetIsHardHiddenFromCurrentView(t)).toBe(true);
});
```

- [ ] **Step 2: Preserve normal GM visibility with no observer**

Add:

```js
it('GM without an observer leaves Foundry-hidden rendering to Core', () => {
  globalThis.game = { user: { isGM: true } };
  controlled.length = 0;
  draggedToken = null;
  const t = target('t', 'character', { hidden: true });
  __setStoredVisibilityForTest(new Map([['obs:t', 'observed']]));
  expect(targetIsHardHiddenFromCurrentView(t)).toBe(false);
});
```

- [ ] **Step 3: Require the render lock to suppress GM-visible hidden art**

Replace the existing Foundry-hidden restoration test with:

```js
it('hard-hides a Foundry-hidden token in a GM selected-token view', () => {
  globalThis.game = { user: { isGM: true } };
  const t = {
    controlled: false,
    visible: true,
    renderable: true,
    mesh: { visible: true, renderable: true, alpha: 0.5 },
    document: { id: 't', hidden: true },
    actor: { type: 'npc', itemTypes: { condition: [] } },
  };
  __setStoredVisibilityForTest(new Map([['obs:t', 'observed']]));

  expect(applyCurrentViewHardHide(t)).toBe(true);
  expect(t.visible).toBe(false);
  expect(t.renderable).toBe(false);
  expect(t.mesh).toEqual({ visible: false, renderable: false, alpha: 0 });
  expect(t._pvCurrentViewHardHidden).toBe(true);
});
```

- [ ] **Step 4: Run both focused suites and verify RED**

Run:

```bash
rtk npx jest tests/unit/services/system-hidden-token-highlights.test.js tests/unit/services/current-view-hard-hide.test.js --runInBand
```

Expected: GM special-sense decision, stale-indicator cleanup, GM hard-hide decision, and render-lock
tests fail. The no-observer GM test passes as a safety characterization.

### Task 3: Remove role bypass from observer-perspective indicators

**Files:**
- Modify: `scripts/services/system-hidden-token-highlights.js`
- Test: `tests/unit/services/system-hidden-token-highlights.test.js`

- [ ] **Step 1: Remove the viewing-user input**

Change the function arguments back to:

```js
export function buildSystemHiddenIndicatorDecision({
  observer,
  token,
  positionOverride = null,
```

- [ ] **Step 2: Make Foundry Hidden an unconditional indicator exclusion**

Replace the current role-aware predicate with:

```js
const mayShowSystemHiddenIndicator = token?.document?.hidden !== true;
```

The existing five per-mode guards remain unchanged and therefore all become false for a
Foundry-hidden target.

### Task 4: Make the render lock depend on active perspective

**Files:**
- Modify: `scripts/services/Detection/current-view-hard-hide.js`
- Test: `tests/unit/services/current-view-hard-hide.test.js`
- Test: `tests/unit/services/detection-token-refresh-hard-hide-integration.test.js`

- [ ] **Step 1: Replace the GM account bypass**

Replace `foundryHiddenRequiresVisionerRenderLock` with:

```js
function foundryHiddenRequiresVisionerRenderLock(target) {
  if (!target?.document?.hidden) return false;
  if (!globalThis.game?.user?.isGM) return true;
  return currentViewObservers().length > 0;
}
```

This keeps the existing non-GM render safety lock, adds a GM lock during selected or dragged token
perspective, and lets the existing GM release branch restore Core rendering when observers become
empty.

- [ ] **Step 2: Update the nested held-drag integration contract**

Rename the first nested refresh test to
`keeps a Foundry-hidden target secret across a nested held-drag refresh`. Keep the target Foundry
Hidden, change the settled-state comment to state that Foundry Hidden remains authoritative, and
assert after both nested wrappers:

```js
expect(token.visible).toBe(false);
expect(token.mesh.visible).toBe(false);
expect(token._pvCurrentViewHardHidden).toBe(true);
```

- [ ] **Step 3: Run the focused suites and verify GREEN**

Run:

```bash
rtk npx jest tests/unit/services/system-hidden-token-highlights.test.js tests/unit/services/current-view-hard-hide.test.js tests/unit/services/detection-token-refresh-hard-hide-integration.test.js --runInBand
```

Expected: all three suites pass.

### Task 5: Verify and commit

**Files:**
- Verify: `scripts/services/system-hidden-token-highlights.js`
- Verify: `scripts/services/Detection/current-view-hard-hide.js`
- Verify: `tests/unit/services/system-hidden-token-highlights.test.js`
- Verify: `tests/unit/services/current-view-hard-hide.test.js`
- Verify: `tests/unit/services/detection-token-refresh-hard-hide-integration.test.js`
- Verify: `docs/superpowers/specs/2026-08-16-foundry-hidden-special-sense-secrecy-design.md`
- Verify: `docs/superpowers/plans/2026-08-16-gm-selected-foundry-hidden-secrecy.md`

- [ ] **Step 1: Run related detection integration tests**

Run:

```bash
rtk npx jest tests/unit/services/system-hidden-token-highlights.test.js tests/unit/services/current-view-hard-hide.test.js tests/unit/services/detection-token-refresh-hard-hide-integration.test.js --runInBand
```

Expected: all three suites pass.

- [ ] **Step 2: Lint changed JavaScript files**

Run:

```bash
rtk npx eslint scripts/services/system-hidden-token-highlights.js scripts/services/Detection/current-view-hard-hide.js tests/unit/services/system-hidden-token-highlights.test.js tests/unit/services/current-view-hard-hide.test.js
```

Expected: exit code 0 with no lint errors.

- [ ] **Step 3: Run the full Jest suite**

Run:

```bash
rtk npm test
```

Expected: all suites pass.

- [ ] **Step 4: Audit and commit only scoped files**

Run:

```bash
rtk git diff --check
rtk git add docs/superpowers/specs/2026-08-16-foundry-hidden-special-sense-secrecy-design.md docs/superpowers/plans/2026-08-16-gm-selected-foundry-hidden-secrecy.md scripts/services/system-hidden-token-highlights.js scripts/services/Detection/current-view-hard-hide.js tests/unit/services/system-hidden-token-highlights.test.js tests/unit/services/current-view-hard-hide.test.js tests/unit/services/detection-token-refresh-hard-hide-integration.test.js
rtk git diff --cached --check
rtk git commit -m "fix(visibility): hide Foundry-hidden tokens from GM perspectives"
```

Expected: one correction commit; unrelated pack database files remain unstaged.
