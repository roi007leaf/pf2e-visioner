import { clickChatAction, unfilter } from './ui-workflows.mjs';

export async function playerSeekTemplate(c, message, mode) {
  const page = c.player;
  const hooks = () => Object.fromEntries(['createRegion', 'createMeasuredTemplate'].map(name => [name, Hooks.events[name]?.length ?? 0]));
  const initialHooks = await page.evaluate(hooks);
  try {
    await clickChatAction(page, `[data-message-id="${message.id}"] [data-action="setup-seek-template"]`);
    const config = page.locator('.seek-template-config-dialog').last();
    await config.waitFor();
    if (mode === 'cancel-config') await config.locator('[data-action="cancel"]').click();
    else {
      await config.locator(`[data-template-type="${mode === 'cone' ? 'cone' : 'circle'}"]`).click();
      await config.locator('#template-radius').fill('30');
      await config.locator('.seek-template-submit').click();
      await config.waitFor({ state: 'hidden' });
      await page.waitForFunction(initial => (Hooks.events.createRegion?.length ?? 0) > initial.createRegion, initialHooks);
      await page.bringToFront();
      const point = await page.evaluate(() => {
        const p = canvas.stage.toGlobal(new PIXI.Point(650, 550));
        return { x: p.x, y: p.y };
      });
      await page.mouse.move(point.x, point.y);
      await c.check({}, undefined, 'player-template-placement-preview');
      await page.mouse.click(point.x, point.y, mode === 'cancel-placement' ? { button: 'right' } : {});
    }
    if (mode.startsWith('cancel')) {
      await page.waitForFunction(() => !canvas.templates.preview.children.length && !canvas.regions.preview.children.length);
      await page.waitForFunction(initial => Object.entries(initial).every(([name, count]) => (Hooks.events[name]?.length ?? 0) === count), initialHooks);
      c.equal(await page.evaluate(hooks), initialHooks, 'Player cancellation releases creation hooks');
      c.equal(await c.gm.locator('.seek-preview-dialog').count(), 0, 'Cancelled player template never opens GM results');
      for (const session of ['gm', 'player']) await c.check({ state: 'hidden' }, undefined, 'cancel-preserves-state-' + session, { session });
    } else {
      await c.gm.waitForFunction(id => game.messages.get(id)?.getFlag('pf2e-visioner', 'seekTemplate')?.hasTargets, message.id);
      const pending = await c.gm.evaluate(id => game.messages.get(id).getFlag('pf2e-visioner', 'seekTemplate'), message.id);
      c.equal(pending.fromUserId, message.user, 'Pending template belongs to the player');
      c.equal(pending.templateType, mode, 'Pending template preserves player shape');
      await clickChatAction(c.gm, `[data-message-id="${message.id}"] [data-action="open-seek-results"]`);
      const results = c.gm.locator('.seek-preview-dialog').last();
      await results.waitFor(); await unfilter(results);
      const received = await c.gm.evaluate(async () => {
        const { SeekPreviewDialog } = await import('/modules/pf2e-visioner/scripts/chat/dialogs/SeekPreviewDialog.js');
        const data = SeekPreviewDialog.currentSeekDialog?.actionData;
        return data ? { messageId: data.messageId, type: data.seekTemplateType, total: data.roll?.total } : null;
      });
      c.assert(received?.messageId === message.id && received.type === mode, 'GM socket handoff preserves player message and template shape');
      c.assert(await results.locator(`[data-token-id="${c.fixture.target}"]`).count() > 0, 'Player-placed area includes intended target');
      c.equal(await page.locator('.seek-preview-dialog').count(), 0, 'Results remain GM-only');
      await results.locator('[data-action="applyAll"]').click();
      for (const session of ['gm', 'player']) await c.check({ state: 'observed' }, undefined, 'template-apply-' + session, { session });
      await c.check({ visible: true, filter: null }, true, 'player-template-reveals-art');
      await results.locator('[data-action="revertAll"]').click();
      for (const session of ['gm', 'player']) await c.check({ state: 'hidden' }, undefined, 'template-undo-' + session, { session });
      await clickChatAction(page, `[data-message-id="${message.id}"] [data-action="remove-seek-template"]`);
      for (const client of [c.gm, page]) await client.waitForFunction(id => !game.messages.get(id)?.getFlag('pf2e-visioner', 'seekTemplate'), message.id);
      c.assert(true, 'Player Remove Template clears pending message data on both clients');
    }
    for (const client of [c.gm, page]) {
      await client.waitForFunction(() => ![...canvas.scene.regions, ...canvas.scene.templates].some(t => t.getFlag('pf2e-visioner', 'seekPreviewManual')));
      c.equal(await client.evaluate(() => [...canvas.scene.regions, ...canvas.scene.templates].filter(t => t.getFlag('pf2e-visioner', 'seekPreviewManual')).length), 0, 'Player template leaves no persistent document');
    }
  } catch (error) {
    error.message += '; template diagnostics: ' + JSON.stringify(await c.gm.evaluate(id => ({
      pending: game.messages.get(id)?.getFlag('pf2e-visioner', 'seekTemplate'),
      panel: document.querySelector(`.pf2e-visioner-automation-panel[data-message-id="${id}"]`)?.outerHTML,
      templates: [...canvas.scene.regions, ...canvas.scene.templates].map(t => t.toObject()),
    }), message.id));
    throw new Error(error.message, { cause: error });
  } finally {
    // Native placement cancellation listeners are client-local. Reload even on
    // failure; the journal separately owns all persistent fixture documents.
    await page.reload();
    await page.waitForFunction(() => game.ready && canvas.ready);
    await c.rpc(page, 'view', c.fixture);
  }
}
