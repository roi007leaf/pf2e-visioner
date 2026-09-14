// Real DOM gestures. No verdict prompts, synthetic DOM clicks, or handler mocks.
export async function clickChatAction(page, selector) {
  await page.locator('#sidebar-tabs [data-tab="chat"]').click();
  const button = page.locator('#chat ' + selector).last();
  await button.waitFor({ state: 'visible' });
  await button.scrollIntoViewIfNeeded();
  await button.click();
}

export async function closeDialogs(c) { await c.mutate('close-apps'); }
export async function clickAnimated(page, button) {
  let box;
  const deadline = Date.now() + 5000;
  do {
    await button.waitFor({ state: 'visible', timeout: 5000 });
    // Foundry can replace the row after visibility resolves. Read bounds and
    // enabled/occlusion state together, retrying only a detached/hidden surface.
    const surface = await button.evaluate(el => {
      const r = el.getBoundingClientRect();
      if (!el.isConnected || !r.width || !r.height) return null;
      return { x: r.x, y: r.y, width: r.width, height: r.height,
        enabled: !el.matches(':disabled'),
        clear: el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
    });
    if (surface) {
      if (!surface.enabled) throw Error('Expected enabled action button');
      if (!surface.clear) throw Error('Action button is covered by another element');
      box = surface;
      break;
    }
    await page.waitForTimeout(50);
  } while (Date.now() < deadline);
  if (!box) throw Error('Action button has no rendered bounds');
  // Apply pulses continuously. Use a real pointer click at its visible centre,
  // after checking occlusion, instead of waiting forever for animation to stop.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
export async function unfilter(dialog) {
  for (const action of ['toggleEncounterFilter', 'toggleIgnoreAllies', 'toggleShowOnlyChanges', 'toggleFilterByDetection']) {
    const input = dialog.locator(`input[data-action="${action}"]`);
    if (await input.count() && await input.isChecked()) await input.uncheck();
  }
}
export async function managerSet(c, state, mode = 'observer', subject = 'observer', row = 'target') {
  await closeDialogs(c);
  await c.mutate('manager', mode, { observer: c.fixture[subject] });
  const dialog = c.gm.locator('.visioner-token-manager');
  await dialog.waitFor(); await unfilter(dialog);
  await dialog.locator(`[data-token-id="${c.fixture[row]}"] button[data-state="${state}"]`).click();
  await clickAnimated(c.gm, dialog.locator('[data-action="applyCurrent"]'));
}
export async function managerDirections(c) {
  await managerSet(c, 'hidden');
  await c.check({ state: 'hidden', reverseState: 'observed' }, false);
  await managerSet(c, 'undetected', 'target');
  await c.check({ state: 'hidden', reverseState: 'undetected' }, false);
  await managerSet(c, 'avs', 'target');
  await managerSet(c, 'avs');
  await closeDialogs(c);
  await c.check({ state: 'observed', reverseState: 'observed', filter: null, validationDialogs: 0, legacyMovementText: false }, true);
}

export async function drag(c, { commit = false, to = { x: 400, y: 100 } } = {}) {
  const page = c.player;
  await page.bringToFront();
  const points = await page.evaluate(({ fixture, to }) => {
    const token = canvas.tokens.get(fixture.observer);
    const origin = token.getGlobalPosition();
    const destination = canvas.stage.toGlobal(new PIXI.Point(to.x + token.w / 2, to.y + token.h / 2));
    return { from: { x: origin.x + token.w * canvas.stage.scale.x / 2, y: origin.y + token.h * canvas.stage.scale.y / 2 }, to: destination };
  }, { fixture: c.fixture, to });
  await page.mouse.move(points.from.x, points.from.y);
  await page.mouse.down();
  try {
    await page.mouse.move(points.to.x, points.to.y, { steps: 18 });
    await page.waitForFunction(() => canvas.tokens.preview.children.length > 0);
    await c.check({ observerX: 400, observerY: 500 }, undefined, 'held-document-position');
    if (!commit) {
      await c.check({ visible: false }, false, 'held-unseen-target');
      // Foundry cancels a held drag with right click.
      await page.mouse.click(points.to.x, points.to.y, { button: 'right' });
    }
  } finally { await page.mouse.up(); }
  await c.check(commit ? { observerX: to.x, observerY: to.y, clones: 0 } : { observerX: 400, observerY: 500, clones: 0 }, undefined, 'drag-finished');
}
export async function dragPreview(c) {
  await c.mutate('pillar');
  await c.check({ visible: false }, false);
  await drag(c);
  await c.check({ visible: false }, false);
  await drag(c, { commit: true });
  await c.check({ state: 'observed', visible: true, filter: null }, true);
  await c.mutate('observer-move', { x: 400, y: 500 });
  await c.check({ visible: false }, false);
}

export async function actionDialog(c, action, total = 40, options = {}) {
  await closeDialogs(c);
  // At least one native action roll must exist as well as deterministic branch
  // previews. The preview uses the production dispatcher and real Roll document.
  const native = action === 'create-a-diversion' ? 'create-a-diversion' : action;
  if (['hide', 'sneak', 'seek', 'create-a-diversion', 'point-out', 'take-cover'].includes(native)) {
    const before = await c.messages();
    await c.mutate('action-roll', { action: native, subject: options.subject });
    const after = await c.messages();
    c.assert(after.some(m => !before.some(b => b.id === m.id)), 'Native action created a new chat message');
    await closeDialogs(c);
  }
  await c.mutate('preview', { action, total, ...options });
  const css = action === 'create-a-diversion' ? 'create-a-diversion' : action;
  const dialog = c.gm.locator(`.${css}-preview-dialog`).last();
  await dialog.waitFor(); await unfilter(dialog);
  return dialog;
}
export async function applyRevert(c, action) {
  await c.mutate('combat');
  if (action === 'seek') await c.mutate('target-data', { 'system.skills.stealth.base': 0 });
  await c.mutate('cover', 'standard');
  const initial = action === 'seek' ? 'hidden' : action === 'sneak' ? 'hidden' : 'observed';
  const success = action === 'hide' ? 'hidden' : action === 'sneak' ? 'undetected' : 'observed';
  for (const [total, expected] of [[60, success], [-50, action === 'seek' ? initial : 'observed']]) {
    await c.mutate('state', initial);
    const dialog = await actionDialog(c, action, total);
    const rowId = action === 'seek' ? c.fixture.target : c.fixture.observer;
    const row = dialog.locator(`tr[data-token-id="${rowId}"], tr[data-target-id="${rowId}"]`).first();
    await row.waitFor();
    // Both individual and bulk controls must act on the same calculated result.
    await row.locator('[data-action="applyChange"]').click();
    await c.check({ state: expected }, expected === 'observed', `${action}-${total}-individual`);
    if (expected !== initial) {
      await row.locator('[data-action="revertChange"]').click();
      await c.check({ state: initial, cover: 'standard' }, initial === 'observed');
    }
    await dialog.locator('[data-action="applyAll"]').click();
    await c.check({ state: expected }, expected === 'observed', `${action}-${total}-all`);
    if (expected !== initial) {
      await dialog.locator('[data-action="revertAll"]').click();
      await c.check({ state: initial, cover: 'standard' }, initial === 'observed');
    } else {
      // A same-state action may still record an override that can be undone.
      const undo = dialog.locator('[data-action="revertAll"]');
      if (await undo.isEnabled()) await undo.click();
      await c.check({ state: initial, cover: 'standard' }, initial === 'observed', 'same-state-result-preserved');
    }
  }
  await closeDialogs(c);
}

export async function attackConsequences(c, initial = 'unnoticed') {
  await c.mutate('combat'); await c.mutate('state', initial);
  await c.mutate('strike-item');
  const before = await c.messages(); await c.mutate('strike');
  const message = (await c.messages()).findLast(m => m.roll && !before.some(b => b.id === m.id));
  c.assert(!!message, 'Native Strike produced an attack roll');
  await clickChatAction(c.gm, `[data-message-id="${message.id}"] [data-action="open-consequences-results"]`);
  const dialog = c.gm.locator('.consequences-preview-dialog').last();
  await dialog.waitFor(); await unfilter(dialog);
  await dialog.locator('[data-action="applyAll"]').click();
  await c.check({ state: 'observed', filter: null }, true);
  await dialog.locator('[data-action="revertAll"]').click();
  await c.check({ state: initial, ...(initial !== 'hidden' ? { visible: false } : {}) }, false);
  await managerSet(c, 'avs'); await closeDialogs(c);
  await c.check({ state: 'observed', validationDialogs: 0, legacyMovementText: false }, true);
}

export async function settingsMacros(c) {
  // The campaign clock may tick while the dialog is open. Compare settings,
  // excluding only the native clock value; never pause or rewind world time.
  const configuration = () => Object.fromEntries(game.settings.storage.get('world').filter(s => s.key !== 'core.time').map(s => [s.key, s.value]));
  const before = await c.gm.evaluate(configuration);
  await c.gm.evaluate(() => game.settings.sheet.render(true));
  const settings = c.gm.locator('#client-settings, #settings-config').first(); await settings.waitFor();
  const search = settings.locator('input[type="search"]');
  if (await search.count()) await search.fill('Visioner');
  c.assert(await settings.locator('[name^="pf2e-visioner."]').count() > 0, 'Visioner settings rendered');
  await settings.locator('[data-action="close"], .window-close, .header-control.close').first().click();
  c.equal(await c.gm.evaluate(configuration), before, 'Cancelling settings leaves world configuration unchanged');
  await c.mutate('select', { subject: 'observer', target: 'target' });
  await c.mutate('quick-panel');
  const panel = c.gm.locator('.pf2e-visioner-quick-panel, #pf2e-visioner-quick-panel').first();
  await panel.waitFor();
  for (const state of ['hidden', 'observed']) {
    await panel.locator(`[data-action="setVisibility"][data-state="${state}"]`).click();
    await c.check({ state }, state === 'observed');
  }
  for (const cover of ['standard', 'none']) {
    await panel.locator(`[data-action="setCover"][data-state="${cover}"]`).click();
    await c.check({ cover });
  }
  await closeDialogs(c);
}

export async function hazardLoot(c) {
  await c.mutate('hazard-manager');
  const dialog = c.gm.locator('#pf2e-visioner-hazard-loot-manager'); await dialog.waitFor();
  for (const state of ['undetected', 'observed', 'undetected', 'undetected']) {
    const row = dialog.locator(`tr[data-token-id="${c.fixture.target}"]`);
    await row.locator(`[data-state="${state}"]`).click();
    await dialog.locator('[data-action="apply"]').click();
    await c.check(state === 'observed' ? { visible: true } : { visible: false, visibilityBadge: false }, state === 'observed');
    await c.mutate('close-apps'); await c.mutate('hazard-manager');
  }
  await closeDialogs(c);
}
