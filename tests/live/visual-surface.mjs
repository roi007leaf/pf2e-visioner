// Keep known campaign UI from being mistaken for missing token artwork.
export async function prepareVisualSurface(page) {
  const sync = page.locator('[role="dialog"], .application, .window-app')
    .filter({ hasText: 'You have new GM-enforced settings. A reload is required.' }).last();
  if (await sync.count() && await sync.isVisible()) {
    await sync.getByRole('button', { name: 'Later', exact: true }).click();
  }
  await page.evaluate(async () => {
    const apps = new Set([...Object.values(ui.windows), ...(foundry.applications.instances?.values?.() ?? [])]);
    for (const app of apps) {
      // Only this runner's browser, and only a panel spawned by combat hooks.
      const element = app.element?.[0] ?? app.element;
      if (/pf2e-combater/i.test(app.id ?? '') || element?.className?.includes?.('pf2e-combater') ||
          element?.querySelector?.('.combater-header-loadout')) await app.close();
      // A delayed native initiative prompt may arrive on the player after a
      // fixture encounter starts. Cancel only prompts naming a tagged actor.
      const title = String(app.title ?? '');
      const run = canvas.scene?.getFlag('pf2e-visioner', 'liveTestRun');
      if (run && title.startsWith("Stealth's Initiative - ") && canvas.tokens.placeables.some(t =>
        t.actor?.getFlag('pf2e-visioner', 'liveTestRun') === run && title.endsWith(t.name))) await app.close();
    }
  });
}

export async function verifySamplingArea(page, rect) {
  const blockers = await page.evaluate(rect => [0.3, 0.5, 0.7].map(fraction => {
    const x = rect.x + rect.width * fraction, y = rect.y + rect.height * 0.5;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return 'outside viewport';
    const element = document.elementFromPoint(x, y);
    if (element?.tagName === 'CANVAS') return null;
    return element ? `${element.tagName}#${element.id}.${String(element.className).slice(0, 80)}` : 'no canvas';
  }).filter(Boolean), rect);
  if (blockers.length) throw Error(`Visual test area obstructed: ${blockers.join(', ')}`);
}
