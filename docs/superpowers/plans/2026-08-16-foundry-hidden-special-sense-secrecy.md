# Foundry-Hidden Special-Sense Secrecy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent every Visioner special-sense indicator from revealing a Foundry-hidden token to a non-GM user.

**Architecture:** Put one viewer-aware secrecy predicate in the centralized system-hidden indicator decision function. Keep Foundry-hidden targets in the update loop so its existing cleanup branch removes stale indicators, while leaving GM and ordinary perception-hidden behavior unchanged.

**Tech Stack:** JavaScript ES modules, Foundry VTT token placeables, Jest 30, ESLint 9

---

### Task 1: Add the regression coverage

**Files:**
- Modify: `tests/unit/services/system-hidden-token-highlights.test.js`

- [ ] **Step 1: Add a decision-level failing test**

Add this test after the existing in-range Scent decision test:

```js
test('blocks every special-sense indicator for a Foundry-hidden target viewed by a player', () => {
  const observer = {
    document: { id: 'observer', x: 0, y: 0, width: 1, height: 1 },
    actor: {
      system: {
        perception: {
          senses: [
            { type: 'lifesense', range: 60 },
            { type: 'thoughtsense', range: 60 },
            { type: 'echolocation', acuity: 'precise', range: 60 },
            { type: 'scent', range: 60 },
          ],
        },
      },
      hasCondition: jest.fn((slug) => slug === 'blinded' || slug === 'deafened'),
    },
  };
  const target = {
    visible: false,
    renderable: false,
    document: { id: 'target', hidden: true, x: 250, y: 0, width: 1, height: 1 },
    actor: { system: { traits: { value: [] } } },
  };

  expect(
    buildSystemHiddenIndicatorDecision({
      observer,
      token: target,
      user: { isGM: false },
      senseContext: getSystemHiddenSenseContext(observer),
      grid: {
        size: 50,
        distance: 5,
        measurePath: jest.fn(() => ({ distance: 5 })),
      },
      getVisibilityState: jest.fn(() => 'hidden'),
      getDetectionBetween: jest.fn(() => ({
        sense: 'echolocation',
        isPrecise: true,
      })),
      isSoundBlocked: jest.fn(() => true),
      canLifesenseDetect: jest.fn(() => true),
      canThoughtsenseDetect: jest.fn(() => true),
      canScentDetect: jest.fn(() => true),
    }),
  ).toMatchObject({
    shouldShowIndicator: false,
    shouldShowLifesenseIndicator: false,
    shouldShowScentIndicator: false,
    shouldShowThoughtsenseIndicator: false,
    shouldShowEcholocationIndicator: false,
    shouldShowBlindDeafIndicator: false,
  });
});
```

- [ ] **Step 2: Add a GM characterization test**

Add this focused test after the player test:

```js
test('keeps Foundry-hidden special-sense decisions available to a GM viewer', () => {
  const observer = {
    document: { id: 'observer', x: 0, y: 0, width: 1, height: 1 },
    actor: {
      system: { perception: { senses: [{ type: 'scent', range: 30 }] } },
      hasCondition: jest.fn(() => false),
    },
  };
  const target = {
    visible: false,
    renderable: false,
    document: { id: 'target', hidden: true, x: 250, y: 0, width: 1, height: 1 },
    actor: { system: { traits: { value: [] } } },
  };

  expect(
    buildSystemHiddenIndicatorDecision({
      observer,
      token: target,
      user: { isGM: true },
      senseContext: getSystemHiddenSenseContext(observer),
      grid: {
        size: 50,
        distance: 5,
        measurePath: jest.fn(() => ({ distance: 5 })),
      },
    }),
  ).toMatchObject({
    shouldShowIndicator: true,
    indicatorMode: 'scent',
    shouldShowScentIndicator: true,
  });
});
```

- [ ] **Step 3: Add a stale-indicator lifecycle test**

Add this test inside `describe('system-hidden indicator render lifecycle', ...)` after the existing matching-indicator test:

```js
test('removes a stale special-sense indicator when a player target becomes Foundry hidden', async () => {
  const { updateSystemHiddenTokenHighlights } = await import(
    '../../../scripts/services/visual-effects.js'
  );

  global.game.user.isGM = false;
  const parent = { removeChild: jest.fn() };
  const existingIndicator = {
    _pvObserverId: 'observer',
    _pvIndicatorMode: 'scent',
    parent,
    destroy: jest.fn(),
  };
  const observer = {
    id: 'observer',
    document: { id: 'observer', x: 0, y: 0, width: 1, height: 1 },
    actor: {
      type: 'character',
      system: { perception: { senses: [{ type: 'scent', range: 60 }] } },
      hasCondition: jest.fn(() => false),
    },
    distanceTo: jest.fn(() => 30),
  };
  const hiddenTarget = {
    id: 'target',
    document: { id: 'target', hidden: true, x: 100, y: 0, width: 1, height: 1 },
    actor: {
      type: 'character',
      system: { traits: { value: [] } },
    },
    visible: false,
    renderable: false,
    _pvSystemHiddenIndicator: existingIndicator,
  };

  global.canvas.tokens.placeables = [observer, hiddenTarget];
  global.canvas.tokens.get = jest.fn((id) => (id === 'observer' ? observer : hiddenTarget));

  await updateSystemHiddenTokenHighlights('observer');

  expect(parent.removeChild).toHaveBeenCalledWith(existingIndicator);
  expect(existingIndicator.destroy).toHaveBeenCalledTimes(1);
  expect(hiddenTarget._pvSystemHiddenIndicator).toBeNull();
});
```

- [ ] **Step 4: Run the focused test and verify RED**

Run:

```bash
rtk npx jest tests/unit/services/system-hidden-token-highlights.test.js --runInBand
```

Expected: the player decision and stale-indicator tests fail because
`buildSystemHiddenIndicatorDecision` currently ignores `token.document.hidden` and the viewer role.

### Task 2: Add the centralized player-secrecy gate

**Files:**
- Modify: `scripts/services/system-hidden-token-highlights.js`
- Test: `tests/unit/services/system-hidden-token-highlights.test.js`

- [ ] **Step 1: Accept the viewing user in the decision function**

Extend the function arguments:

```js
export function buildSystemHiddenIndicatorDecision({
  observer,
  token,
  user = globalThis.game?.user,
  positionOverride = null,
```

- [ ] **Step 2: Compute one Foundry-hidden eligibility predicate**

Immediately after the existing `isSystemHidden` declaration, add:

```js
const mayShowSystemHiddenIndicator =
  token?.document?.hidden !== true || user?.isGM === true;
```

- [ ] **Step 3: Apply the predicate to every indicator mode**

Make each indicator decision begin with the shared predicate:

```js
const shouldShowLifesenseIndicator =
  mayShowSystemHiddenIndicator &&
  isSystemHidden &&
  canBeDetectedByLifesense &&
  isWithinLifesenseRange;
const shouldShowScentIndicator =
  mayShowSystemHiddenIndicator &&
  isSystemHidden &&
  !!senseContext?.observerHasScent &&
  canBeDetectedByScent &&
  isWithinScentRange;
const shouldShowThoughtsenseIndicator =
  mayShowSystemHiddenIndicator &&
  !!senseContext?.observerHasThoughtsense &&
  canBeDetectedByThoughtsense &&
  isWithinThoughtsenseRange &&
  (isSystemHidden || isHiddenFromObserver) &&
  getSoundBlocked({ observer, token, isSoundBlocked });
const shouldShowEcholocationIndicator =
  mayShowSystemHiddenIndicator &&
  isSystemHidden &&
  !!senseContext?.observerHasEcholocation &&
  !senseContext?.observerIsDeafened &&
  !echolocationSoundBlocked &&
  isWithinEcholocationRange &&
  detectedByEcholocation;
const shouldShowBlindDeafIndicator =
  mayShowSystemHiddenIndicator &&
  !!senseContext?.observerIsBlindAndDeaf &&
  isHiddenFromObserver;
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
rtk npx jest tests/unit/services/system-hidden-token-highlights.test.js --runInBand
```

Expected: all tests pass, including the player secrecy, GM characterization, ordinary Scent, and
stale cleanup cases.

- [ ] **Step 5: Run related visibility-service tests**

Run:

```bash
rtk npx jest tests/unit/services/system-hidden-token-highlights.test.js tests/unit/services/current-view-hard-hide.test.js --runInBand
```

Expected: both suites pass.

### Task 3: Verify and commit

**Files:**
- Verify: `scripts/services/system-hidden-token-highlights.js`
- Verify: `tests/unit/services/system-hidden-token-highlights.test.js`

- [ ] **Step 1: Lint changed JavaScript files**

Run:

```bash
rtk npx eslint scripts/services/system-hidden-token-highlights.js tests/unit/services/system-hidden-token-highlights.test.js
```

Expected: exit code 0 with no lint errors.

- [ ] **Step 2: Run the complete Jest suite**

Run:

```bash
rtk npm test
```

Expected: every Jest suite passes.

- [ ] **Step 3: Check the final diff**

Run:

```bash
rtk git diff --check
rtk git diff -- scripts/services/system-hidden-token-highlights.js tests/unit/services/system-hidden-token-highlights.test.js
```

Expected: no whitespace errors and only the scoped secrecy predicate plus regression coverage.

- [ ] **Step 4: Commit the implementation**

Run:

```bash
rtk git add scripts/services/system-hidden-token-highlights.js tests/unit/services/system-hidden-token-highlights.test.js
rtk git commit -m "fix(visibility): hide Foundry-hidden tokens from player senses"
```

Expected: one implementation commit containing only the production fix and tests.
