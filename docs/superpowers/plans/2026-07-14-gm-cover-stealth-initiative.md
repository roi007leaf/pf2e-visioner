# GM-Authoritative Cover for Stealth-Initiative Rolls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a token rolls Stealth for initiative, restrict auto-detected cover to tokens actually in the current encounter, and let the GM pick the final cover state (via the module's existing cover-button dialog) before the roll's dice are cast, instead of silently auto-applying or letting the rolling player pick it themselves.

**Architecture:** `AutoCoverHooks._wrapCheckRoll` already `await`s `StealthCheckUseCase.handleCheckRoll(check, context)` before `game.pf2e.Check.roll` actually rolls dice — for both the "show check dialog" and "quick roll" paths. A new `StealthInitiativeCoverCoordinator` singleton is invoked from there: if the current client is a GM, it opens the cover dialog directly; otherwise it round-trips through socketlib to the GM's client and blocks (with a 30s timeout fallback) until a response arrives. The observer-collection bug fix (encounter-only tokens) lives one layer down in `stealth-observer-analysis.js`, shared by every caller.

**Tech Stack:** Vanilla JS (ES modules), Jest for tests, Foundry VTT ApplicationV2 for dialogs, socketlib for GM/player messaging (already a hard dependency of this module).

## Global Constraints

- Every user-facing string goes through `game.i18n.localize` with a key added to `lang/en.json` — no hardcoded UI text.
- Do not add code comments (including JSDoc) to any new or modified code.
- Do not rename existing functions/methods, do not refactor untouched code, do not touch code outside what each task specifies.
- Do not modify any existing test's assertions except the one test explicitly called out in Task 5 (which encodes the exact old behavior being replaced) — every other existing test must keep passing unchanged.
- GM-response timeout: 30000ms (`GM_RESPONSE_TIMEOUT_MS` in the new coordinator).
- New socket channel names: `StealthInitiativeCoverRequest`, `StealthInitiativeCoverResponse`.

---

### Task 1: Fix encounter-only observer filtering (bug fix)

**Files:**
- Modify: `scripts/cover/auto-cover/usecases/stealth-observer-analysis.js`
- Test: `tests/unit/auto-cover/usecases/stealth-observer-analysis.test.js`

**Interfaces:**
- Produces: `collectStealthObservers(hider, { mode, combat })` — `combat` is a new optional parameter (defaults to `game?.combat`); when a combat is present, only tokens resolving to one of its `combatants` are considered, on top of the existing alliance-mode filtering. `analyzeStealthObserverCover` and every other caller are unaffected in signature (they don't pass `combat` and pick up the default).

- [ ] **Step 1: Write the failing tests**

Add to the end of `tests/unit/auto-cover/usecases/stealth-observer-analysis.test.js`, inside the existing `describe('stealth observer analysis', ...)` block (after the last existing `test(...)`, before the closing `});`):

```js
  test('excludes an observer that matches alliance but is not a combatant in the active encounter', () => {
    const hider = token('hider', 'party');
    const enemyCombatant = token('enemyCombatant', 'opposition');
    const enemyBystander = token('enemyBystander', 'opposition');
    global.canvas.tokens.placeables = [hider, enemyCombatant, enemyBystander];

    const combat = { combatants: [{ tokenId: 'hider' }, { tokenId: 'enemyCombatant' }] };

    const result = collectStealthObservers(hider, { mode: 'non-party', combat });

    expect(result).toEqual([enemyCombatant]);
  });

  test('includes an observer that is a combatant in the active encounter', () => {
    const hider = token('hider', 'opposition');
    const enemy = token('enemy', 'party');
    global.canvas.tokens.placeables = [hider, enemy];

    const combat = { combatants: [{ tokenId: 'hider' }, { tokenId: 'enemy' }] };

    expect(collectStealthObservers(hider, { combat })).toEqual([enemy]);
  });

  test('keeps existing alliance-only behavior when no combat is active', () => {
    const hider = token('hider', 'opposition');
    const enemy = token('enemy', 'party');
    global.canvas.tokens.placeables = [hider, enemy];

    expect(collectStealthObservers(hider, { combat: null })).toEqual([enemy]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/auto-cover/usecases/stealth-observer-analysis.test.js -t "encounter"`
Expected: FAIL — the first two new tests fail because `collectStealthObservers` doesn't filter by `combat` yet (both `enemyCombatant`/`enemyBystander` or just `enemy` get returned without the intended restriction, so the first test in particular returns both enemies instead of one).

- [ ] **Step 3: Implement the fix**

In `scripts/cover/auto-cover/usecases/stealth-observer-analysis.js`, find:

```js
function isNonPartyObserver(token) {
  const alliance = token?.actor?.alliance;
  return alliance !== 'party' && alliance !== 'neutral';
}

function shouldIncludeObserver(token, hider, mode) {
  if (!token?.actor || token.id === hider?.id) return false;
  if (mode === 'all-actors') return true;
  if (mode === 'non-party') return isNonPartyObserver(token);
  return isHostileToHider(token, hider);
}

export function collectStealthObservers(hider, { mode = 'hostile-relative' } = {}) {
  const tokens = canvas?.tokens?.placeables || [];
  const observers = [];

  for (const token of tokens) {
    if (shouldIncludeObserver(token, hider, mode)) observers.push(token);
  }

  return observers;
}
```

Replace with:

```js
function isNonPartyObserver(token) {
  const alliance = token?.actor?.alliance;
  return alliance !== 'party' && alliance !== 'neutral';
}

function getCombatantTokenId(combatant) {
  return combatant?.tokenId ?? combatant?.token?.id ?? combatant?.token?.object?.id ?? null;
}

function combatantsToArray(combat) {
  const collection = combat?.combatants;
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  try {
    return Array.from(collection);
  } catch {
    return [];
  }
}

function isEncounterCombatant(token, combat) {
  const tokenId = token?.id;
  if (!tokenId) return false;
  return combatantsToArray(combat).some((combatant) => getCombatantTokenId(combatant) === tokenId);
}

function shouldIncludeObserver(token, hider, mode, combat) {
  if (!token?.actor || token.id === hider?.id) return false;
  if (combat && !isEncounterCombatant(token, combat)) return false;
  if (mode === 'all-actors') return true;
  if (mode === 'non-party') return isNonPartyObserver(token);
  return isHostileToHider(token, hider);
}

export function collectStealthObservers(
  hider,
  { mode = 'hostile-relative', combat = game?.combat } = {},
) {
  const tokens = canvas?.tokens?.placeables || [];
  const observers = [];

  for (const token of tokens) {
    if (shouldIncludeObserver(token, hider, mode, combat)) observers.push(token);
  }

  return observers;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/auto-cover/usecases/stealth-observer-analysis.test.js`
Expected: PASS — all tests in the file pass, including the 3 new ones and every pre-existing one (none of them set `global.game.combat`, so `combat` defaults to `undefined` in those and the new filter is a no-op for them).

- [ ] **Step 5: Commit**

```bash
git add scripts/cover/auto-cover/usecases/stealth-observer-analysis.js tests/unit/auto-cover/usecases/stealth-observer-analysis.test.js
git commit -m "fix: restrict stealth-initiative cover observers to encounter combatants"
```

---

### Task 2: Add title/confirmLabel options to CoverQuickOverrideDialog

**Files:**
- Modify: `scripts/cover/QuickOverrideDialog.js`
- Test: `tests/unit/cover/quick-override-dialog-options.test.js` (new)

**Interfaces:**
- Produces: `new CoverQuickOverrideDialog(initialState, manualCover, { isStealthContext, title, confirmLabel })` — `title` (string, optional) is merged into `options.window.title` *before* `super(options)` runs (matching this codebase's existing convention in `scripts/ui/OverrideValidationDialog.js:104-110` for setting an ApplicationV2 window title — `ApplicationV2.prototype.title` is a getter-only computed accessor, so it must never be assigned directly as `this.title = ...`); `confirmLabel` (string, optional) overrides the confirm button's text (falls back to today's "Roll" behavior when omitted). Existing call sites (`CoverUIManager.openCoverQuickOverrideDialog`) don't pass these and are unaffected.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/cover/quick-override-dialog-options.test.js`:

```js
import '../../setup.js';

describe('CoverQuickOverrideDialog title/confirmLabel options', () => {
  test('defaults to the localized Roll label and no window title override when no options given', async () => {
    const { CoverQuickOverrideDialog } = await import('../../../scripts/cover/QuickOverrideDialog.js');

    const dialog = new CoverQuickOverrideDialog('none', 'none');
    const html = await dialog._renderHTML({}, {});

    expect(dialog.options.window?.title).toBeUndefined();
    expect(html).toContain('PF2E_VISIONER.UI.ROLL');
  });

  test('uses the provided title and confirmLabel when given', async () => {
    const { CoverQuickOverrideDialog } = await import('../../../scripts/cover/QuickOverrideDialog.js');

    const dialog = new CoverQuickOverrideDialog('standard', 'none', {
      title: "Set Cover — Aria's Stealth Roll",
      confirmLabel: 'Confirm',
    });
    const html = await dialog._renderHTML({}, {});

    expect(dialog.options.window.title).toBe("Set Cover — Aria's Stealth Roll");
    expect(html).toContain('Confirm');
    expect(html).not.toContain('>PF2E_VISIONER.UI.ROLL<');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/cover/quick-override-dialog-options.test.js`
Expected: FAIL — `dialog.options.window` is `undefined` (the constructor doesn't merge a title in yet), and the second test's `confirmLabel` never makes it into the rendered HTML since the constructor and `_renderHTML` don't support it yet.

- [ ] **Step 3: Implement the options**

In `scripts/cover/QuickOverrideDialog.js`, find:

```js
  constructor(initialState = 'none', manualCover, options = {}) {
    super(options);
    this.selected = initialState;
    this._resolver = null;
    this.isStealthContext = options.isStealthContext || false;
    this.manualCover = manualCover;
    currentCoverQuickDialog = this;
  }
```

Replace with:

```js
  constructor(initialState = 'none', manualCover, options = {}) {
    if (options.title) {
      options.window = { ...(options.window || {}), title: options.title };
    }
    super(options);
    this.selected = initialState;
    this._resolver = null;
    this.isStealthContext = options.isStealthContext || false;
    this.manualCover = manualCover;
    this.confirmLabel = options.confirmLabel || null;
    currentCoverQuickDialog = this;
  }
```

Then find:

```js
    const rollLabel =
      game.i18n?.localize?.('PF2E_VISIONER.UI.ROLL') ??
      game.i18n?.localize?.('PF2E.Roll') ??
      'Roll';
```

Replace with:

```js
    const rollLabel =
      this.confirmLabel ??
      game.i18n?.localize?.('PF2E_VISIONER.UI.ROLL') ??
      game.i18n?.localize?.('PF2E.Roll') ??
      'Roll';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/cover/quick-override-dialog-options.test.js`
Expected: PASS

- [ ] **Step 5: Run the full cover test suite to check for regressions**

Run: `npx jest tests/unit/cover tests/unit/auto-cover`
Expected: PASS — no existing test constructs `CoverQuickOverrideDialog` with a `title`/`confirmLabel`, so default behavior (localized "Roll", no title override) is unchanged everywhere else.

- [ ] **Step 6: Commit**

```bash
git add scripts/cover/QuickOverrideDialog.js tests/unit/cover/quick-override-dialog-options.test.js
git commit -m "feat: support custom title/confirm label on CoverQuickOverrideDialog"
```

---

### Task 3: Add stealth-initiative-cover socket channels

**Files:**
- Modify: `scripts/services/socket.js`
- Test: `tests/unit/services/socket-stealth-initiative-cover.test.js` (new)

**Interfaces:**
- Consumes: nothing new yet (the coordinator this dynamically imports doesn't exist until Task 4 — this task's own tests mock that import path with `{ virtual: true }`, documented inline in the test itself via the mock call, since Jest requires that flag to mock a module specifier that doesn't resolve on disk yet).
- Produces:
  - `requestGMStealthInitiativeCover(payload)` → `boolean` (mirrors `requestGMOpenTakeCover`).
  - `stealthInitiativeCoverRequestHandler(payload)` → `Promise<void>`, registered on channel `StealthInitiativeCoverRequest`.
  - `sendStealthInitiativeCoverResponse(userId, payload)` → same return type as `executeSocketForUser`.
  - `stealthInitiativeCoverResponseHandler(payload)` → `Promise<void>`, registered on channel `StealthInitiativeCoverResponse`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/services/socket-stealth-initiative-cover.test.js`:

```js
import '../../setup.js';
import {
  _socketService,
  requestGMStealthInitiativeCover,
  sendStealthInitiativeCoverResponse,
  stealthInitiativeCoverRequestHandler,
  stealthInitiativeCoverResponseHandler,
} from '../../../scripts/services/socket.js';

describe('stealth-initiative cover socket channels', () => {
  afterEach(() => {
    jest.resetModules();
  });

  test('requestGMStealthInitiativeCover sends the request payload to the GM and returns true', () => {
    const executeAsGM = jest.fn();
    const originalSocket = _socketService._socket;
    _socketService._socket = { executeAsGM };

    try {
      const sent = requestGMStealthInitiativeCover({
        requestId: 'req-1',
        hiderTokenId: 'hider-1',
        hiderName: 'Aria',
        suggestedState: 'standard',
        userId: 'player-1',
      });

      expect(sent).toBe(true);
      expect(executeAsGM).toHaveBeenCalledWith(
        'StealthInitiativeCoverRequest',
        expect.objectContaining({ requestId: 'req-1', hiderTokenId: 'hider-1' }),
      );
    } finally {
      _socketService._socket = originalSocket;
    }
  });

  test('requestGMStealthInitiativeCover returns false when no socket is registered', () => {
    const originalSocket = _socketService._socket;
    _socketService._socket = null;

    try {
      expect(requestGMStealthInitiativeCover({ requestId: 'req-1' })).toBe(false);
    } finally {
      _socketService._socket = originalSocket;
    }
  });

  test('stealthInitiativeCoverRequestHandler does nothing when the current user is not GM', async () => {
    global.game.user.isGM = false;
    const handleIncomingGMRequest = jest.fn();

    jest.doMock(
      '../../../scripts/cover/auto-cover/StealthInitiativeCoverCoordinator.js',
      () => ({ __esModule: true, default: { handleIncomingGMRequest } }),
      { virtual: true },
    );

    await stealthInitiativeCoverRequestHandler({ requestId: 'req-1' });

    expect(handleIncomingGMRequest).not.toHaveBeenCalled();

    global.game.user.isGM = true;
  });

  test('stealthInitiativeCoverRequestHandler delegates to the coordinator when GM', async () => {
    global.game.user.isGM = true;
    const handleIncomingGMRequest = jest.fn().mockResolvedValue(undefined);

    jest.doMock(
      '../../../scripts/cover/auto-cover/StealthInitiativeCoverCoordinator.js',
      () => ({ __esModule: true, default: { handleIncomingGMRequest } }),
      { virtual: true },
    );

    const payload = { requestId: 'req-2', hiderTokenId: 'hider-2', hiderName: 'Bram', suggestedState: 'lesser', userId: 'player-2' };
    await stealthInitiativeCoverRequestHandler(payload);

    expect(handleIncomingGMRequest).toHaveBeenCalledWith(payload);
  });

  test('sendStealthInitiativeCoverResponse forwards to the requesting user', () => {
    const executeForUsers = jest.fn();
    const originalSocket = _socketService._socket;
    _socketService._socket = { executeForUsers };

    try {
      sendStealthInitiativeCoverResponse('player-1', { requestId: 'req-1', chosenState: 'greater' });

      expect(executeForUsers).toHaveBeenCalledWith(
        'StealthInitiativeCoverResponse',
        ['player-1'],
        { requestId: 'req-1', chosenState: 'greater' },
      );
    } finally {
      _socketService._socket = originalSocket;
    }
  });

  test('stealthInitiativeCoverResponseHandler delegates to the coordinator', async () => {
    const handleGMResponse = jest.fn();

    jest.doMock(
      '../../../scripts/cover/auto-cover/StealthInitiativeCoverCoordinator.js',
      () => ({ __esModule: true, default: { handleGMResponse } }),
      { virtual: true },
    );

    const payload = { requestId: 'req-3', chosenState: 'standard' };
    await stealthInitiativeCoverResponseHandler(payload);

    expect(handleGMResponse).toHaveBeenCalledWith(payload);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/services/socket-stealth-initiative-cover.test.js`
Expected: FAIL — none of `requestGMStealthInitiativeCover`, `sendStealthInitiativeCoverResponse`, `stealthInitiativeCoverRequestHandler`, `stealthInitiativeCoverResponseHandler` are exported yet.

- [ ] **Step 3: Implement the channels**

In `scripts/services/socket.js`, find:

```js
    this._socket.register(PEEK_REVEAL_REFRESH_CHANNEL, peekRevealRefreshHandler);
    startPeekStalePruner();
```

Replace with:

```js
    this._socket.register(PEEK_REVEAL_REFRESH_CHANNEL, peekRevealRefreshHandler);
    this._socket.register(
      STEALTH_INITIATIVE_COVER_REQUEST_CHANNEL,
      stealthInitiativeCoverRequestHandler,
    );
    this._socket.register(
      STEALTH_INITIATIVE_COVER_RESPONSE_CHANNEL,
      stealthInitiativeCoverResponseHandler,
    );
    startPeekStalePruner();
```

Then find:

```js
const PEEK_REVEAL_REFRESH_CHANNEL = 'PeekRevealRefresh';
```

Replace with:

```js
const PEEK_REVEAL_REFRESH_CHANNEL = 'PeekRevealRefresh';
const STEALTH_INITIATIVE_COVER_REQUEST_CHANNEL = 'StealthInitiativeCoverRequest';
const STEALTH_INITIATIVE_COVER_RESPONSE_CHANNEL = 'StealthInitiativeCoverResponse';
```

Then append at the very end of the file (after the existing `startPeekStalePruner` function's closing `}`):

```js

export function requestGMStealthInitiativeCover(payload) {
  if (!_socketService.socket) return false;
  _socketService.executeAsGM(STEALTH_INITIATIVE_COVER_REQUEST_CHANNEL, payload);
  return true;
}

export async function stealthInitiativeCoverRequestHandler(payload = {}) {
  try {
    if (!game.user?.isGM) return;
    const { default: stealthInitiativeCoverCoordinator } = await import(
      '../cover/auto-cover/StealthInitiativeCoverCoordinator.js'
    );
    await stealthInitiativeCoverCoordinator.handleIncomingGMRequest(payload);
  } catch (error) {
    console.error(`[${MODULE_ID}] Failed to handle stealth-initiative cover request:`, error);
  }
}

export function sendStealthInitiativeCoverResponse(userId, payload) {
  return executeSocketForUser(STEALTH_INITIATIVE_COVER_RESPONSE_CHANNEL, userId, payload);
}

export async function stealthInitiativeCoverResponseHandler(payload = {}) {
  try {
    const { default: stealthInitiativeCoverCoordinator } = await import(
      '../cover/auto-cover/StealthInitiativeCoverCoordinator.js'
    );
    await stealthInitiativeCoverCoordinator.handleGMResponse(payload);
  } catch (error) {
    console.error(`[${MODULE_ID}] Failed to handle stealth-initiative cover response:`, error);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/services/socket-stealth-initiative-cover.test.js`
Expected: PASS

- [ ] **Step 5: Run the full peek/socket suite to check for regressions**

Run: `npx jest tests/unit/services`
Expected: PASS — the two new channel registrations are additive; nothing else in `socket.js` changed.

- [ ] **Step 6: Commit**

```bash
git add scripts/services/socket.js tests/unit/services/socket-stealth-initiative-cover.test.js
git commit -m "feat: add stealth-initiative cover request/response socket channels"
```

---

### Task 4: Create StealthInitiativeCoverCoordinator + i18n keys

**Files:**
- Create: `scripts/cover/auto-cover/StealthInitiativeCoverCoordinator.js`
- Test: `tests/unit/auto-cover/stealth-initiative-cover-coordinator.test.js` (new)
- Modify: `lang/en.json`

**Interfaces:**
- Consumes: `CoverQuickOverrideDialog` from `../QuickOverrideDialog.js` (Task 2's `title`/`confirmLabel` options); `requestGMStealthInitiativeCover`, `sendStealthInitiativeCoverResponse` from `../../services/socket.js` (Task 3).
- Produces (default export singleton `stealthInitiativeCoverCoordinator`, also named export `StealthInitiativeCoverCoordinator`):
  - `resolveCoverState({ hider, suggestedState, manualCoverState })` → `Promise<string>` — the cover state to apply.
  - `handleIncomingGMRequest({ requestId, hiderTokenId, hiderName, suggestedState, userId })` → `Promise<void>` — runs on the GM's client, opens the dialog, sends the response.
  - `handleGMResponse({ requestId, chosenState })` → `boolean` — resolves the matching pending promise on the requesting client.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/auto-cover/stealth-initiative-cover-coordinator.test.js`:

```js
import '../../setup.js';

describe('StealthInitiativeCoverCoordinator', () => {
  let mockDialogInstances;
  let requestGMStealthInitiativeCover;
  let sendStealthInitiativeCoverResponse;
  let coordinator;

  beforeEach(async () => {
    jest.resetModules();
    mockDialogInstances = [];

    jest.doMock('../../../scripts/cover/QuickOverrideDialog.js', () => ({
      __esModule: true,
      CoverQuickOverrideDialog: jest.fn().mockImplementation((initialState, manualCover, options) => {
        const instance = {
          initialState,
          manualCover,
          options,
          _resolver: null,
          setResolver: jest.fn((fn) => {
            instance._resolver = fn;
          }),
          render: jest.fn(),
        };
        mockDialogInstances.push(instance);
        return instance;
      }),
    }));

    requestGMStealthInitiativeCover = jest.fn().mockReturnValue(true);
    sendStealthInitiativeCoverResponse = jest.fn();
    jest.doMock('../../../scripts/services/socket.js', () => ({
      __esModule: true,
      requestGMStealthInitiativeCover,
      sendStealthInitiativeCoverResponse,
    }));

    global.game.user.isGM = true;
    global.foundry.utils.randomID = jest.fn(() => 'request-id-1');

    const mod = await import(
      '../../../scripts/cover/auto-cover/StealthInitiativeCoverCoordinator.js'
    );
    coordinator = mod.default;
  });

  afterEach(() => {
    global.game.user.isGM = true;
  });

  test('returns the manual cover state immediately without opening a dialog', async () => {
    const hider = global.createMockToken({ id: 'hider', name: 'Aria' });

    const result = await coordinator.resolveCoverState({
      hider,
      suggestedState: 'lesser',
      manualCoverState: 'greater',
    });

    expect(result).toBe('greater');
    expect(mockDialogInstances).toHaveLength(0);
    expect(requestGMStealthInitiativeCover).not.toHaveBeenCalled();
  });

  test('opens the dialog locally and resolves with the GM choice when the current client is GM', async () => {
    global.game.user.isGM = true;
    const hider = global.createMockToken({ id: 'hider', name: 'Aria' });

    const promise = coordinator.resolveCoverState({ hider, suggestedState: 'standard' });

    expect(mockDialogInstances).toHaveLength(1);
    mockDialogInstances[0]._resolver('greater');

    const result = await promise;

    expect(result).toBe('greater');
    expect(requestGMStealthInitiativeCover).not.toHaveBeenCalled();
  });

  test('falls back to the suggestion when the GM dialog is dismissed without a choice', async () => {
    global.game.user.isGM = true;
    const hider = global.createMockToken({ id: 'hider', name: 'Aria' });

    const promise = coordinator.resolveCoverState({ hider, suggestedState: 'standard' });
    mockDialogInstances[0]._resolver(null);

    expect(await promise).toBe('standard');
  });

  test('requests the GM over the socket and resolves once the GM responds', async () => {
    global.game.user.isGM = false;
    global.game.userId = 'player-1';
    const hider = global.createMockToken({ id: 'hider', name: 'Aria' });

    const promise = coordinator.resolveCoverState({ hider, suggestedState: 'lesser' });

    expect(requestGMStealthInitiativeCover).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-id-1',
        hiderTokenId: 'hider',
        hiderName: 'Aria',
        suggestedState: 'lesser',
        userId: 'player-1',
      }),
    );

    coordinator.handleGMResponse({ requestId: 'request-id-1', chosenState: 'standard' });

    expect(await promise).toBe('standard');
  });

  test('falls back to the suggestion when the socket request cannot be sent', async () => {
    global.game.user.isGM = false;
    requestGMStealthInitiativeCover.mockReturnValue(false);
    const hider = global.createMockToken({ id: 'hider', name: 'Aria' });

    const result = await coordinator.resolveCoverState({ hider, suggestedState: 'lesser' });

    expect(result).toBe('lesser');
  });

  test('falls back to the suggestion when the GM never responds before the timeout', async () => {
    jest.useFakeTimers();
    global.game.user.isGM = false;
    const hider = global.createMockToken({ id: 'hider', name: 'Aria' });

    const promise = coordinator.resolveCoverState({ hider, suggestedState: 'lesser' });
    jest.advanceTimersByTime(30000);

    expect(await promise).toBe('lesser');
    jest.useRealTimers();
  });

  test('handleIncomingGMRequest opens the dialog and sends the response back to the requesting user', async () => {
    global.game.user.isGM = true;

    const handled = coordinator.handleIncomingGMRequest({
      requestId: 'req-9',
      hiderTokenId: 'hider-9',
      hiderName: 'Bram',
      suggestedState: 'lesser',
      userId: 'player-9',
    });

    expect(mockDialogInstances).toHaveLength(1);
    mockDialogInstances[0]._resolver('greater');
    await handled;

    expect(sendStealthInitiativeCoverResponse).toHaveBeenCalledWith('player-9', {
      requestId: 'req-9',
      chosenState: 'greater',
    });
  });

  test('handleIncomingGMRequest does nothing when the current client is not GM', async () => {
    global.game.user.isGM = false;

    await coordinator.handleIncomingGMRequest({
      requestId: 'req-10',
      hiderTokenId: 'hider-10',
      hiderName: 'Bram',
      suggestedState: 'lesser',
      userId: 'player-10',
    });

    expect(mockDialogInstances).toHaveLength(0);
    expect(sendStealthInitiativeCoverResponse).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/auto-cover/stealth-initiative-cover-coordinator.test.js`
Expected: FAIL with a module-not-found error — `scripts/cover/auto-cover/StealthInitiativeCoverCoordinator.js` doesn't exist yet.

- [ ] **Step 3: Implement the coordinator**

Create `scripts/cover/auto-cover/StealthInitiativeCoverCoordinator.js`:

```js
import { CoverQuickOverrideDialog } from '../QuickOverrideDialog.js';
import {
  requestGMStealthInitiativeCover,
  sendStealthInitiativeCoverResponse,
} from '../../services/socket.js';

const GM_RESPONSE_TIMEOUT_MS = 30000;

class StealthInitiativeCoverCoordinator {
  constructor() {
    this._pending = new Map();
  }

  async resolveCoverState({ hider, suggestedState, manualCoverState = 'none' }) {
    if (manualCoverState && manualCoverState !== 'none') return manualCoverState;

    if (game.user?.isGM) {
      return this._openCoverDialog(hider?.name ?? '', suggestedState);
    }

    return this._requestFromGM(hider, suggestedState);
  }

  async _openCoverDialog(hiderName, suggestedState) {
    try {
      const title =
        game.i18n
          ?.localize?.('PF2E_VISIONER.DIALOG_TITLES.STEALTH_INITIATIVE_COVER')
          ?.replace?.('{NAME}', hiderName) ?? `Set Cover — ${hiderName}'s Stealth Roll`;
      const confirmLabel = game.i18n?.localize?.('PF2E_VISIONER.UI.CONFIRM') ?? 'Confirm';

      const chosen = await new Promise((resolve) => {
        const app = new CoverQuickOverrideDialog(suggestedState, 'none', {
          isStealthContext: true,
          title,
          confirmLabel,
        });
        app.setResolver(resolve);
        app.render(true);
      });

      return chosen ?? suggestedState;
    } catch (e) {
      console.warn('PF2E Visioner | Failed to open stealth-initiative cover dialog:', e);
      return suggestedState;
    }
  }

  _requestFromGM(hider, suggestedState) {
    return new Promise((resolve) => {
      const requestId = foundry?.utils?.randomID?.() ?? `${Date.now()}-${Math.random()}`;

      const timeoutHandle = setTimeout(() => {
        this._pending.delete(requestId);
        resolve(suggestedState);
      }, GM_RESPONSE_TIMEOUT_MS);

      this._pending.set(requestId, { resolve, timeoutHandle });

      const sent = requestGMStealthInitiativeCover({
        requestId,
        hiderTokenId: hider?.document?.id ?? hider?.id ?? null,
        hiderName: hider?.name ?? '',
        suggestedState,
        userId: game.userId,
      });

      if (!sent) {
        clearTimeout(timeoutHandle);
        this._pending.delete(requestId);
        resolve(suggestedState);
        return;
      }

      try {
        const waitingMsg =
          game.i18n?.localize?.('PF2E_VISIONER.UI.STEALTH_INITIATIVE_COVER_WAITING') ??
          'Waiting for GM to set cover…';
        ui.notifications?.info?.(waitingMsg);
      } catch (_) { }
    });
  }

  async handleIncomingGMRequest({ requestId, hiderTokenId, hiderName, suggestedState, userId } = {}) {
    if (!game.user?.isGM || !requestId) return;

    const chosenState = await this._openCoverDialog(
      hiderName || canvas?.tokens?.get?.(hiderTokenId)?.name || '',
      suggestedState,
    );

    sendStealthInitiativeCoverResponse(userId, { requestId, chosenState });
  }

  handleGMResponse({ requestId, chosenState } = {}) {
    const pending = this._pending.get(requestId);
    if (!pending) return false;

    clearTimeout(pending.timeoutHandle);
    this._pending.delete(requestId);
    pending.resolve(chosenState);
    return true;
  }
}

const stealthInitiativeCoverCoordinator = new StealthInitiativeCoverCoordinator();
export default stealthInitiativeCoverCoordinator;
export { StealthInitiativeCoverCoordinator };
```

- [ ] **Step 4: Add the i18n keys**

In `lang/en.json`, find:

```json
      "COVER_OVERRIDE": "Cover Override",
      "WALL_SETTINGS": "PF2E Visioner: Wall Settings",
```

Replace with:

```json
      "COVER_OVERRIDE": "Cover Override",
      "STEALTH_INITIATIVE_COVER": "Set Cover — {NAME}'s Stealth Roll",
      "WALL_SETTINGS": "PF2E Visioner: Wall Settings",
```

Then find:

```json
      "ROLL": "Roll",
      "APPLY_ALL": "Apply All",
```

Replace with:

```json
      "ROLL": "Roll",
      "CONFIRM": "Confirm",
      "STEALTH_INITIATIVE_COVER_WAITING": "Waiting for GM to set cover…",
      "APPLY_ALL": "Apply All",
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/unit/auto-cover/stealth-initiative-cover-coordinator.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/cover/auto-cover/StealthInitiativeCoverCoordinator.js tests/unit/auto-cover/stealth-initiative-cover-coordinator.test.js lang/en.json
git commit -m "feat: add StealthInitiativeCoverCoordinator for GM-driven cover decisions"
```

---

### Task 5: Wire the coordinator into StealthCheckUseCase

**Files:**
- Modify: `scripts/cover/auto-cover/usecases/StealthCheckUseCase.js`
- Modify: `tests/unit/auto-cover/usecases/stealth-check-use-case.test.js`

**Interfaces:**
- Consumes: `stealthInitiativeCoverCoordinator.resolveCoverState({ hider, suggestedState, manualCoverState })` (Task 4).
- Produces: `StealthCheckUseCase.handleCheckDialog` no longer injects cover-override buttons when `dialog.context.type === 'initiative'`; `StealthCheckUseCase.handleCheckRoll` applies whatever cover state the coordinator resolves to (instead of the old keybind-popup flow) as the `pf2e-visioner-cover` modifier.

- [ ] **Step 1: Update the shared test mocks (prevents every `handleCheckRoll` test from hanging on a real dialog)**

In `tests/unit/auto-cover/usecases/stealth-check-use-case.test.js`, find:

```js
    jest.doMock('../../../../scripts/chat/services/actions/SneakAction.js', () => ({
      SneakActionHandler: jest.fn().mockImplementation(() => ({
        _captureStartPositions: jest.fn().mockResolvedValue(undefined),
      })),
    }));
```

Replace with:

```js
    jest.doMock('../../../../scripts/chat/services/actions/SneakAction.js', () => ({
      SneakActionHandler: jest.fn().mockImplementation(() => ({
        _captureStartPositions: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    jest.doMock(
      '../../../../scripts/cover/auto-cover/StealthInitiativeCoverCoordinator.js',
      () => ({
        __esModule: true,
        default: {
          resolveCoverState: jest.fn().mockImplementation(async ({ suggestedState }) => suggestedState),
        },
      }),
    );
```

- [ ] **Step 2: Rewrite the one test that encodes the old player-dialog-applies-cover behavior**

In the same file, find (the entire test, inside `describe('handleCheckDialog - cover direction', ...)`):

```js
    test('should apply selected cover modifier to the dialog check before rolling', async () => {
      const hiderToken = mockToken({ id: 'hider', isOwner: true, x: 0, y: 0, alliance: 'party' });
      const observerToken = mockToken({ id: 'observer', x: 10, y: 10, name: 'Observer', alliance: 'opposition' });

      mockCoverUIManager.injectDialogCoverUI.mockImplementation(
        async (dialog, html, state, target, manualCover, onChosen) => {
          await onChosen({
            chosen: 'greater',
            dialog,
            dctx: dialog.context,
            subject: hiderToken,
            target: observerToken,
            targetActor: observerToken.actor,
            originalState: state,
            rollId: 'initiative-stealth-roll',
          });
        },
      );

      const mockDialog = {
        context: {
          type: 'initiative',
          options: ['stealth-check', 'check:statistic:base:stealth'],
          actor: { getActiveTokens: () => [hiderToken] },
        },
        check: { modifiers: [], push: jest.fn(), calculateTotal: jest.fn() },
        _pvCoverOverride: undefined,
        render: jest.fn(),
        setPosition: jest.fn(),
      };

      global.canvas.tokens.placeables = [hiderToken, observerToken];
      stealthCheckUseCase._detectCover = jest.fn().mockReturnValue('greater');

      await stealthCheckUseCase.handleCheckDialog(mockDialog, {
        find: jest.fn().mockReturnValue({ length: 0, before: jest.fn() }),
      });

      expect(mockDialog.check.push).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'pf2e-visioner-cover',
          modifier: 4,
          type: 'circumstance',
          enabled: true,
        }),
      );
      expect(mockDialog.check.calculateTotal).toHaveBeenCalled();
      expect(mockDialog.render).not.toHaveBeenCalled();
    });
```

Replace with:

```js
    test('does not inject cover-override buttons into the roll dialog for stealth-initiative checks', async () => {
      const hiderToken = mockToken({ id: 'hider', isOwner: true, x: 0, y: 0, alliance: 'party' });
      const observerToken = mockToken({ id: 'observer', x: 10, y: 10, name: 'Observer', alliance: 'opposition' });

      const mockDialog = {
        context: {
          type: 'initiative',
          options: ['stealth-check', 'check:statistic:base:stealth'],
          actor: { getActiveTokens: () => [hiderToken] },
        },
        check: { modifiers: [], push: jest.fn(), calculateTotal: jest.fn() },
        _pvCoverOverride: undefined,
        render: jest.fn(),
        setPosition: jest.fn(),
      };

      global.canvas.tokens.placeables = [hiderToken, observerToken];
      stealthCheckUseCase._detectCover = jest.fn().mockReturnValue('greater');

      await stealthCheckUseCase.handleCheckDialog(mockDialog, {
        find: jest.fn().mockReturnValue({ length: 0, before: jest.fn() }),
      });

      expect(mockCoverUIManager.injectDialogCoverUI).not.toHaveBeenCalled();
      expect(mockDialog.check.push).not.toHaveBeenCalled();
    });
```

- [ ] **Step 3: Add new `handleCheckRoll` tests for the coordinator hand-off**

In the same file, inside `describe('handleCheckRoll - cover direction', ...)`, add after its last existing test (before the describe block's closing `});`):

```js
    test('applies whatever cover state the stealth-initiative coordinator resolves to', async () => {
      const { default: stealthInitiativeCoverCoordinator } = await import(
        '../../../../scripts/cover/auto-cover/StealthInitiativeCoverCoordinator.js'
      );
      stealthInitiativeCoverCoordinator.resolveCoverState.mockResolvedValueOnce('greater');

      const hiderToken = mockToken({ id: 'hider', isOwner: true, x: 0, y: 0, name: 'Hider', alliance: 'party' });
      const observerToken = mockToken({ id: 'observer', x: 10, y: 10, name: 'Observer', alliance: 'opposition' });

      const mockCheck = { modifiers: [], push: jest.fn() };
      const mockContext = {
        type: 'initiative',
        actor: { getActiveTokens: () => [hiderToken] },
        options: ['stealth-check', 'check:statistic:base:stealth'],
      };

      global.canvas.tokens.placeables = [hiderToken, observerToken];
      stealthCheckUseCase._detectCover = jest.fn().mockReturnValue('none');

      await stealthCheckUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(mockCheck.push).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'pf2e-visioner-cover', modifier: 4 }),
      );
    });

    test('passes the highest manual cover to the coordinator so it can short-circuit the GM dialog', async () => {
      const { default: stealthInitiativeCoverCoordinator } = await import(
        '../../../../scripts/cover/auto-cover/StealthInitiativeCoverCoordinator.js'
      );

      const hiderToken = mockToken({ id: 'hider', isOwner: true, x: 0, y: 0, name: 'Hider', alliance: 'party' });
      const observerToken = mockToken({ id: 'observer', x: 10, y: 10, name: 'Observer', alliance: 'opposition' });

      const mockCheck = { modifiers: [], push: jest.fn() };
      const mockContext = {
        type: 'initiative',
        actor: { getActiveTokens: () => [hiderToken] },
        options: ['stealth-check', 'check:statistic:base:stealth'],
      };

      global.canvas.tokens.placeables = [hiderToken, observerToken];
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('lesser');
      stealthCheckUseCase._detectCover = jest.fn().mockReturnValue('none');

      await stealthCheckUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(stealthInitiativeCoverCoordinator.resolveCoverState).toHaveBeenCalledWith(
        expect.objectContaining({ manualCoverState: 'lesser' }),
      );
    });
```

- [ ] **Step 4: Run the test file to verify these fail (except the untouched pre-existing ones)**

Run: `npx jest tests/unit/auto-cover/usecases/stealth-check-use-case.test.js`
Expected: FAIL — `handleCheckDialog` still injects buttons for `type: 'initiative'` (new test fails), and `handleCheckRoll` doesn't call the coordinator yet (two new tests fail; `mockCheck.push` isn't invoked with the coordinator's resolved bonus).

- [ ] **Step 5: Wire the coordinator into `StealthCheckUseCase.js`**

In `scripts/cover/auto-cover/usecases/StealthCheckUseCase.js`, find:

```js
import { COVER_STATES } from '../../../constants.js';
import { getCoverLabel, getCoverStealthBonusByState } from '../../../helpers/cover-helpers.js';
import { CoverModifierService } from '../../../services/CoverModifierService.js';
import { getCoverBetween } from '../../../utils.js';
import autoCoverSystem from '../AutoCoverSystem.js';
import { BaseAutoCoverUseCase } from './BaseUseCase.js';
```

Replace with:

```js
import { COVER_STATES } from '../../../constants.js';
import { getCoverLabel, getCoverStealthBonusByState } from '../../../helpers/cover-helpers.js';
import { CoverModifierService } from '../../../services/CoverModifierService.js';
import { getCoverBetween } from '../../../utils.js';
import autoCoverSystem from '../AutoCoverSystem.js';
import stealthInitiativeCoverCoordinator from '../StealthInitiativeCoverCoordinator.js';
import { BaseAutoCoverUseCase } from './BaseUseCase.js';
```

Then find:

```js
  constructor() {
    super();
    // Use the singleton auto-cover system directly
    this.autoCoverSystem = autoCoverSystem;
    // Use the singleton cover modifier service
    this.coverModifierService = CoverModifierService.getInstance();
  }
```

Replace with:

```js
  constructor() {
    super();
    // Use the singleton auto-cover system directly
    this.autoCoverSystem = autoCoverSystem;
    // Use the singleton cover modifier service
    this.coverModifierService = CoverModifierService.getInstance();
    this.stealthInitiativeCoverCoordinator = stealthInitiativeCoverCoordinator;
  }
```

Then find (inside `handleCheckDialog`):

```js
      const analyzedHider = hider;
      const rollOverrideObservers = collectStealthObservers(hider, { mode: 'all-actors' });

      // Inject cover override UI, using a callback to apply stealth-specific behavior on chosen state
      try {
        await this.coverUIManager.injectDialogCoverUI(
```

Replace with:

```js
      const analyzedHider = hider;
      const rollOverrideObservers = collectStealthObservers(hider, { mode: 'all-actors' });

      if (ctx?.type === 'initiative') {
        return;
      }

      // Inject cover override UI, using a callback to apply stealth-specific behavior on chosen state
      try {
        await this.coverUIManager.injectDialogCoverUI(
```

Then find the entire block inside `handleCheckRoll` starting at the second `try {` after `if (hider && (hider.isOwner || game.user.isGM)) {` through its matching `catch (e) { console.warn('PF2E Visioner | ⚠️ Stealth cover handling failed', e); }`:

```js
          try {
            // Check for a manual override set by the Check Modifiers dialog
            let state = null;
            let isOverride = false;
            try {
              const stealthDialog = Object.values(ui.windows).find(
                (w) => w?.constructor?.name === 'CheckModifiersDialog',
              );
              if (stealthDialog?._pvCoverOverride) {
                state = stealthDialog._pvCoverOverride;
                isOverride = true;
              }
            } catch (_) { }

            // If not overridden, evaluate cover against all other tokens and pick the best (highest stealth bonus)
            let observers = [];
            let highestFoundManualCover = 'none';
            if (!state) {
              try {
                const analysis = analyzeStealthObserverCover({
                  hider,
                  observerMode: 'non-party',
                  detectCover: (observer, subject) => this._detectCover(observer, subject),
                });
                observers = analysis.observers;
                highestFoundManualCover = analysis.highestFoundManualCover;
                state = analysis.detectedState;
              } catch (_) { }
            } else {
              observers = collectStealthObservers(hider, { mode: 'non-party' });
            }

            // Store the original state before any popup changes
            const originalDetectedState = state;
            const originalBonus = Number(COVER_STATES?.[originalDetectedState]?.bonusStealth ?? 0);

            try {
              const popupResult = await this.coverUIManager.showPopupAndApply(state);
              const { chosen, rollId } = popupResult || {};
              if (chosen) {
                context._visionerRollId = rollId;
                const finalState =
                  highestFoundManualCover !== 'none' ? highestFoundManualCover : chosen;

                // Determine if this was an override
                const wasOverridden = finalState !== originalDetectedState;
                const finalBonus = Number(COVER_STATES?.[finalState]?.bonusStealth ?? 0);

                if (rollId) {
                  const modifierData = {
                    originalState: originalDetectedState,
                    originalBonus: originalBonus,
                    finalState: chosen,
                    finalBonus: finalBonus,
                    isOverride: wasOverridden,
                    source: wasOverridden ? 'popup-override' : 'automatic',
                    timestamp: Date.now(),
                  };

                  this.coverModifierService.setOriginalCoverModifier(rollId, modifierData);

                  // Note: Clean up of old entries removed - could be moved to the service if needed
                }

                // Now update the state to the chosen value
                state = highestFoundManualCover !== 'none' ? highestFoundManualCover : chosen;
                // Only store as override if it actually changed
                if (state !== originalDetectedState) {
                  // Store a roll-specific override so it won't leak into later dialogs
                  for (const obs of observers) {
                    this.autoCoverSystem.setRollOverride(
                      hider,
                      obs,
                      rollId,
                      originalDetectedState,
                      state,
                    );
                  }
                  isOverride = true;
                }
              }
            } catch (e) {
              console.warn('PF2E Visioner | Popup error (delegated):', e);
            }

            const bonus = Number(COVER_STATES?.[state]?.bonusStealth ?? 0);

            try {
              context._visionerStealth = {
                state,
                bonus,
                isOverride,
                rollId: context?._visionerRollId,
                source: isOverride ? 'override' : 'automatic',
              };
            } catch (_) { }
          } catch (e) {
            console.warn('PF2E Visioner | ⚠️ Stealth cover handling failed', e);
          }
```

Replace with:

```js
          try {
            let state = null;
            let observers = [];
            let highestFoundManualCover = 'none';
            try {
              const analysis = analyzeStealthObserverCover({
                hider,
                observerMode: 'non-party',
                detectCover: (observer, subject) => this._detectCover(observer, subject),
              });
              observers = analysis.observers;
              highestFoundManualCover = analysis.highestFoundManualCover;
              state = analysis.detectedState;
            } catch (_) { }

            const originalDetectedState = state;
            const originalBonus = Number(COVER_STATES?.[originalDetectedState]?.bonusStealth ?? 0);
            const rollId = foundry?.utils?.randomID?.();
            context._visionerRollId = rollId;

            let isOverride = false;
            try {
              state = await this.stealthInitiativeCoverCoordinator.resolveCoverState({
                hider,
                suggestedState: originalDetectedState,
                manualCoverState: highestFoundManualCover,
              });

              const wasOverridden = state !== originalDetectedState;
              const finalBonus = Number(COVER_STATES?.[state]?.bonusStealth ?? 0);

              const modifierData = {
                originalState: originalDetectedState,
                originalBonus: originalBonus,
                finalState: state,
                finalBonus: finalBonus,
                isOverride: wasOverridden,
                source: wasOverridden ? 'gm-cover-dialog' : 'automatic',
                timestamp: Date.now(),
              };

              this.coverModifierService.setOriginalCoverModifier(rollId, modifierData);

              if (wasOverridden) {
                for (const obs of observers) {
                  this.autoCoverSystem.setRollOverride(
                    hider,
                    obs,
                    rollId,
                    originalDetectedState,
                    state,
                  );
                }
                isOverride = true;
              }
            } catch (e) {
              console.warn('PF2E Visioner | Stealth-initiative cover resolution failed:', e);
            }

            const bonus = Number(COVER_STATES?.[state]?.bonusStealth ?? 0);

            try {
              context._visionerStealth = {
                state,
                bonus,
                isOverride,
                rollId: context?._visionerRollId,
                source: isOverride ? 'override' : 'automatic',
              };
            } catch (_) { }
          } catch (e) {
            console.warn('PF2E Visioner | ⚠️ Stealth cover handling failed', e);
          }
```

- [ ] **Step 6: Run the test file to verify everything passes**

Run: `npx jest tests/unit/auto-cover/usecases/stealth-check-use-case.test.js`
Expected: PASS — all pre-existing tests (direction/alliance/Hide-gating checks) plus the rewritten dialog test and the two new coordinator-hand-off tests.

- [ ] **Step 7: Run the full test suite to check for regressions**

Run: `npx jest`
Expected: PASS. In particular, confirm `tests/unit/auto-cover/auto-cover-hooks-stealth-context.test.js` and `tests/unit/cover/sniping-duo-check-dialog-blocks-cover-override.test.js` are untouched and still pass — they exercise `CoverUIManager.injectDialogCoverUI` and `AutoCoverHooks._getUseCaseForContext` directly, neither of which this task modifies.

- [ ] **Step 8: Commit**

```bash
git add scripts/cover/auto-cover/usecases/StealthCheckUseCase.js tests/unit/auto-cover/usecases/stealth-check-use-case.test.js
git commit -m "feat: let StealthInitiativeCoverCoordinator decide stealth-initiative cover bonus"
```

---

## Self-Review Notes

- **Spec coverage:** bug fix → Task 1. GM dialog + blocking round trip → Tasks 3–5. Reused cover-button styling → Task 2 (extends the existing `CoverQuickOverrideDialog` rather than a new component). i18n → Task 4. Removing player-side dialog buttons for initiative → Task 5. Test plan from the spec's Testing section → one task each (1, 2, 3, 4) plus the integration wiring in Task 5.
- **Placeholder scan:** none found — every step has literal code, exact file paths, and runnable commands.
- **Type consistency:** `resolveCoverState({ hider, suggestedState, manualCoverState })` is defined once in Task 4 and consumed with the exact same shape in Task 5; `handleIncomingGMRequest`/`handleGMResponse` payload shapes match between the socket handlers (Task 3), the coordinator (Task 4), and their tests.
