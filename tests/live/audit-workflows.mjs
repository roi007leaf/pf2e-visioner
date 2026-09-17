import { closeDialogs, actionDialog, unfilter, clickAnimated } from './ui-workflows.mjs';
import { PNG } from 'pngjs';

const inspect = (c, expected, art, label) => c.check(expected, art, label, { probe: 'audit' });

export async function timerCancel(c) {
  await c.mutate('audit', { action: 'timer', config: { type: 'realtime', minutes: 10 } });
  await inspect(c, { state: 'hidden', timerActive: true, timerType: 'realtime' }, false, 'timer-created');
  await c.player.reload();
  await c.player.waitForFunction(() => game.ready && canvas.ready);
  await c.rpc(c.player, 'view', c.fixture);
  await inspect(c, { state: 'hidden', timerActive: true }, false, 'timer-survives-player-reload');
  await c.mutate('audit', { action: 'cancel-timer' });
  await inspect(c, { state: 'observed', timerActive: false, pairOverride: false }, true, 'cancel-restores-visibility');
}

export async function timerRound(c, timing) {
  await c.setting('avsOverrideValidationOnTurnChange', false);
  await c.mutate('combat');
  await c.mutate('audit', { action: 'timer', config: { type: 'rounds', rounds: 1 }, turn: timing });
  await inspect(c, { state: 'hidden', timerActive: true, timerRounds: 1 }, false, 'round-timer-created');
  await c.mutate('next-turn');
  if (timing === 'start') {
    await inspect(c, { state: 'hidden', timerActive: true }, false, 'other-turn-preserves-timer');
    await c.mutate('next-turn');
  }
  await inspect(c, { state: 'observed', timerActive: false, pairOverride: false }, true, 'specified-turn-expires');
}

export async function timerRealtime(c) {
  await c.mutate('audit', { action: 'timer', config: { type: 'realtime', minutes: 0.2 } });
  await inspect(c, { state: 'hidden', timerActive: true }, false, 'real-timer-started');
  await c.pause(true);
  try {
    // Real elapsed time, longer than the timer: no fake clocks or expiration calls.
    await c.player.waitForTimeout(13000);
    await inspect(c, { state: 'hidden', timerActive: true }, undefined, 'pause-preserves-timer');
  } finally { await c.pause(false); }
  await inspect(c, { state: 'observed', timerActive: false, pairOverride: false }, true, 'resumed-clock-expires');
}

export async function timerCombatEnd(c) {
  await c.mutate('combat');
  await c.mutate('audit', { action: 'timer', config: { type: 'rounds', rounds: 3 }, turn: 'start' });
  await inspect(c, { state: 'hidden', timerActive: true }, false, 'round-timer');
  await c.mutate('combat-delete');
  await inspect(c, { state: 'hidden', timerActive: false, pairOverride: true }, false, 'combat-end-keeps-permanent-override');
  await c.mutate('reset-override');
  await inspect(c, { state: 'observed', pairOverride: false }, true, 'permanent-override-can-release');
}

export async function timerDialog(c) {
  await c.mutate('audit', { action: 'timer-dialog' });
  let dialog = c.gm.locator('#timer-duration-dialog');
  await dialog.waitFor();
  await dialog.locator('[data-action="cancelTimer"]').click();
  await inspect(c, { timerActive: false, state: 'observed' }, true, 'dialog-cancel-does-not-apply');
  await c.mutate('audit', { action: 'timer-dialog' });
  dialog = c.gm.locator('#timer-duration-dialog');
  await dialog.waitFor();
  await dialog.locator('[data-preset="1min"]').click();
  await dialog.locator('[data-action="applyTimer"]').click();
  await inspect(c, { state: 'hidden', timerActive: true, timerType: 'realtime' }, false, 'dialog-applied-timer');
  await c.mutate('audit', { action: 'cancel-timer' });
  await inspect(c, { state: 'observed', timerActive: false }, true, 'dialog-timer-cancelled');
  await closeDialogs(c);
}

export const auditWorkflows = {
  'audit-gm-observer-foundry-hidden-npc': gmObserverFoundryHidden,
  'audit-scent-gm-selection-gm-vision': c => scentGmSelection(c, false, true),
  'audit-scent-gm-selection-normal': c => scentGmSelection(c, false),
  'audit-scent-gm-selection-observer': c => scentGmSelection(c, true),
  'audit-gm-keybindings': gmKeybindings,
  ...Object.fromEntries(['decision', 'move-cancel'].map(mode => [`audit-door-approval-${mode}`, c => doorApproval(c, mode)])),
  'audit-template-cover-saves': templateCoverSaves,
  'audit-sense-the-unseen': senseTheUnseen,
  'audit-multi-observer-selection': multiObserverSelection,
  'audit-perception-profile-api': perceptionProfileApi,
  'audit-combat-start-cover': combatStartCover,
  ...Object.fromEntries(['seek', 'search'].map(action => [`audit-hidden-walls-${action}`, c => hiddenWallDiscovery(c, action)])),
  'audit-party-restoration': partyRestoration,
  'audit-scene-prep': scenePrep,
  'audit-wall-manager': wallManager,
  ...Object.fromEntries(['two-way', 'replace', 'reverse'].map(mode =>
    [`audit-shared-${mode}`, c => sharedMode(c, mode)])),
  ...Object.fromEntries(['Allies', 'Dead', 'Undetected', 'SmallerTokens', 'SameSizeTokens', 'LargerTokens'].map(kind =>
    [`audit-cover-ignore-${kind}`, c => coverIgnore(c, kind)])),
  'audit-blinded-movement': blindedMovement,
  'audit-encounter-master': encounterMaster,
  ...Object.fromEntries(['hidden', 'concealed', 'undetected'].map(state =>
    [`audit-native-condition-${state}`, c => nativeCondition(c, state)])),
  ...Object.fromEntries(['world', 'scene', 'token-vision', 'combat'].map(mode =>
    [`audit-avs-${mode}`, c => avsGate(c, mode)])),
  ...Object.fromEntries(['individual', 'accept-all', 'reject-all', 'group'].map(mode =>
    [`audit-validation-${mode}`, c => validation(c, mode)])),
  'audit-peek-corner': peekCorner,
  'audit-peek-door': peekDoor,
  ...Object.fromEntries(['none', 'corner', 'door', 'both'].map(mode =>
    [`audit-peek-block-${mode}`, c => peekBlockMode(c, mode)])),
  'audit-timer-cancel-reload': timerCancel,
  'audit-timer-turn-start': c => timerRound(c, 'start'),
  'audit-timer-turn-end': c => timerRound(c, 'end'),
  'audit-timer-realtime-pause': timerRealtime,
  'audit-timer-combat-end': timerCombatEnd,
  'audit-timer-dialog': timerDialog,
};

async function scentGmSelection(c, observerView, gmVision = false) {
  await c.mutate('condition', 'deafened');
  await c.gm.evaluate(value => game.settings.set('pf2e', 'gmVision', value), gmVision);
  await c.mutate('gm-observer-view', observerView);
  await c.gm.evaluate(() => canvas.tokens.releaseAll());
  await c.player.mouse.move(10, 10); await c.gm.mouse.move(10, 10);
  const marker = async (session, label) => {
    await c.check({ state: 'hidden', sense: 'scent', presenceMode: 'scent', presenceVisible: true }, false, label, { session });
    const page = c[session]; await page.bringToFront();
    const { rect } = await c.rpc(page, 'snapshot', c.fixture);
    const png = PNG.sync.read(await page.screenshot());
    let brown = 0;
    for (let y = Math.max(0, rect.y - 8); y < Math.min(png.height, rect.y + rect.height + 8); y++) {
      for (let x = Math.max(0, rect.x - 8); x < Math.min(png.width, rect.x + rect.width + 8); x++) {
        const i = (y * png.width + x) * 4;
        const [r, g, b] = png.data.subarray(i, i + 3);
        if (r > 35 && r > g * 1.25 && g > b * 1.35 && b < 90) brown++;
      }
    }
    c.assert(brown > 30, `${label}: rendered brown scent outline (${brown} pixels)`);
  };
  await marker('player', 'player-before-gm-selection');
  for (let cycle = 0; cycle < 3; cycle++) {
    await c.gm.bringToFront();
    const point = await c.gm.evaluate(f => {
      const token = canvas.tokens.get(f.observer);
      const p = canvas.stage.toGlobal(token.center);
      return { x: p.x, y: p.y };
    }, c.fixture);
    await c.gm.mouse.click(point.x, point.y);
    await c.gm.waitForFunction(id => canvas.tokens.controlled.length === 1 && canvas.tokens.controlled[0].id === id, c.fixture.observer);
    await c.gm.mouse.move(10, 10);
    await c.player.waitForTimeout(1000);
    await marker('player', `player-gm-selected-${cycle}`);
    if (gmVision) {
      await c.check({ presenceVisible: false, visible: true }, 'dim', `gm-vision-shows-art-${cycle}`, { session: 'gm' });
    } else await marker('gm', `gm-selected-${cycle}`);
    await c.gm.bringToFront();
    // Native Shift-click releases a selected token even when the user's
    // "release on empty click" preference is disabled.
    await c.gm.keyboard.down('Shift');
    try { await c.gm.mouse.click(point.x, point.y, { delay: 100 }); }
    finally { await c.gm.keyboard.up('Shift'); }
    await c.gm.waitForFunction(() => canvas.tokens.controlled.length === 0);
    await c.gm.mouse.move(10, 10);
    await marker('player', `player-gm-deselected-${cycle}`);
  }
  await c.mutate('move', 1200);
  await c.check({ presenceVisible: false }, false, 'scent-out-of-range-removes-marker');
  await c.mutate('move', 800);
  await marker('player', 'scent-return-restores-marker');
}

async function gmKeybindings(c) {
  await c.mutate('gm-observer-view', false);
  await c.gm.evaluate(() => game.settings.set('pf2e', 'gmVision', true));
  await c.gm.bringToFront();
  await c.gm.locator('#board').click({ position: { x: 50, y: 50 } });
  await c.gm.evaluate(f => canvas.tokens.get(f.observer).control({ releaseOthers: true }), c.fixture);
  await c.gm.keyboard.press('Control+g');
  await c.gm.waitForFunction(() => game.settings.get('pf2e-visioner', 'gmObserverView') === true && game.settings.get('pf2e', 'gmVision') === false);
  c.assert(true, 'Ctrl+G enables observer view and disables competing PF2e GM vision');
  await c.check({ state: 'observed', visible: true }, true, 'gm-observed-art-remains-visible', { session: 'gm' });
  await c.gm.keyboard.press('Control+g');
  await c.gm.waitForFunction(() => game.settings.get('pf2e-visioner', 'gmObserverView') === false);
  c.assert(true, 'Second Ctrl+G disables observer view');
  await c.gm.keyboard.press('Control+Shift+v');
  const dialog = c.gm.locator('.visioner-token-manager'); await dialog.waitFor(); await unfilter(dialog);
  c.assert(await dialog.locator(`[data-token-id="${c.fixture.target}"]`).count() > 0, 'Native manager keybinding opens selected observer rows');
  await closeDialogs(c);
}

async function gmObserverFoundryHidden(c) {
  const ghostArt = async label => {
    await c.check({ visible: true, meshVisible: true, meshRenderable: true, meshAlpha: 0.5 }, undefined, label, { session: 'gm' });
    const { rect } = await c.rpc(c.gm, 'snapshot', c.fixture);
    const png = PNG.sync.read(await c.gm.screenshot());
    let green = 0, blue = 0;
    // The fixture has green and blue bars. Both must survive translucent red hatching;
    // an outline alone, empty background, or detection waves cannot satisfy this check.
    for (let y = Math.ceil(rect.y + rect.height * 0.2); y < rect.y + rect.height * 0.8; y++) {
      for (let x = Math.ceil(rect.x + rect.width * 0.15); x < rect.x + rect.width * 0.85; x++) {
        const i = (y * png.width + x) * 4;
        const [r, g, b] = png.data.subarray(i, i + 3);
        if (g > r + 15 && g > b + 15) green++;
        if (b > r + 15 && b > g + 15) blue++;
      }
    }
    c.assert(green > 40 && blue > 40, `${label}: tinted artwork retains green (${green}) and blue (${blue}) bars`);
  };
  await c.gm.evaluate(() => game.settings.set('pf2e', 'gmVision', false));
  await c.mutate('gm-observer-view', false);
  await c.mutate('foundry-hidden', true);
  await c.check({ visible: false }, false, 'normal-gm-controlled-npc-cannot-see-ghosted-target', { session: 'gm' });
  await c.check({ visible: false }, false, 'player-cannot-see-foundry-hidden-target');
  await c.mutate('gm-observer-view', true);
  await ghostArt('observer-view-reveals-ghosted-npc-art');
  c.equal(await c.gm.evaluate(f => canvas.tokens.get(f.target).mesh.alpha, c.fixture), 0.5, 'Foundry-hidden art keeps GM transparency');
  await c.check({ visible: false }, false, 'observer-view-does-not-reveal-target-to-player');
  await c.gm.evaluate(async f => { await canvas.tokens.get(f.observer).document.update({ hidden: true }); }, c.fixture);
  await ghostArt('ghosted-observer-still-sees-ghosted-target-in-gm-view');
  await c.gm.evaluate(async f => { await canvas.tokens.get(f.observer).document.update({ hidden: false }); }, c.fixture);
  await c.mutate('gm-observer-view', false);
  await c.check({ visible: false }, false, 'disabling-observer-view-restores-normal-gm-rendering', { session: 'gm' });
}

async function doorApproval(c, mode) {
  await c.setting('requireGmApprovalForDoorPeek', true);
  await c.setting('peekSlitAngle', 10); await c.setting('peekRange', 30);
  await c.mutate('audit', { action: 'peek-wall' });
  await c.check({ visible: false }, false, 'unapproved-door-blocks-sight');
  const request = async () => {
    await c.player.bringToFront();
    const { rect } = await c.rpc(c.player, 'snapshot', c.fixture);
    await c.player.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await c.rpc(c.player, 'peekAudit', { fixture: c.fixture, action: 'door' });
    const dialog = c.gm.locator('.visioner-confirm-dialog'); await dialog.waitFor();
    await inspect(c, { peekActive: false, peekPending: 1, visible: false }, false, 'pending-request-does-not-reveal');
    return dialog;
  };
  let dialog = await request();
  if (mode === 'move-cancel') {
    await c.mutate('observer-move', { x: 300 });
    await inspect(c, { peekPending: 0, peekActive: false, visible: false }, false, 'moving-cancels-pending-request');
    await dialog.locator('[data-action="yes"]').click();
    await inspect(c, { peekPending: 0, peekActive: false, visible: false }, false, 'late-approval-cannot-start-stale-peek');
  } else {
    await dialog.locator('[data-action="no"]').click();
    await inspect(c, { peekPending: 0, peekActive: false, visible: false }, false, 'gm-denial-keeps-door-blocked');
    dialog = await request(); await dialog.locator('[data-action="yes"]').click();
    await inspect(c, { peekPending: 0, peekActive: true, visible: true }, true, 'gm-approval-starts-player-peek');
    await c.rpc(c.player, 'peekAudit', { fixture: c.fixture, action: 'end' });
    await inspect(c, { peekActive: false, visible: false }, false, 'ending-approved-peek-restores-sight');
  }
}

async function templateCoverSaves(c) {
  const check = (expected, label) => c.check(expected, undefined, label, { session: 'gm', probe: 'audit' });
  await c.mutate('cover-geometry', { type: 'wall', cover: 'standard' });
  const base = await c.gm.evaluate(f => ({ reflex: canvas.tokens.get(f.target).actor.saves.reflex.mod,
    fortitude: canvas.tokens.get(f.target).actor.saves.fortitude.mod }), c.fixture);
  await c.mutate('audit', { action: 'template' });
  await check({ templateCount: 1, templateCover: 'standard', templateCreator: true }, 'placed-template-cover-and-caster');
  await c.mutate('audit', { action: 'save', statistic: 'reflex', area: true });
  await check({ saveModifier: base.reflex + 2 }, 'reflex-area-cover-bonus');
  await c.mutate('audit', { action: 'save', statistic: 'fortitude', area: true });
  await check({ saveModifier: base.fortitude }, 'fortitude-does-not-gain-cover');
  await c.mutate('audit', { action: 'template', update: { x: 850 } });
  await check({ templateCover: 'none' }, 'moving-origin-recalculates-cover');
  await c.mutate('audit', { action: 'template', update: { x: 1600, distance: 5 } });
  await check({ templateCover: null }, 'moving-template-removes-outside-target');
  await c.mutate('audit', { action: 'template', remove: true });
  await check({ templateCount: 0, templateCover: null }, 'template-deletion-cleans-target-index');
}

async function senseTheUnseen(c) {
  await c.mutate('state', 'undetected');
  let dialog = await actionDialog(c, 'seek', -50);
  c.equal(await dialog.locator('[data-reaction="senseTheUnseen"]').count(), 0, 'Reaction absent without feat');
  await closeDialogs(c);
  await c.mutate('feat-add', { slug: 'sense-the-unseen' });
  dialog = await actionDialog(c, 'seek', -50);
  await clickAnimated(c.gm, dialog.locator('[data-action="toggleReactions"]'));
  const reaction = dialog.locator('[data-reaction="senseTheUnseen"]'); await reaction.click();
  await c.gm.waitForFunction(() => document.querySelector('.seek-preview-dialog [data-reaction="senseTheUnseen"]')?.disabled);
  c.assert(await reaction.isDisabled(), 'Reaction cannot be applied twice');
  await c.check({ state: 'undetected' }, false, 'reaction-awaits-apply');
  await clickAnimated(c.gm, dialog.locator('[data-action="toggleReactions"]'));
  const row = dialog.locator(`tr[data-token-id="${c.fixture.target}"]`);
  await row.locator('[data-action="applyChange"]').click();
  await c.check({ state: 'hidden' }, false, 'failed-seek-upgraded-by-reaction');
  await c.indicator(true);
  await row.locator('[data-action="revertChange"]').click();
  await c.check({ state: 'undetected' }, false, 'reaction-outcome-reverted');
  await closeDialogs(c); await c.mutate('feat-delete', { slug: 'sense-the-unseen' });
}

async function multiObserverSelection(c) {
  await c.setting('enableCameraVisionAggregation', true);
  await c.mutate('condition', 'blinded'); await c.mutate('condition', 'deafened');
  await c.check({ state: 'undetected', secondState: 'observed', visible: false }, false, 'only-blind-observer');
  await c.player.evaluate(f => canvas.tokens.get(f.secondObserver).control({ releaseOthers: false }), c.fixture);
  await c.check({ state: 'undetected', secondState: 'observed', visible: true, filter: null }, true, 'second-controlled-observer-sees-target');
  await c.player.evaluate(f => canvas.tokens.get(f.secondObserver).release(), c.fixture);
  await c.check({ visible: false }, false, 'releasing-sighted-observer-hides-target');
  await c.gm.bringToFront();
  await c.rpc(c.gm, 'view', c.fixture);
  await c.check({ visible: false }, false, 'gm-observer-before-select-all', { session: 'gm' });
  await c.gm.locator('#board').click({ position: { x: 50, y: 50 } });
  await c.gm.keyboard.press('Control+a');
  await c.gm.waitForFunction(() => canvas.tokens.controlled.length === 3);
  c.assert(true, 'Native Ctrl+A selects every fixture token');
  await c.check({ visible: true }, true, 'select-all-bypasses-hidden-art', { session: 'gm' });
  await c.gm.evaluate(f => canvas.tokens.get(f.observer).control({ releaseOthers: true }), c.fixture);
  await c.check({ visible: false }, false, 'leaving-select-all-restores-observer-state', { session: 'gm' });
}

async function perceptionProfileApi(c) {
  await c.setting('autoVisibilityEnabled', false);
  // This exercises canonical API persistence, not a concurrent AVS write race.
  // Settings acknowledgement does not imply an already-dispatched batch has settled.
  await c.gm.waitForFunction(async () => {
    const { autoVisibilitySystem } = await import('/modules/pf2e-visioner/scripts/visibility/auto-visibility/index.js');
    const d = autoVisibilitySystem.getDiagnostics();
    return d.enabled === false && !d.processingBatch && !d.stateManagerProcessing && !d.updatingEffects &&
      d.pendingTokens.length === 0 && d.changedTokens.length === 0;
  });
  for (let cycle = 0; cycle < 5; cycle++) await perceptionProfileApiCycle(c);
}

async function perceptionProfileApiCycle(c) {
  const write = async (method, profiles, page = c.gm) => page.evaluate(async ({ fixture, method, profiles }) => {
    const api = game.modules.get('pf2e-visioner').api;
    const options = { isAutomatic: true };
    if (method === 'pair') return api.setPerceptionProfile(fixture.observer, fixture.target, profiles, options);
    return api.setPerceptionProfileMap(fixture.observer,
      Object.fromEntries(Object.entries(profiles).map(([role, value]) => [fixture[role], value])), options);
  }, { fixture: c.fixture, method, profiles });
  const read = async () => c.player.evaluate(f => {
    const api = game.modules.get('pf2e-visioner').api;
    return api.getPerceptionProfile(f.observer, f.target);
  }, c.fixture);
  c.assert(await write('pair', { detectionState: 'observed', hasConcealment: true, coverState: 'standard' }), 'Canonical pair API accepted');
  await c.check({ state: 'concealed' }, true, 'canonical-concealment');
  c.equal((await read()).coverState, 'standard', 'Canonical cover metadata reaches player');
  c.assert(await write('map', { target: { detectionState: 'hidden', detectionSense: 'hearing' }, secondObserver: 'undetected' }), 'Whole-map API accepted');
  await c.check({ state: 'hidden' }, false, 'canonical-hidden');
  const map = await c.player.evaluate(f => game.modules.get('pf2e-visioner').api.getPerceptionProfileMap(f.observer), c.fixture);
  c.equal(map[c.fixture.secondObserver].detectionState, 'undetected', 'Bulk write includes second relationship');
  await write('map', { target: 'concealed' });
  await c.check({ state: 'concealed' }, true, 'whole-map-replacement');
  c.equal(await c.player.evaluate(f => game.modules.get('pf2e-visioner').api.getVisibility(f.observer, f.secondObserver), c.fixture), 'observed', 'Omitted relationship removed by replacement');
  await write('pair', { detectionState: 'undetected' }, c.player);
  await c.check({ state: 'concealed' }, true, 'player-cannot-overwrite-profile-map');
  await write('pair', { detectionState: 'invalid', coverState: 'invalid', awarenessState: 'unnoticed' });
  await c.check({ state: 'observed' }, true, 'invalid-profile-normalized');
  const normalized = await read();
  c.equal({ detectionState: normalized.detectionState, coverState: normalized.coverState, awarenessState: normalized.awarenessState },
    { detectionState: 'observed', coverState: 'none', awarenessState: null }, 'Invalid canonical fields normalize to defaults');
  await write('map', {});
  await c.check({ state: 'observed' }, true, 'empty-map-clears-relationships');
}

async function combatStartCover(c) {
  await c.mutate('cover-geometry', { type: 'wall', cover: 'standard' });
  await c.setting('computeCoverAtCombatStart', false);
  await inspect(c, { storedAutoCover: 'none' }, undefined, 'cover-not-yet-persisted');
  await c.mutate('combat');
  await inspect(c, { storedAutoCover: 'none' }, undefined, 'disabled-combat-cover');
  await c.mutate('combat-delete');
  await c.setting('computeCoverAtCombatStart', true);
  await c.mutate('combat');
  await inspect(c, { storedAutoCover: 'standard' }, undefined, 'enabled-combat-cover');
  await c.mutate('strike-item', { subject: 'observer' });
  await c.mutate('strike', { subject: 'observer' });
  await c.check({ strikeDC: 20 }, undefined, 'native-strike-includes-standard-cover');
}

async function hiddenWallDiscovery(c, action) {
  await c.setting('hiddenWallsEnabled', true); await c.setting('seekUseTemplate', false);
  await c.mutate('audit', { action: 'connected-hidden-walls' });
  const wall = await c.gm.evaluate(() => canvas.scene.walls.find(w => w.getFlag('pf2e-visioner', 'wallIdentifier') === 'QA Alpha').id);
  await inspect(c, { observerDiscoveredWalls: 0, secondDiscoveredWalls: 0 }, undefined, 'walls-initially-unknown');
  const open = async total => {
    if (action === 'seek') return actionDialog(c, 'seek', total);
    await c.mutate('search', { total });
    const dialog = c.gm.locator('.seek-preview-dialog').last(); await dialog.waitFor(); await unfilter(dialog); return dialog;
  };
  let dialog = await open(60);
  let row = dialog.locator(`tr[data-wall-id="${wall}"]`); await row.waitFor();
  await row.locator('[data-action="applyChange"]').click();
  await inspect(c, { observerDiscoveredWalls: 2, secondDiscoveredWalls: 0 }, undefined, 'connected-discovery-only-for-seeker');
  await row.locator('[data-action="revertChange"]').click();
  await inspect(c, { observerDiscoveredWalls: 0, secondDiscoveredWalls: 0 }, undefined, 'connected-discovery-reverted');
  await closeDialogs(c);
  dialog = await open(-50); row = dialog.locator(`tr[data-wall-id="${wall}"]`); await row.waitFor();
  await row.locator('[data-action="applyChange"]').click();
  await inspect(c, { observerDiscoveredWalls: 0, secondDiscoveredWalls: 0 }, undefined, 'failed-check-keeps-walls-unknown');
  await closeDialogs(c);
}

async function partyRestoration(c) {
  // No client should retain an unrelated hover while the native HUD replaces tokens.
  await c.player.mouse.move(10, 10);
  // Test stored relationship restoration independently of movement-driven AVS recalculation.
  await c.setting('autoVisibilityEnabled', false);
  await c.mutate('state', 'hidden'); await c.mutate('cover', 'standard');
  await c.mutate('state', 'undetected', { observer: c.fixture.target, target: c.fixture.observer });
  await c.check({ state: 'hidden', reverseState: 'undetected', cover: 'standard' }, false, 'party-original-relationships');
  const original = c.fixture.observer;
  const actorId = await c.gm.evaluate(f => canvas.tokens.get(f.observer).actor.id, c.fixture);
  await c.mutate('audit', { action: 'party' });
  const toggle = c.gm.locator('#token-hud .clown-car'); await toggle.waitFor();
  await toggle.click();
  await c.gm.waitForFunction(id => !canvas.scene.tokens.has(id), original);
  c.assert(true, 'Native party HUD consolidated the member');
  await c.gm.waitForFunction(() => !document.querySelector('#token-hud .clown-car')?.disabled);
  await toggle.click();
  await c.gm.waitForFunction(({ actorId, original }) => canvas.scene.tokens.some(t => t.actorId === actorId && t.id !== original), { actorId, original });
  const restored = await c.gm.evaluate(actorId => canvas.scene.tokens.find(t => t.actorId === actorId).id, actorId);
  c.assert(restored !== original, 'Native party HUD created a new token ID');
  c.fixture.observer = restored;
  await c.rpc(c.player, 'view', c.fixture);
  await c.check({ state: 'hidden', reverseState: 'undetected', cover: 'standard' }, false, 'restored-token-keeps-incoming-and-outgoing-states');
}

async function scenePrep(c) {
  await c.mutate('audit', { action: 'prep-walls' });
  for (let cycle = 0; cycle < 3; cycle++) {
  await c.mutate('foundry-hidden', true);
  const prompt = async action => {
    await c.gm.locator('[data-tool="pf2e-visioner-hidden-scene-visibility"]').click();
    const dialog = c.gm.locator('.visioner-confirm-dialog'); await dialog.waitFor();
    await dialog.locator(`[data-action="${action}"]`).click();
  };
  await prompt('no');
  await inspect(c, { targetPrep: null, targetFoundryHidden: true }, undefined, 'prep-cancel-preserves-hidden');
  await prompt('yes');
  await inspect(c, { targetPrep: 'hidden', targetFoundryHidden: false, observerHiddenWalls: 1, visible: false }, false, 'scene-prepared');
  await c.mutate('audit', { action: 'future-pc' });
  const future = (await c.rpc(c.gm, 'snapshot', { ...c.fixture, probe: 'audit' })).futureObserver;
  c.assert(!!future, 'Created a new owned PC after preparing the scene');
  const view = { ...c.fixture, observer: future };
  await c.rpc(c.player, 'view', view);
  await c.check({ observerHiddenWalls: 1, visible: false }, false, 'future-pc-inherits-prep', { ...view, probe: 'audit' });
  await prompt('extra');
  await c.check({ targetPrep: null, observerHiddenWalls: 0, visible: true }, true, 'clear-prep-restores-future-pc', { ...view, probe: 'audit' });
  await c.rpc(c.player, 'view', c.fixture);
  await inspect(c, { observerHiddenWalls: 0, visible: true }, true, 'clear-prep-restores-original-pc');
  }
}

async function wallManager(c) {
  await c.mutate('audit', { action: 'manager-walls' });
  const open = async () => {
    await c.mutate('audit', { action: 'wall-manager' });
    const dialog = c.gm.locator('#pf2e-visioner-wall-manager'); await dialog.waitFor(); return dialog;
  };
  let dialog = await open();
  await dialog.locator('[data-action="bulkHiddenOn"]').click();
  await dialog.locator('[data-action="bulkCoverStandard"]').click();
  await dialog.locator('form [data-action="close"]').click();
  await inspect(c, { hiddenWalls: 0, standardWalls: 0 }, undefined, 'wall-cancel-preserves-documents');
  dialog = await open();
  await dialog.locator('[data-action="bulkHiddenOn"]').click();
  await dialog.locator('[data-action="bulkCoverStandard"]').click();
  await dialog.locator('[data-action="apply"]').click();
  await inspect(c, { hiddenWalls: 2, standardWalls: 2 }, undefined, 'bulk-wall-changes-persist');
  dialog = await open();
  c.equal(await dialog.locator('input[name$=".hiddenWall"]:checked').count(), 2, 'Hidden flags survive reopening');
  await dialog.locator('#wall-search').fill('Alpha');
  await c.gm.waitForFunction(() => [...document.querySelectorAll('#pf2e-visioner-wall-manager tr[data-wall-id]')].filter(el => el.style.display !== 'none').length === 1);
  await dialog.locator('[data-action="bulkHiddenOff"]').click();
  await dialog.locator('[data-action="bulkCoverNone"]').click();
  await dialog.locator('[data-action="apply"]').click();
  await inspect(c, { hiddenWalls: 1, standardWalls: 1, noCoverWalls: 1 }, undefined, 'filter-preserves-unshown-wall');
  dialog = await open();
  await dialog.locator('[data-action="bulkHiddenOff"]').click();
  await dialog.locator('[data-action="bulkCoverAuto"]').click();
  await dialog.locator('[data-action="apply"]').click();
  await inspect(c, { hiddenWalls: 0, standardWalls: 0, noCoverWalls: 0 }, undefined, 'bulk-wall-reset');
}

async function sharedMode(c, mode) {
  await c.mutate('observer-move', { x: 700 });
  await c.mutate('door', 0);
  await c.check({ visible: true, filter: null }, true, 'minion-has-direct-sight');
  const viewing = mode === 'replace' ? c.fixture : { ...c.fixture, observer: c.fixture.secondObserver };
  await c.rpc(c.player, 'view', viewing);
  await c.check({ visible: mode === 'replace' }, mode === 'replace', 'independent-view');
  await c.mutate('link-vision', { mode });
  const sharedVisible = mode !== 'replace';
  await c.check({ hasVisionMaster: true, visible: sharedVisible }, sharedVisible, 'sharing-mode-applied');
  await c.player.reload(); await c.player.waitForFunction(() => game.ready && canvas.ready);
  await c.rpc(c.player, 'view', viewing);
  await c.check({ visible: sharedVisible }, sharedVisible, 'sharing-survives-reload');
  await c.mutate('link-vision', { clear: true });
  await c.check({ hasVisionMaster: false, visible: !sharedVisible }, !sharedVisible, 'clearing-restores-independent-view');
}

async function coverIgnore(c, kind) {
  for (const suffix of ['Allies', 'Dead', 'Undetected', 'SmallerTokens', 'SameSizeTokens', 'LargerTokens']) await c.setting(`autoCoverIgnore${suffix}`, false);
  await c.mutate('second-token', { x: 600, y: 500 });
  if (kind === 'Allies') await c.mutate('second-data', { 'system.details.alliance': 'party' });
  if (kind === 'Dead') await c.mutate('second-data', { 'system.attributes.hp.value': 0 });
  if (kind === 'Undetected') await c.mutate('state', 'undetected', { target: c.fixture.secondObserver });
  if (kind === 'SmallerTokens') await c.mutate('second-data', { 'system.traits.size.value': 'sm' });
  if (kind === 'LargerTokens') await c.mutate('second-data', { 'system.traits.size.value': 'huge' });
  const cover = kind === 'LargerTokens' ? 'standard' : 'lesser';
  await c.check({ autoCover: cover }, undefined, 'blocker-counted');
  await c.setting(`autoCoverIgnore${kind}`, true);
  await c.check({ autoCover: 'none' }, undefined, 'blocker-excluded');
  await c.setting(`autoCoverIgnore${kind}`, false);
  await c.check({ autoCover: cover }, undefined, 'blocker-restored');
}

async function blindedMovement(c) {
  const cost = (expected, label) => c.check({ pathDistance: 10, pathCost: expected }, undefined, label, { probe: 'audit', measurePath: true });
  await cost(10, 'normal-cost');
  await c.mutate('condition', 'blinded'); await cost(20, 'blind-cost-doubles');
  await c.player.bringToFront();
  const points = await c.player.evaluate(f => {
    const token = canvas.tokens.get(f.observer);
    const from = canvas.stage.toGlobal(token.center);
    const to = canvas.stage.toGlobal(new PIXI.Point(650, 550));
    return { from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y } };
  }, c.fixture);
  await c.player.mouse.move(points.from.x, points.from.y); await c.player.mouse.down();
  try {
    await c.player.mouse.move(points.to.x, points.to.y, { steps: 18 });
    await c.player.waitForFunction(() => canvas.tokens.preview.children.length > 0);
    await c.player.waitForTimeout(500);
    const labels = await c.player.locator('#measurement').innerText();
    c.assert(/10\s*\+\s*10\s*ft/.test(labels), `Blinded ruler shows distance plus additional cost: ${labels}`);
  } finally {
    await c.player.mouse.click(points.to.x, points.to.y, { button: 'right' });
    await c.player.mouse.up();
  }
  await c.check({ observerX: 400, clones: 0 }, undefined, 'ruler-cancel-preserves-position');
  await c.mutate('audit', { action: 'terrain', difficulty: 2 }); await cost(20, 'difficult-terrain-does-not-stack');
  await c.mutate('audit', { action: 'terrain', difficulty: 3 }); await cost(30, 'greater-difficult-preserved');
  await c.mutate('condition', 'blinded'); await cost(30, 'sight-restores-terrain-cost');
  await c.mutate('audit', { action: 'terrain', difficulty: 0 }); await cost(10, 'terrain-removal-restores-cost');
}

async function encounterMaster(c) {
  await c.mutate('combat');
  await c.mutate('audit', { action: 'remove-observer-combatant' });
  await inspect(c, { observerInEncounter: false, encounterMaster: null }, undefined, 'unlinked-noncombatant');
  async function config() {
    await c.mutate('audit', { action: 'token-config' });
    const sheet = c.gm.locator('.application').filter({ has: c.gm.locator('.pf2e-visioner-box') });
    await sheet.waitFor();
    await sheet.locator('nav [data-tab="vision"]').click();
    return sheet;
  }
  let sheet = await config();
  await sheet.locator('.pv-encounter-master-btn').click();
  let picker = c.gm.locator('#pv-encounter-master-dialog');
  await picker.waitFor();
  c.equal(await picker.locator(`.pv-em-token-row[data-token-id="${c.fixture.observer}"]`).count(), 0, 'Cannot choose itself');
  await picker.locator('.pv-em-cancel-btn').click();
  c.equal(await sheet.locator('.pv-encounter-master-input').inputValue(), '', 'Cancel preserves empty link');
  await sheet.locator('.pv-encounter-master-btn').click();
  picker = c.gm.locator('#pv-encounter-master-dialog');
  await picker.locator(`.pv-em-token-row[data-token-id="${c.fixture.secondObserver}"]`).click();
  await sheet.locator('button[type="submit"]').click();
  await inspect(c, { observerInEncounter: true, encounterMaster: c.fixture.secondObserver }, undefined, 'linked-master-includes-minion');
  sheet = await config();
  c.equal(await sheet.locator('.pv-encounter-master-input').inputValue(), c.fixture.secondObserver, 'Link persists after reopening');
  await sheet.locator('.pv-encounter-master-clear').click();
  await sheet.locator('button[type="submit"]').click();
  await inspect(c, { observerInEncounter: false, encounterMaster: null }, undefined, 'cleared-master-removes-minion');
}

async function nativeCondition(c, state) {
  await c.mutate('target-data', { 'system.details.alliance': 'opposition' }, { target: c.fixture.secondObserver });
  await c.setting('systemConditionOverrides', false);
  await c.mutate('target-condition', state);
  await inspect(c, { targetSystemConditions: state, pairOverride: false, secondPairOverride: false }, undefined, 'disabled-keeps-native-condition');
  await c.mutate('target-condition', state);
  await inspect(c, { targetSystemConditions: '', state: 'observed' }, true, 'native-condition-removed');
  await c.setting('systemConditionOverrides', true);
  await c.mutate('target-condition', state);
  await inspect(c, { targetSystemConditions: '', state, pairOverride: true,
    pairOverrideSource: 'converted-system-condition', secondPairOverride: false }, state === 'concealed', 'converted-for-enemies-only');
  await c.mutate('reset-override');
  await inspect(c, { state: 'observed', pairOverride: false, targetSystemConditions: '' }, true, 'converted-override-released');
}

async function avsGate(c, mode) {
  await c.check({ state: 'observed' }, true, 'enabled-baseline');
  if (mode === 'world') await c.setting('autoVisibilityEnabled', false);
  if (mode === 'scene') await c.mutate('audit', { action: 'scene-data', data: { 'flags.pf2e-visioner.disableAVS': true } });
  if (mode === 'token-vision') await c.mutate('audit', { action: 'scene-data', data: { tokenVision: false } });
  if (mode === 'combat') await c.setting('avsOnlyInCombat', true);
  await c.mutate('condition', 'blinded');
  // Observe a real update while the gate is closed. Give the normal debounced
  // event pipeline time to run; never invoke the calculator to force an outcome.
  await c.mutate('move', 900);
  await c.player.waitForTimeout(1500);
  await c.check({ state: 'observed' }, undefined, 'disabled-avs-does-not-rewrite-pair');
  if (mode === 'world') await c.setting('autoVisibilityEnabled', true);
  if (mode === 'scene') await c.mutate('audit', { action: 'scene-data', data: { 'flags.pf2e-visioner.disableAVS': false } });
  if (mode === 'token-vision') await c.mutate('audit', { action: 'scene-data', data: { tokenVision: true } });
  if (mode === 'combat') await c.mutate('combat');
  await c.check({ state: 'hidden', filter: 'hearing' }, false, 'enabled-avs-recalculates');
  await c.mutate('condition', 'blinded');
  await c.check({ state: 'observed' }, true, 'sight-restored');
  if (mode === 'combat') {
    await c.mutate('combat-delete');
    await c.mutate('condition', 'blinded');
    await c.mutate('move', 800);
    await c.player.waitForTimeout(1500);
    await c.check({ state: 'observed' }, undefined, 'combat-end-closes-gate');
    await c.setting('avsOnlyInCombat', false);
    await c.check({ state: 'hidden', filter: 'hearing' }, false, 'combat-only-off-recalculates');
  }
}

async function validation(c, mode) {
  await c.mutate('audit', { action: 'manual-pairs' });
  await inspect(c, { state: 'hidden', pairOverride: true, secondPairOverride: true }, false, 'two-manual-pairs');
  await c.mutate('move', 900);
  const indicator = c.gm.locator('.pf2e-visioner-override-indicator');
  await indicator.waitFor({ state: 'visible' });
  await indicator.click();
  const dialog = c.gm.locator('#override-validation-dialog');
  await dialog.waitFor();
  c.equal(await dialog.locator('tr[data-override-id]').count(), 2, 'Both real invalid overrides are queued');
  const row = dialog.locator(`tr[data-override-id="${c.fixture.observer}-${c.fixture.target}"]`);
  if (mode === 'individual') {
    await row.locator('.btn-keep').click();
    await c.gm.waitForFunction(id => document.querySelector(`tr[data-override-id="${id}"]`)?.style.pointerEvents === 'none', `${c.fixture.observer}-${c.fixture.target}`);
    await inspect(c, { state: 'hidden', pairOverride: true, secondPairOverride: true }, false, 'reject-preserves-pair');
    await dialog.locator(`tr[data-override-id="${c.fixture.secondObserver}-${c.fixture.target}"] .btn-clear`).click();
    await inspect(c, { state: 'hidden', pairOverride: true, secondPairOverride: false }, false, 'accept-only-other-pair');
  } else {
    const selector = mode === 'accept-all' ? '.btn-clear-all' : mode === 'reject-all' ? '.btn-keep-all' : '.btn-clear-target';
    await dialog.locator(selector).click();
    const keep = mode === 'reject-all';
    await inspect(c, { state: keep ? 'hidden' : 'observed', pairOverride: keep, secondPairOverride: keep }, !keep, mode);
  }
  await c.gm.waitForFunction(() => !document.querySelector('#override-validation-dialog tr[data-override-id]'));
  await closeDialogs(c);
}

async function peekCorner(c) {
  await c.mutate('audit', { action: 'peek-wall', corner: true });
  await c.check({ visible: false }, false, 'corner-blocked');
  await c.player.bringToFront();
  const point = await c.player.evaluate(() => {
    const p = canvas.stage.toGlobal(new PIXI.Point(475, 450));
    return { x: p.x, y: p.y };
  });
  await c.player.mouse.move(point.x, point.y);
  try {
    await c.rpc(c.player, 'peekAudit', { fixture: c.fixture, action: 'corner' });
    await inspect(c, { peekActive: true, visible: true, peekIgnoresDoor: false }, true, 'corner-reveals-without-moving');
    await c.rpc(c.player, 'peekAudit', { fixture: c.fixture, action: 'corner' });
    await inspect(c, { peekActive: false, visible: false }, false, 'corner-toggle-restores');
    await c.rpc(c.player, 'peekAudit', { fixture: c.fixture, action: 'corner' });
    await inspect(c, { peekActive: true }, undefined, 'corner-restarted');
    await c.mutate('observer-move', { x: 300 });
    await inspect(c, { peekActive: false, visible: false }, false, 'movement-clears-corner');
  } finally { await c.rpc(c.player, 'cleanupAuditTransients', c.runId); }
}

async function peekDoor(c) {
  await c.setting('requireGmApprovalForDoorPeek', false);
  await c.setting('peekSlitAngle', 10); await c.setting('peekRange', 30);
  await c.mutate('audit', { action: 'peek-wall' });
  await c.check({ visible: false }, false, 'door-closed');
  await c.player.bringToFront();
  const { rect } = await c.rpc(c.player, 'snapshot', c.fixture);
  await c.player.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  try {
    await c.rpc(c.player, 'peekAudit', { fixture: c.fixture, action: 'door' });
    await inspect(c, { peekActive: true, peekFov: 10, peekRange: 600, peekIgnoresDoor: true, visible: true }, true, 'door-slit-reveals');
    await c.rpc(c.player, 'peekAudit', { fixture: c.fixture, action: 'door' });
    await inspect(c, { peekActive: false, visible: false }, false, 'door-toggle-restores');
    await c.rpc(c.player, 'peekAudit', { fixture: c.fixture, action: 'door' });
    await inspect(c, { peekActive: true }, undefined, 'door-restarted');
    await c.mutate('door', 1);
    await inspect(c, { peekActive: false, visible: true }, true, 'opening-door-clears-peek');
  } finally { await c.rpc(c.player, 'cleanupAuditTransients', c.runId); }
}

async function peekBlockMode(c, mode) {
  await c.setting('playerPeekBlockMode', mode);
  await c.setting('requireGmApprovalForDoorPeek', false);
  await c.setting('peekSlitAngle', 10);
  await c.setting('peekRange', 30);

  const verify = async kind => {
    const blocked = mode === 'both' || mode === kind;
    await c.mutate('audit', { action: 'peek-wall', corner: kind === 'corner' });
    await c.player.bringToFront();
    if (kind === 'corner') {
      const point = await c.player.evaluate(() => {
        const p = canvas.stage.toGlobal(new PIXI.Point(475, 450));
        return { x: p.x, y: p.y };
      });
      await c.player.mouse.move(point.x, point.y);
    } else {
      const { rect } = await c.rpc(c.player, 'snapshot', c.fixture);
      await c.player.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    }

    await c.rpc(c.player, 'peekAudit', { fixture: c.fixture, action: kind });
    if (blocked) await c.player.waitForTimeout(350);

    const expected = {
      peekActive: !blocked,
      peekPending: 0,
      ...(blocked ? { visible: false } : {}),
    };
    await c.check(expected, !blocked, `player-${mode}-${kind}-${blocked ? 'blocked' : 'allowed'}`, {
      probe: 'audit', session: 'player',
    });
    await c.check({ peekActive: !blocked }, undefined,
      `gm-observes-${mode}-${kind}-${blocked ? 'blocked' : 'allowed'}`, {
        probe: 'audit', session: 'gm',
      });

    if (!blocked) await c.rpc(c.player, 'peekAudit', { fixture: c.fixture, action: 'end' });
    await c.check({ peekActive: false }, undefined, `player-${mode}-${kind}-cleared`, {
      probe: 'audit', session: 'player',
    });
    await c.check({ peekActive: false }, undefined, `gm-observes-${mode}-${kind}-cleared`, {
      probe: 'audit', session: 'gm',
    });
  };

  try {
    await verify('corner');
    await verify('door');
  } finally {
    await c.rpc(c.player, 'cleanupAuditTransients', c.runId);
  }
}
