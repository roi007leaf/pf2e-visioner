import { actionDialog, closeDialogs, clickChatAction, clickAnimated, unfilter } from './ui-workflows.mjs';

export const actionGapWorkflows = {
  ...Object.fromEntries(['hide', 'sneak', 'seek'].map(action =>
    [`action-gap-degrees-${action}`, c => actionDegrees(c, action)])),
  ...Object.fromEntries(['combat', 'exploration', 'transition'].map(mode =>
    [`action-gap-range-${mode}`, c => seekRange(c, mode)])),
  ...Object.fromEntries(['start', 'end', 'legendary-sneak', 'very-very-sneaky'].map(mode =>
    [`action-gap-position-${mode}`, c => sneakPosition(c, mode)])),
  ...Object.fromEntries(['single', 'bulk', 'end-turn-cover', 'end-turn-open'].map(mode =>
    [`action-gap-sneak-${mode}`, c => deferredSneak(c, mode)])),
  ...Object.fromEntries(['circle', 'cone', 'cancel-config', 'cancel-placement', 'clamp', 'remove-existing'].map(mode =>
    [`action-gap-seek-${mode}`, async c => {
      try { await seekTemplate(c, mode); }
      catch (error) {
        try { await c.check({}, undefined, 'seek-failure-before-client-cleanup', { session: 'gm' }); } catch {}
        throw error;
      }
      finally {
        // Reset client-side pending placement listeners even when a cancellation
        // regression leaves them registered. Persistent fixtures use the journal.
        await c.gm.reload();
        await c.gm.waitForFunction(() => game.ready && canvas.ready);
        await c.rpc(c.gm, 'view', c.fixture);
      }
    }])),
};

async function actionDegrees(c, action) {
  await c.setting('autoVisibilityEnabled', false);
  await c.setting('seekUseTemplate', false);
  await c.setting('limitSeekRangeInCombat', false);
  await c.setting('limitSeekRangeOutOfCombat', false);
  await c.mutate('combat');
  await c.mutate('cover', 'standard');
  await c.mutate('target-data', { 'system.skills.stealth.base': 17 });
  const dc = await c.gm.evaluate(({ f, action }) => action === 'seek'
    ? canvas.tokens.get(f.target).actor.skills.stealth.dc.value
    : canvas.tokens.get(f.observer).actor.perception.dc.value, { f: c.fixture, action });
  c.assert(Number.isFinite(dc), 'Native PF2e DC available independently of Visioner outcomes');
  const initial = action === 'hide' ? 'observed' : action === 'sneak' ? 'hidden' : 'undetected';
  const failures = [];
  const boundaries = [[-11, 'critical-failure'], [-10, 'critical-failure'], [-9, 'failure'], [-1, 'failure'],
    [0, 'success'], [9, 'success'], [10, 'critical-success']];
  for (const [offset, degree] of boundaries) {
    try {
    // Hide's standard cover adds +2 to the supplied base roll. Keep expected
    // effective margins independent of the module's degree calculator.
    const total = dc + offset - (action === 'hide' ? 2 : 0);
    c.assert(![1, 20].includes(total), 'Fixed-total boundary does not imply a natural 1 or 20');
    await c.mutate('state', initial);
    const dialog = await actionDialog(c, action, total);
    const rowId = action === 'seek' ? c.fixture.target : c.fixture.observer;
    const row = dialog.locator(`tr[data-token-id="${rowId}"], tr[data-target-id="${rowId}"]`).first();
    await row.waitFor();
    const label = degree.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
    const rowText = await row.locator('td.outcome').innerText();
    c.assert(rowText.trim() === label, `${action} native DC ${dc}, total ${total}: expected ${label}; row: ${rowText}`);
    const success = degree.includes('success');
    const expected = action === 'hide' ? (success ? 'hidden' : 'observed')
      : action === 'sneak' ? (success ? 'undetected' : degree === 'failure' ? 'hidden' : 'observed')
        : degree === 'critical-success' ? 'observed' : degree === 'success' ? 'hidden' : 'undetected';
    const apply = row.locator('[data-action="applyChange"]');
    if (expected !== initial || await apply.isVisible()) await clickAnimated(c.gm, apply);
    await c.check({ state: expected }, expected === 'observed', `${action}-${offset}-applied`);
    const revert = row.locator('[data-action="revertChange"]');
    if (expected !== initial || (await revert.isVisible() && await revert.isEnabled())) await clickAnimated(c.gm, revert);
    await c.check({ state: initial, cover: 'standard' }, initial === 'observed', `${action}-${offset}-restored`);
    } catch (error) { failures.push(`${action} DC ${offset}: ${error.message}`); }
    finally { await closeDialogs(c); }
  }
  c.assert(failures.length === 0, failures.join('\n'));
}

async function seekRange(c, mode) {
  await c.setting('autoVisibilityEnabled', false);
  await c.setting('seekUseTemplate', false);
  await c.setting('limitSeekRangeInCombat', true);
  await c.setting('limitSeekRangeOutOfCombat', true);
  const combat = mode === 'combat';
  await c.setting('customSeekDistance', combat || mode === 'transition' ? 30 : 10);
  await c.setting('customSeekDistanceOutOfCombat', mode === 'exploration' ? 30 : 10);
  if (combat) await c.mutate('combat');
  await c.mutate('target-data', { 'system.skills.stealth.base': 0 });
  const check = async (x, included, label) => {
    await c.mutate('move', x);
    await c.mutate('state', 'hidden');
    const geometry = await c.gm.evaluate(f => ({ grid: canvas.scene.grid.size,
      distance: canvas.scene.grid.distance, observerX: canvas.tokens.get(f.observer).document.x,
      targetX: canvas.tokens.get(f.target).document.x }), c.fixture);
    c.equal(geometry, { grid: 100, distance: 5, observerX: 400, targetX: x }, 'Known horizontal fixture distance');
    const dialog = await actionDialog(c, 'seek', 60);
    const row = dialog.locator(`tr[data-token-id="${c.fixture.target}"]`);
    c.equal(await row.count(), included ? 1 : 0, `${label}: range controls target inclusion`);
    if (included) {
      await clickAnimated(c.gm, row.locator('[data-action="applyChange"]'));
      await c.check({ state: 'observed' }, true, `${label}-apply`);
      await clickAnimated(c.gm, row.locator('[data-action="revertChange"]'));
    } else {
      const apply = dialog.locator('[data-action="applyAll"]');
      if (await apply.isEnabled()) await clickAnimated(c.gm, apply);
    }
    await c.check({ state: 'hidden' }, false, `${label}-preserved-or-restored`);
    await closeDialogs(c);
  };
  if (mode === 'transition') {
    await check(800, false, 'exploration-ten-foot-limit');
    await c.mutate('combat');
    await check(800, true, 'combat-thirty-foot-limit');
    await c.mutate('combat-delete');
    await check(800, false, 'encounter-ended-restores-exploration-limit');
  } else {
    await check(900, true, 'inside-thirty-feet');
    await check(1000, true, 'exactly-thirty-feet');
    await check(1100, false, 'outside-thirty-feet');
    await c.setting(combat ? 'limitSeekRangeInCombat' : 'limitSeekRangeOutOfCombat', false);
    await check(1100, true, 'disabled-active-limit-other-context-still-limited');
    await c.setting(combat ? 'limitSeekRangeInCombat' : 'limitSeekRangeOutOfCombat', true);
    await check(1100, false, 'reenabled-limit');
  }
}

async function sneakPosition(c, mode) {
  await c.setting('autoVisibilityEnabled', false);
  await c.setting('sneakAllowHiddenUndetectedEndPosition', false);
  await c.mutate('combat');
  const feat = !['start', 'end'].includes(mode);
  await c.mutate('cover', feat ? 'none' : 'standard');
  const phases = feat ? ['baseline', 'installed', 'removed'] : ['invalid', 'restored'];
  for (const phase of phases) {
    if (phase === 'installed') await c.mutate('feat-add', { slug: mode, subject: 'target' });
    if (phase === 'removed') await c.mutate('feat-delete', { slug: mode, subject: 'target' });
    await c.mutate('state', 'hidden');
    const dialog = await actionDialog(c, 'sneak', 60);
    const row = dialog.locator(`tr[data-token-id="${c.fixture.observer}"]`);
    await row.waitFor();
    if (!feat) {
      const control = row.locator(`[data-action="toggle${mode === 'start' ? 'Start' : 'End'}Position"]`);
      const qualifies = phase === 'restored';
      if ((await control.getAttribute('class')).includes('position-check') !== qualifies) {
        await clickAnimated(c.gm, control);
      }
      c.equal((await control.getAttribute('class')).includes('position-check'), qualifies, 'Position control reflects requested qualification');
    }
    const expected = phase === 'installed' || phase === 'restored' ? 'undetected' : 'observed';
    await clickAnimated(c.gm, row.locator('[data-action="applyChange"]'));
    await c.check({ state: expected }, expected === 'observed', `${mode}-${phase}-applied`);
    await clickAnimated(c.gm, row.locator('[data-action="revertChange"]'));
    await c.check({ state: 'hidden', cover: feat ? 'none' : 'standard' }, false, `${mode}-${phase}-undo`);
    await closeDialogs(c);
  }
}

async function deferred(c) {
  return c.gm.evaluate(async f => {
    const { default: tracker } = await import('/modules/pf2e-visioner/scripts/chat/services/TurnSneakTracker.js');
    return tracker.isObserverDeferred(canvas.tokens.get(f.target), canvas.tokens.get(f.observer));
  }, c.fixture);
}

async function deferredSneak(c, mode) {
  await c.setting('autoVisibilityEnabled', false);
  await c.mutate('combat');
  // Use the actual feat and encounter; do not seed a fabricated tracker entry.
  await c.mutate('feat-add', { slug: 'very-sneaky', subject: 'target' });
  await c.mutate('cover', 'standard'); await c.mutate('state', 'hidden');
  await c.gm.evaluate(async f => {
    const combat = game.combat;
    if (combat.scene.id !== f.scene || !combat.getFlag('pf2e-visioner', 'liveTestRun')) throw Error('Owned encounter required');
    await combat.update({ turn: combat.turns.findIndex(t => t.tokenId === f.target) });
  }, c.fixture);
  const dialog = await actionDialog(c, 'sneak', 60);
  await c.check({ state: 'hidden' }, false, 'Before deferring native Sneak');
  const row = dialog.locator(`tr[data-token-id="${c.fixture.observer}"]`);
  const end = row.locator('[data-action="toggleEndPosition"]');
  await end.waitFor();
  if ((await end.getAttribute('class')).includes('position-check')) await end.click();
  const defer = row.locator('[data-action="toggleDefer"]');
  await defer.waitFor({ state: 'visible' });
  c.equal(await defer.isEnabled(), true, 'Successful Sneaky check can defer failing end position');
  if (mode === 'bulk') await dialog.locator('[data-action="bulkDefer"]').click();
  else await clickAnimated(c.gm, defer);
  c.equal(await deferred(c), true, 'Native click registered deferred check');
  await c.check({ state: 'hidden' }, false, 'Deferring alone preserves visibility');
  if (mode === 'single' || mode === 'bulk') {
    if (mode === 'bulk') await dialog.locator('[data-action="bulkUndefer"]').click();
    else await clickAnimated(c.gm, defer);
    c.equal(await deferred(c), false, 'Undefer removes tracker entry');
    await c.check({ state: 'hidden', cover: 'standard' }, false, 'Undefer preserves original state');
    await closeDialogs(c);
    await c.mutate('next-turn');
    c.equal(await c.gm.locator('.sneak-preview-dialog').count(), 0, 'Undeferred check does not reopen at turn end');
    return;
  }
  await closeDialogs(c);
  await c.mutate('move', 900);
  await c.mutate('cover', mode === 'end-turn-cover' ? 'standard' : 'none');
  await c.mutate('next-turn');
  const validation = c.gm.locator('.sneak-preview-dialog').last();
  await validation.waitFor(); await unfilter(validation);
  c.assert((await validation.innerText()).includes('End'), 'Turn change opened deferred validation');
  await validation.locator('[data-action="applyAll"]').click();
  await closeDialogs(c);
  const expected = mode === 'end-turn-cover' ? 'hidden' : 'observed';
  await c.check({ state: expected, targetX: 900 }, expected === 'observed', 'End-position validation uses moved token');
  c.equal(await deferred(c), false, 'Turn-end processing clears deferred check');
}

async function seekTemplate(c, mode) {
  await c.mutate('combat');
  await c.setting('seekUseTemplate', true);
  await c.setting('seekTemplateSkipDialog', false);
  await c.setting('seekTemplateMaxPlacementDistance', mode === 'clamp' ? 10 : 0);
  await c.mutate('state', 'hidden');
  const hooks = () => Object.fromEntries(['createRegion', 'createMeasuredTemplate'].map(name => [name, Hooks.events[name]?.length ?? 0]));
  const initialHooks = await c.gm.evaluate(hooks);
  const before = await c.messages();
  await c.mutate('action-roll', { action: 'seek', subject: 'observer' });
  const message = (await c.messages()).findLast(m => m.roll && !before.some(b => b.id === m.id));
  c.assert(!!message, 'Native Seek roll created message');
  if (mode === 'remove-existing') {
    // Normal GM placement consumes its area when it opens results. Exercise the
    // separate existing-template removal path with a native document fixture.
    await c.gm.evaluate(async ({ fixture, messageId }) => {
      const scene = canvas.scene, run = scene.getFlag('pf2e-visioner', 'liveTestRun');
      if (!run || scene.id !== fixture.scene) throw Error('Owned QA scene required');
      const message = game.messages.get(messageId);
      if (message?.speaker?.scene !== fixture.scene) throw Error('Owned native Seek message required');
      await scene.createEmbeddedDocuments('Region', [{ name: 'QA Existing Seek Area',
        shapes: [{ type: 'circle', x: 650, y: 550, radius: 600 }],
        flags: { 'pf2e-visioner': { liveTestRun: run, seekPreviewManual: true,
          actorTokenId: fixture.observer, userId: game.userId, messageId } },
      }]);
      await message.update({ 'flags.pf2e-visioner.qaTemplateRefresh': true });
    }, { fixture: c.fixture, messageId: message.id });
    c.equal(await seekTemplateCount(c), 1, 'Existing native Seek template present');
    await clickChatAction(c.gm, `[data-message-id="${message.id}"] [data-action="remove-seek-template"]`);
    await c.gm.waitForFunction(() => ![...canvas.scene.regions, ...canvas.scene.templates]
      .some(t => t.getFlag('pf2e-visioner', 'seekPreviewManual')));
    c.equal(await seekTemplateCount(c), 0, 'Remove button deletes existing native template');
    await c.check({ state: 'hidden' }, false, 'Removing template preserves visibility');
    return;
  }
  await clickChatAction(c.gm, `[data-message-id="${message.id}"] [data-action="setup-seek-template"]`);
  const config = c.gm.locator('.seek-template-config-dialog').last();
  await config.waitFor();
  if (mode === 'cancel-config') await config.locator('[data-action="cancel"]').click();
  else {
    await config.locator(`[data-template-type="${mode === 'cone' ? 'cone' : 'circle'}"]`).click();
    await config.locator('#template-radius').fill('30');
    await config.locator('.seek-template-submit').click();
    await config.waitFor({ state: 'hidden' });
    await c.gm.waitForFunction(initial => (Hooks.events.createRegion?.length ?? 0) > initial.createRegion, initialHooks);
    await c.gm.bringToFront();
    const point = await c.gm.evaluate(({ mode }) => {
      const p = canvas.stage.toGlobal(new PIXI.Point(mode === 'clamp' ? 1350 : 650, 550));
      return { x: p.x, y: p.y };
    }, { mode });
    await c.gm.mouse.move(point.x, point.y);
    await c.check({}, undefined, 'seek-placement-preview', { session: 'gm' });
    if (mode === 'cancel-placement') await c.gm.mouse.click(point.x, point.y, { button: 'right' });
    else await c.gm.mouse.click(point.x, point.y);
  }
  if (mode.startsWith('cancel')) {
    await c.gm.waitForFunction(() => !(canvas.templates?.preview?.children?.length) && !(canvas.regions?.preview?.children?.length));
    const count = await seekTemplateCount(c);
    c.equal(count, 0, 'Cancellation leaves no persistent Seek template');
    c.equal(await c.gm.locator('.seek-preview-dialog').count(), 0, 'Cancellation never opens Seek results');
    // Give asynchronous native cancellation cleanup a bounded settling window.
    await c.gm.waitForFunction(initial => Object.entries(initial).every(([name, count]) =>
      (Hooks.events[name]?.length ?? 0) === count), initialHooks, { timeout: 5000 }).catch(() => {});
    c.equal(await c.gm.evaluate(hooks), initialHooks, 'Cancellation releases Seek creation hooks');
    await c.check({ state: 'hidden' }, false, 'Cancelled template preserves visibility');
  } else {
    await c.gm.waitForFunction(() => [...canvas.scene.regions, ...canvas.scene.templates]
      .some(t => t.getFlag('pf2e-visioner', 'seekPreviewManual')) || !!document.querySelector('.seek-preview-dialog'));
    const template = await c.gm.evaluate(async () => {
      const module = await import('/modules/pf2e-visioner/scripts/chat/services/preview/seek-template.js');
      const document = module.findSeekTemplateDocument();
      const { SeekPreviewDialog } = await import('/modules/pf2e-visioner/scripts/chat/dialogs/SeekPreviewDialog.js');
      const data = SeekPreviewDialog.currentSeekDialog?.actionData;
      return document ? module.getTemplateStateFromDocument(document) : data ? {
        templateType: data.seekTemplateType, center: data.seekTemplateCenter,
      } : null;
    });
    c.assert(!!template, 'Placement created native Seek template');
    c.equal(template.templateType, mode === 'cone' ? 'cone' : 'circle', 'Placed shape matches configuration');
    if (mode === 'clamp') c.assert(Math.hypot(template.center.x - 450, template.center.y - 550) <= 201, 'Placement clamped to ten feet from observer');
    {
      const results = c.gm.locator('.seek-preview-dialog').last();
      await results.waitFor(); await unfilter(results);
      c.assert(await results.locator(`[data-token-id="${c.fixture.target}"]`).count() > 0, 'Placed area includes intended target in Seek results');
      c.equal(await seekTemplateCount(c), 0, 'Opening results consumes temporary Seek template');
      await c.check({}, undefined, 'placed-template-results', { session: 'gm' });
    }
  }
  await closeDialogs(c);
}

async function seekTemplateCount(c) {
  return c.gm.evaluate(() => [...canvas.scene.regions, ...canvas.scene.templates]
    .filter(t => t.getFlag('pf2e-visioner', 'seekPreviewManual')).length);
}
