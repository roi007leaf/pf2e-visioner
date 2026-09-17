import { actionDialog, closeDialogs, managerSet, dragPreview, dragWithWaypoint, unfilter } from './ui-workflows.mjs';

export async function levelsPillar(c) {
  await c.mutate('pillar');
  await c.mutate('native-levels');
  await c.mutate('tile');
  await c.check({ visible: false }, false);
  await c.mutate('observer-move', { x: 400, y: 100 });
  await c.check({ state: 'observed', visible: true, filter: null }, true);
  await c.mutate('observer-move', { x: 400, y: 500 });
  await c.check({ visible: false }, false);
  await c.mutate('walls-delete');
  await c.check({ state: 'observed', visible: true }, true);
  await c.mutate('state', 'hidden');
  await c.check({ state: 'hidden' }, false);
  await managerSet(c, 'avs'); await closeDialogs(c);
  await c.check({ state: 'observed', filter: null }, true);
}
export async function floorOcclusion(c) {
  await c.mutate('native-levels'); await c.mutate('floor');
  await c.check({ visible: false, floorCount: 1 }, false);
  await c.mutate('observer-move', { x: 400, y: 100 });
  await c.mutate('target-token', { x: 800, y: 100 });
  await c.check({ state: 'observed', visible: true }, true, 'opening');
  // Change floors through the opening before moving across the upper floor.
  // A diagonal move through the solid surface is correctly stopped by Foundry.
  await c.mutate('observer-move', { elevation: 10 });
  await c.mutate('observer-move', { x: 400, y: 500 });
  await c.mutate('target-token', { x: 800, y: 500 });
  await c.check({ state: 'observed', filter: null }, true, 'same-level');
  await c.mutate('observer-move', { y: 100 });
  await c.mutate('observer-move', { elevation: 0 });
  await c.mutate('observer-move', { y: 500 });
  await c.check({ visible: false }, false, 'below-floor');
  await c.mutate('floor', { remove: true });
  await c.check({ floorCount: 0, state: 'observed', visible: true }, true, 'floor-deleted');
}
export async function regionVisibility(c) {
  await c.mutate('combat');
  await c.mutate('move', 1100);
  await c.mutate('region', { type: 'Visibility', system: { visibilityState: 'hidden' } });
  await c.check({ state: 'observed' }, true, 'outside-region');
  await c.mutate('move', 800);
  await c.check({ state: 'hidden' }, false);
  await c.mutate('move', 1100); await c.check({ state: 'observed' }, true);
  await c.mutate('move', 800); await c.check({ state: 'hidden' }, false);
  await c.mutate('next-turn'); await c.check({ state: 'hidden' }, false);
  await c.mutate('region-edit', { disabled: true });
  await c.check({ state: 'observed' }, true);
  await c.mutate('region-edit', { disabled: false }); await c.check({ state: 'hidden' }, false);
  await c.mutate('state', 'undetected');
  await c.mutate('remove-regions'); await c.check({ state: 'undetected' }, false);
  await c.mutate('reset-override'); await c.check({ state: 'observed' }, true);
}
export async function combatWallTurnMovement(c) {
  // Begin on the same side of a closed wall so both directions have a known,
  // observed baseline before either combatant moves.
  await c.mutate('target-token', { x: 500, y: 500 });
  await c.mutate('wall-segment');
  await c.mutate('gm-observer-view', true);
  await c.mutate('combat');
  await c.check({ state: 'observed', reverseState: 'observed', visible: true }, undefined, 'combat-start-mutual-visibility');

  // The first combatant crosses the wall. The observer must retain the AVS
  // relationship as Undetected rather than losing or revealing the target.
  await dragWithWaypoint(c, { subject: 'target', waypoint: { x: 500, y: 1200 }, to: { x: 800, y: 500 } });
  await c.check({ state: 'undetected', visible: false, meshVisible: false, meshRenderable: false }, undefined, 'first-token-behind-wall');

  // Exercise the real turn hook before the other combatant moves through the
  // wall. This is the stale-observer regression sequence from live play.
  await c.mutate('next-turn');
  await c.check({ state: 'undetected', visible: false, meshVisible: false, meshRenderable: false }, undefined, 'after-turn-transition');
  await dragWithWaypoint(c, { subject: 'observer', waypoint: { x: 400, y: 1200 }, to: { x: 700, y: 500 } });
  await c.check({ state: 'observed', reverseState: 'observed', visible: true }, undefined, 'second-mover-sees-first');
  await c.check({ state: 'observed', visible: true, meshVisible: true, meshRenderable: true }, undefined, 'gm-observer-renders-first', { session: 'gm' });
}
export async function geometryCover(c, type) {
  await c.mutate('cover-geometry', { type });
  const allowGreater = await c.gm.evaluate(() => game.settings.get('pf2e-visioner', 'wallCoverAllowGreater'));
  c.equal(typeof allowGreater, 'boolean', 'Greater wall/tile cover configuration is available');
  for (const cover of ['lesser', 'standard', 'greater', 'none']) {
    await c.mutate('cover-config', { type });
    const config = c.gm.locator(type === 'wall' ? '#pf2e-visioner-wall-quick' : '.application, .window-app')
      .filter({ has: c.gm.locator('[data-cover-override]') }).last();
    await config.waitFor();
    await config.locator(`[data-cover-override="${cover}"]`).click();
    await config.locator(type === 'wall' ? '[data-action="apply"]' : 'button[type="submit"]').click();
    const expected = cover === 'greater' && !allowGreater ? 'standard' : cover;
    await c.check({ [type === 'wall' ? 'wallCover' : 'tileCover']: cover, autoCover: expected }, undefined, `saved-${cover}-allow-greater-${allowGreater}`);
    await c.mutate('cover-config', { type });
    const selected = c.gm.locator(`[data-cover-override="${cover}"].active`).last();
    c.assert(await selected.isVisible(), `${type} saved ${cover} control survives reopening`);
    await c.mutate('close-apps');
    // Native tile config is not a Visioner application.
    if (type === 'tile') await c.gm.evaluate(() => canvas.scene.tiles.contents[0].sheet.close());
  }
  if (type === 'tile') {
    await c.mutate('observer-move', { y: 100 }); await c.mutate('target-token', { y: 100 });
    await c.check({ autoCover: 'none' });
  }
  await c.mutate('api-cover', 'greater'); await c.check({ cover: 'greater' });
  await c.mutate('api-cover', 'none'); await c.check({ cover: 'none' });
}
export async function takeCover(c) {
  await c.mutate('combat'); await c.mutate('strike-item');
  await c.mutate('cover-geometry', { type: 'wall', cover: 'standard' });
  for (const trigger of ['move', 'strike', 'manual']) {
    await c.mutate('cover', 'standard');
    await c.check({ autoCover: 'standard' });
    let dialog = await actionDialog(c, 'take-cover');
    // Bulk Apply intentionally closes this dialog. Individual Apply retains
    // the original result and its real row-level Revert control.
    await dialog.locator(trigger === 'manual' ? `[data-action="applyChange"][data-token-id="${c.fixture.observer}"]` : '[data-action="applyAll"]').click();
    await c.check({ cover: 'greater', takeCoverActive: true });
    // Take Cover has no automatic start-of-turn expiry.
    await c.mutate('next-turn'); await c.check({ cover: 'greater', takeCoverActive: true });
    if (trigger === 'manual') {
      await dialog.evaluate(async element => {
        const apps = new Set([...Object.values(ui.windows), ...(foundry.applications.instances?.values?.() ?? [])]);
        const app = [...apps].find(a => a.element === element || a.element?.[0] === element);
        if (!app) throw Error('Native Take Cover dialog is no longer open');
        await app.bringToFront();
      });
      await dialog.locator(`[data-action="revertChange"][data-token-id="${c.fixture.observer}"]`).click();
    }
    else {
      await closeDialogs(c);
      await c.mutate(trigger === 'move' ? 'target-token' : 'strike', trigger === 'move' ? { y: 600 } : {});
      const accept = c.gm.locator('[data-action="pf2e-visioner-take-cover-expiration-accept"]').last();
      await accept.waitFor(); await accept.click();
    }
    await c.check({ takeCoverActive: false, cover: trigger === 'manual' ? 'standard' : 'none', autoCover: 'standard' });
    await closeDialogs(c); await c.mutate('target-token', { y: 500 });
  }
}
export async function diversion(c) {
  await c.mutate('combat');
  for (const [total, expected] of [[60, 'hidden'], [-50, 'observed']]) {
    const dialog = await actionDialog(c, 'create-a-diversion', total);
    await dialog.locator('[data-action="applyAll"]').click();
    await c.check({ state: expected }, expected === 'observed');
    if (expected !== 'observed') await dialog.locator('[data-action="revertAll"]').click();
    else if (await dialog.locator('[data-action="revertAll"]').isEnabled()) await dialog.locator('[data-action="revertAll"]').click();
    await c.check({ state: 'observed' }, true);
    await closeDialogs(c);
  }
}
export async function pointOut(c) {
  await c.mutate('combat');
  const second = { observer: c.fixture.secondObserver };
  await c.mutate('state', 'undetected', second);
  await c.mutate('select', { subject: 'observer', target: 'target' });
  const dialog = await actionDialog(c, 'point-out', 40, { subject: 'observer' });
  await dialog.locator('[data-action="applyAll"]').click();
  await c.check({ state: 'observed', secondState: 'hidden' }, true);
  await c.rpc(c.player, 'view', { ...c.fixture, ...second });
  await c.check({ state: 'hidden' }, false, 'recipient-rendering', second);
  await dialog.locator('[data-action="revertAll"]').click();
  await c.check({ state: 'undetected', visible: false }, false, 'recipient-reverted', second);
  await c.rpc(c.player, 'view', c.fixture);
  await c.check({ state: 'observed', secondState: 'undetected' }, true);
  await closeDialogs(c);
}
export async function searchExploration(c, initial = 'undetected') {
  await c.mutate('target-data', { 'system.skills.stealth.base': 0 });
  await c.mutate('state', initial);
  for (const [total, expected] of [[60, 'observed'], [-50, initial]]) {
    await c.mutate('search', { total });
    const dialog = c.gm.locator('.seek-preview-dialog').last(); await dialog.waitFor(); await unfilter(dialog);
    await dialog.locator('[data-action="applyAll"]').click();
    await c.check({ state: expected }, expected === 'observed');
    if (expected !== initial) await dialog.locator('[data-action="revertAll"]').click();
    else if (await dialog.locator('[data-action="revertAll"]').isEnabled()) await dialog.locator('[data-action="revertAll"]').click();
    await c.check({ state: initial }, false); await closeDialogs(c);
  }
  await c.mutate('move', 1600); await c.mutate('search', { range: 10 });
  c.equal(await c.gm.locator('.seek-preview-dialog').count(), 0, 'Out-of-range Search produces no target results');
}
export async function sharedVision(c) {
  await c.mutate('link-spotter'); await c.check({ hasSpotter: true });
  await c.mutate('link-spotter', { clear: true }); await c.check({ hasSpotter: false });
  await c.mutate('condition', 'blinded'); await c.mutate('condition', 'deafened');
  await c.check({ visible: false }, false);
  await c.mutate('link-vision'); await c.check({ hasVisionMaster: true, state: 'undetected', secondState: 'observed', visible: true, filter: null }, true);
  await c.mutate('second-condition', 'blinded'); await c.mutate('second-condition', 'deafened');
  await c.check({ visible: false }, false);
  await c.mutate('second-condition', 'blinded'); await c.check({ state: 'undetected', secondState: 'observed', visible: true, filter: null }, true);
  await c.mutate('link-vision', { clear: true }); await c.check({ hasVisionMaster: false, visible: false }, false);
  await c.mutate('link-vision'); await c.mutate('delete-partner');
  delete c.fixture.secondObserver;
  await c.check({ hasVisionMaster: false, visible: false }, false);
}
export async function compatibility(c) {
  await managerSet(c, 'hidden'); await c.check({ state: 'hidden' }, false);
  await managerSet(c, 'avs'); await closeDialogs(c); await c.check({ state: 'observed' }, true);
  await dragPreview(c); await c.mutate('walls-delete');
  for (const page of [c.gm, c.player]) {
    await page.reload(); await page.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready, null, { timeout: 90000 });
    await c.rpc(page, 'view', c.fixture);
  }
  c.equal(await c.gm.evaluate(() => game.user.isGM), true, 'GM role after reload');
  c.equal(await c.player.evaluate(() => game.user.isGM), false, 'Player role after reload');
  await c.check({ state: 'observed', filter: null }, true);
}
