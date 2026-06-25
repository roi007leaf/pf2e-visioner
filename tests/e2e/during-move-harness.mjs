/**
 * During-move E2E harness (in-page).
 *
 * The during-move render engine is pure Foundry/PIXI runtime — it cannot be
 * unit-tested. This harness drives a LIVE Foundry world and asserts the core
 * invariant the engine (old PendingMovement or a future freeze+settle rewrite)
 * must uphold:
 *
 *   The rendered state of every target (visible / soundwave / hidden) matches
 *   the AVS-resolved visibility state, both while a controlled observer is
 *   moving and after it settles — with no transient "flash" of a third state.
 *
 * It is engine-agnostic on purpose: it compares the OBSERVABLE render outcome
 * against an independent oracle derived from PF2e visibility semantics, so it
 * stays valid across a render-pipeline rewrite and serves as its gate.
 *
 * Usage (in the Foundry console of a GM session, or via Playwright MCP):
 *   const { runDuringMoveTruthTable } =
 *     await import('/modules/pf2e-visioner/tests/e2e/during-move-harness.mjs');
 *   await runDuringMoveTruthTable();                  // all default scenarios
 *   await runDuringMoveTruthTable({ scenarios: [...] }); // custom
 *
 * It mutates token positions and control during the run and restores them after.
 */

const MODULE_ID = 'pf2e-visioner';

const VISIBLE_STATES = new Set(['observed', 'concealed']);
const HIDDEN_RENDER_STATES = new Set(['undetected', 'unnoticed']);
const HARD_HIDDEN_ACTOR_TYPES = new Set(['hazard', 'loot', 'vehicle']);

// A target whose render state changes across a move must reach its final state
// within this budget (move animation + one AVS recompute). The reveal-latency
// bug this harness gates against showed ~4.3s; a correct engine settles ~<1.5s.
const REVEAL_BUDGET_MS = 1500;

function api() {
  return game.modules.get(MODULE_ID)?.api ?? null;
}

function tokenById(id) {
  return canvas?.tokens?.get?.(id) ?? null;
}

function actorTypeOf(token) {
  return String(token?.actor?.type ?? '').toLowerCase();
}

/**
 * Objects (hazard/loot/vehicle) have bespoke discovery semantics — a mapped
 * `observed` state does not mean "render the body". They are judged only by the
 * firm contract rule: they must NEVER render a soundwave ring (see
 * during-move-contract-decided special case #1). Creatures get the full
 * state==render invariant.
 */
export function isObjectActor(token) {
  return HARD_HIDDEN_ACTOR_TYPES.has(actorTypeOf(token));
}

/**
 * Oracle: the render mode a target SHOULD have for a given AVS visibility state,
 * independent of the engine implementation. Mirrors PF2e visioner semantics:
 *  - observed / concealed        -> 'visible'
 *  - hidden, hazard/loot/vehicle -> 'hidden'   (hard-hide, never a soundwave)
 *  - hidden, creature            -> 'soundwave' (you sense it, can't see it)
 *  - undetected / unnoticed      -> 'hidden'
 */
export function expectedRenderForState(state, token) {
  if (VISIBLE_STATES.has(state)) return 'visible';
  if (HIDDEN_RENDER_STATES.has(state)) return 'hidden';
  if (state === 'hidden') {
    return HARD_HIDDEN_ACTOR_TYPES.has(actorTypeOf(token)) ? 'hidden' : 'soundwave';
  }
  return 'visible';
}

/**
 * Sample the ACTUAL render mode of a token from its PIXI state.
 * soundwave takes precedence (detection filter present) over plain visibility.
 */
export function sampleTokenRender(token) {
  if (!token) return 'absent';
  const mesh = token.mesh;
  const meshShown = !!mesh && mesh.visible !== false && Number(mesh.alpha) > 0;
  const hasNativeFilter = !!token.detectionFilter;
  const filterMesh = token.detectionFilterMesh;
  const filterMeshShown =
    !!filterMesh && filterMesh.visible !== false && Number(filterMesh.alpha) > 0;
  if (hasNativeFilter || filterMeshShown) return 'soundwave';
  if (meshShown) return 'visible';
  return 'hidden';
}

function storedVisibility(observerId, targetId) {
  try {
    return api()?.getVisibility?.(observerId, targetId) ?? 'observed';
  } catch {
    return 'observed';
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isControlledOrSelf(token, observerId) {
  return !!token?.controlled || token?.document?.id === observerId;
}

/**
 * Tokens whose render we evaluate against the observer during a scenario:
 * every non-controlled, non-observer placeable that has an actor.
 */
function evaluableTargets(observerId) {
  return (canvas?.tokens?.placeables ?? []).filter(
    (t) => t?.actor && !isControlledOrSelf(t, observerId) && !t.document?.hidden,
  );
}

async function captureSettledState(observerId) {
  const map = new Map();
  for (const target of evaluableTargets(observerId)) {
    map.set(target.document.id, {
      pos: { x: target.document.x, y: target.document.y },
    });
  }
  return map;
}

/**
 * Capture pre-action AVS state + render, run an async action while sampling each
 * target's render every `sampleEveryMs` for `durationMs`, and return the raw data.
 */
async function measureRenderDuringAction(observerId, targetIds, action, { sampleEveryMs, durationMs }) {
  const preState = new Map();
  const preRender = new Map();
  const samples = new Map();
  for (const id of targetIds) {
    preState.set(id, storedVisibility(observerId, id));
    preRender.set(id, sampleTokenRender(tokenById(id)));
    samples.set(id, []);
  }
  const t0 = performance.now();
  const actionPromise = Promise.resolve().then(() => action());
  for (let elapsed = 0; elapsed < durationMs; elapsed += sampleEveryMs) {
    const ms = Math.round(performance.now() - t0);
    for (const id of targetIds) samples.get(id).push({ ms, render: sampleTokenRender(tokenById(id)) });
    await sleep(sampleEveryMs);
  }
  await actionPromise.catch(() => undefined);
  return { preState, preRender, samples };
}

/**
 * Judge one target against the invariant. `expectedOverride` (e.g. 'visible' for
 * a select-all bypass) forces the expected render regardless of AVS state.
 */
function judgeTarget(observerId, id, { preState, preRender, samples, expectedOverride = null }) {
  const target = tokenById(id);
  const postState = storedVisibility(observerId, id);
  const isObject = isObjectActor(target);
  const expectedFinal = expectedOverride ?? expectedRenderForState(postState, target);
  const expectedPre = expectedOverride ?? expectedRenderForState(preState.get(id), target);
  const frames = samples.get(id) ?? [];
  const finalRender = frames.length ? frames[frames.length - 1].render : 'absent';

  // flash = a frame whose render is NEITHER the actual pre-action render NOR the
  // expected final render (a transient third state = perceived flicker).
  const allowed = new Set([preRender.get(id), expectedFinal]);
  const flashFrames = frames.filter((f) => !allowed.has(f.render));

  // settle latency: first frame at the final expected render that then sticks.
  let settledAtMs = null;
  for (let i = 0; i < frames.length; i += 1) {
    if (frames[i].render === expectedFinal && frames.slice(i).every((f) => f.render === expectedFinal)) {
      settledAtMs = frames[i].ms;
      break;
    }
  }

  let toggles = 0;
  for (let i = 1; i < frames.length; i += 1) {
    if (frames[i].render !== frames[i - 1].render) toggles += 1;
  }

  const objectSoundwaveFrames = isObject ? frames.filter((f) => f.render === 'soundwave') : [];
  const changedState = expectedPre !== expectedFinal;
  const slowReveal =
    !isObject && changedState && (settledAtMs == null || settledAtMs > REVEAL_BUDGET_MS);
  const pass = isObject
    ? objectSoundwaveFrames.length === 0
    : finalRender === expectedFinal && flashFrames.length === 0 && !slowReveal;

  return {
    target: target?.document?.name ?? id,
    id,
    kind: isObject ? 'object' : 'creature',
    preState: preState.get(id),
    postState,
    expectedFinal: isObject ? 'no-soundwave' : expectedFinal,
    finalRender,
    settledAtMs,
    slowReveal: !!slowReveal,
    toggles,
    flashFrames: (isObject ? objectSoundwaveFrames : flashFrames).slice(0, 8).map((f) => `${f.ms}:${f.render}`),
    pass,
  };
}

/**
 * Run one scenario and judge the invariant. Scenario `type`:
 *   'observer-move' (default): control observer, animate it from->to, judge all targets.
 *   'target-move': stationary observer at observerAt, animate targetId from->to, judge it.
 *   'control': control observer at setupAt, then perform `control` ('deselect-all'|'select-all'),
 *              judge all targets (select-all expects all visible via the bypass).
 *   'no-move': control observer at `at`, no action — judge static render==state.
 */
export async function runScenario(scenario) {
  const {
    name,
    observerId,
    type = 'observer-move',
    settleBeforeMs = 2500,
    sampleEveryMs = 50,
    settleAfterMs = 4000,
  } = scenario;

  const observer = tokenById(observerId);
  if (!observer) return { name, type, error: `observer ${observerId} not found` };

  let action = () => undefined;
  let targetIds = [];
  let expectedOverride = null;
  const meta = { type };

  if (type === 'observer-move') {
    await observer.document.update({ x: scenario.from.x, y: scenario.from.y }, { animate: false });
    await sleep(settleBeforeMs);
    observer.control({ releaseOthers: true });
    await sleep(600);
    targetIds = evaluableTargets(observerId).map((t) => t.document.id);
    action = () => observer.document.update({ x: scenario.to.x, y: scenario.to.y }, { animate: true });
    meta.from = scenario.from;
    meta.to = scenario.to;
  } else if (type === 'target-move') {
    const mover = tokenById(scenario.targetId);
    if (!mover) return { name, type, error: `target ${scenario.targetId} not found` };
    if (scenario.observerAt) {
      await observer.document.update({ x: scenario.observerAt.x, y: scenario.observerAt.y }, { animate: false });
    }
    await mover.document.update({ x: scenario.from.x, y: scenario.from.y }, { animate: false });
    await sleep(settleBeforeMs);
    observer.control({ releaseOthers: true });
    await sleep(600);
    targetIds = [scenario.targetId];
    action = () => mover.document.update({ x: scenario.to.x, y: scenario.to.y }, { animate: true });
    meta.targetId = scenario.targetId;
    meta.from = scenario.from;
    meta.to = scenario.to;
  } else if (type === 'control') {
    if (scenario.setupAt) {
      await observer.document.update({ x: scenario.setupAt.x, y: scenario.setupAt.y }, { animate: false });
    }
    await sleep(settleBeforeMs);
    observer.control({ releaseOthers: true });
    await sleep(600);
    targetIds = evaluableTargets(observerId).map((t) => t.document.id);
    // Both control actions show every token: ctrl+A engages the select-all
    // visibility bypass; deselect-all gives a GM omniscient view. (Non-GM
    // deselect keeps the owned token's perspective — run from a player session
    // and drop this override to test that variant.)
    expectedOverride = 'visible';
    if (scenario.control === 'select-all') {
      action = () => {
        for (const t of canvas.tokens.placeables) t.control({ releaseOthers: false });
      };
    } else {
      action = () => canvas.tokens.releaseAll();
    }
    meta.control = scenario.control;
  } else if (type === 'no-move') {
    if (scenario.at) await observer.document.update({ x: scenario.at.x, y: scenario.at.y }, { animate: false });
    await sleep(settleBeforeMs);
    observer.control({ releaseOthers: true });
    await sleep(600);
    targetIds = evaluableTargets(observerId).map((t) => t.document.id);
    meta.at = scenario.at;
  }

  const measured = await measureRenderDuringAction(observerId, targetIds, action, {
    sampleEveryMs,
    durationMs: settleAfterMs,
  });
  const results = targetIds.map((id) => judgeTarget(observerId, id, { ...measured, expectedOverride }));
  return { name, observerId, ...meta, results };
}

/**
 * Default scenario set against the current live scene (Lyra observer). Covers:
 * observer-move (reveal/soundwave/hide transitions), a static no-move baseline,
 * and the deselect-all / select-all (ctrl+A bypass) control cases.
 *
 * Truth-table cases that need bespoke geometry/state on THIS scene are provided
 * as ready-to-fill shapes in `templateScenarios()` — add coordinates/targets and
 * append to this list:
 *   - target-move behind-wall (moving-target flash; see during-move-e2e-goal UPDATE 3)
 *   - invisible-condition target (no LOS reveal)
 *   - foundry-hidden token, non-GM observer (requires a player session)
 *   - multi-observer precedence (visible > soundwave > hidden)
 */
export function defaultScenarios() {
  const LYRA = 'VqxGiSb0zfGLfM8f';
  return [
    {
      name: 'lyra-corner-poke-right-to-left',
      observerId: LYRA,
      from: { x: 3200, y: 4000 },
      to: { x: 2600, y: 4000 },
    },
    {
      name: 'lyra-corner-poke-left-to-right',
      observerId: LYRA,
      from: { x: 2600, y: 4000 },
      to: { x: 3200, y: 4000 },
    },
    {
      name: 'lyra-advance-up',
      observerId: LYRA,
      from: { x: 3200, y: 4000 },
      to: { x: 3200, y: 3000 },
    },
    {
      name: 'lyra-no-move-baseline',
      type: 'no-move',
      observerId: LYRA,
      at: { x: 2600, y: 4000 },
      settleAfterMs: 1500,
    },
    {
      name: 'lyra-deselect-all',
      type: 'control',
      control: 'deselect-all',
      observerId: LYRA,
      setupAt: { x: 2600, y: 4000 },
      settleAfterMs: 2000,
    },
    {
      name: 'lyra-select-all-ctrlA',
      type: 'control',
      control: 'select-all',
      observerId: LYRA,
      setupAt: { x: 2600, y: 4000 },
      settleAfterMs: 2000,
    },
  ];
}

/**
 * Templates for the geometry/state-specific truth-table cases. Fill in the
 * coordinates/targetIds for the live scene and append to defaultScenarios().
 */
export function templateScenarios() {
  const LYRA = 'VqxGiSb0zfGLfM8f';
  return [
    {
      name: 'target-move-behind-wall',
      type: 'target-move',
      observerId: LYRA,
      observerAt: { x: 0, y: 0 }, // observer fixed where it has LOS to `from`
      targetId: 'FILL_ME',
      from: { x: 0, y: 0 }, // in LOS (observed/soundwave)
      to: { x: 0, y: 0 }, // behind a wall (soundwave/hidden)
    },
  ];
}

export async function runDuringMoveTruthTable({ scenarios = defaultScenarios() } = {}) {
  const observerId = scenarios[0]?.observerId;
  const restore = await captureSettledState(observerId);
  const observer = tokenById(observerId);
  const observerHome = observer ? { x: observer.document.x, y: observer.document.y } : null;

  const scenarioResults = [];
  for (const scenario of scenarios) {
    scenarioResults.push(await runScenario(scenario));
  }

  // restore token + observer positions and control state (best-effort)
  for (const [id, snap] of restore) {
    const t = tokenById(id);
    if (t) await t.document.update({ x: snap.pos.x, y: snap.pos.y }, { animate: false });
  }
  try {
    canvas?.tokens?.releaseAll?.();
    if (observer && observerHome) {
      await observer.document.update({ x: observerHome.x, y: observerHome.y }, { animate: false });
      observer.control({ releaseOthers: true });
    }
  } catch {
    /* best-effort control restore */
  }

  const flat = scenarioResults.flatMap((s) => (s.results ?? []).map((r) => ({ scenario: s.name, ...r })));
  const failures = flat.filter((r) => !r.pass);

  return {
    summary: {
      scenarios: scenarioResults.length,
      judged: flat.length,
      passed: flat.filter((r) => r.pass).length,
      failed: failures.length,
      slowReveals: flat.filter((r) => r.slowReveal).length,
      withFlash: flat.filter((r) => r.kind === 'creature' && r.flashFrames?.length).length,
      objectSoundwaveLeaks: flat.filter((r) => r.kind === 'object' && !r.pass).length,
    },
    failures: failures.map((r) => ({
      scenario: r.scenario,
      target: r.target,
      kind: r.kind,
      transition: `${r.preState}->${r.postState}`,
      expectedFinal: r.expectedFinal,
      finalRender: r.finalRender,
      settledAtMs: r.settledAtMs,
      slowReveal: r.slowReveal,
      toggles: r.toggles,
      flashFrames: r.flashFrames,
    })),
  };
}
