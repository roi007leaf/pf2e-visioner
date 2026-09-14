// Browser gestures/measurements stay in the runner; no fixture API fabricates
// these observations or changes production render methods.
import { prepareVisualSurface } from './visual-surface.mjs';
export async function targetGesture(page, fixture, toggle) {
  await page.bringToFront();
  const rect = await page.evaluate(id => {
    const t = canvas.tokens.get(id), p = t.getGlobalPosition(), scale = canvas.stage.scale.x;
    return { x: p.x + t.w * scale / 2, y: p.y + t.h * scale / 2 };
  }, fixture.target);
  // Each step requests a fresh hover gesture, including after a hidden token
  // reappears underneath the previous pointer position.
  await page.mouse.move(10, 150);
  await page.mouse.move(rect.x, rect.y);
  await page.waitForTimeout(100);
  if (toggle) await page.keyboard.press('t');
}

export async function animateAndMeasure(gmPage, playerPage, fixture, config) {
  await playerPage.bringToFront();
  await playerPage.evaluate(id => {
    const t = canvas.tokens.get(id);
    const sample = { frames: [], positions: [], last: performance.now(), started: performance.now() };
    window.visionerQaFrames = sample;
    const tick = now => {
      sample.frames.push(now - sample.last); sample.last = now; sample.positions.push(t.x);
      sample.handle = requestAnimationFrame(tick);
    };
    sample.handle = requestAnimationFrame(tick);
  }, fixture.target);
  let data;
  try {
    await gmPage.evaluate(async ({ fixture, config }) => {
      const token = canvas.tokens.get(fixture.target);
      const run = canvas.scene?.getFlag('pf2e-visioner', 'liveTestRun');
      if (canvas.scene?.id !== fixture.scene || !run || token.document.getFlag('pf2e-visioner', 'liveTestRun') !== run) throw Error('Fixture required');
      await token.document.update({ x: config.x }, { animate: true, animation: { duration: config.duration } });
    }, { fixture, config });
    await playerPage.waitForTimeout(config.duration + 800);
  } finally {
    data = await playerPage.evaluate(() => {
      const data = window.visionerQaFrames;
      if (!data) return null;
      cancelAnimationFrame(data.handle); delete window.visionerQaFrames;
      return { frames: data.frames, positions: data.positions };
    });
  }
  const frames = data.frames.slice(2).sort((a, b) => a - b);
  const p95 = frames[Math.floor(frames.length * 0.95)], max = frames.at(-1);
  const intermediatePositions = new Set(data.positions.filter(x => x !== data.positions[0] && Math.abs(x - config.x) > 1)).size;
  const measurement = { samples: frames.length, p95FrameMs: p95, maxFrameMs: max, intermediatePositions, finalX: data.positions.at(-1), limits: config };
  return { ...measurement, passed: frames.length >= 10 && intermediatePositions >= 2 && Math.abs(measurement.finalX - config.x) < 1 && p95 <= config.maxP95FrameMs && max <= config.maxFrameMs };
}

export async function reconnectPlayer({ page, gmPage, fixture, runId, state, rpc }) {
  const context = page.context();
  try {
    await context.setOffline(true);
    // Reload offline deliberately closes the old websocket. A browser offline
    // toggle alone does not reliably close an already established connection.
    await page.reload({ timeout: 10000 }).catch(error => {
      if (!/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|NS_ERROR_OFFLINE/.test(error.message)) throw error;
    });
    await rpc(gmPage, 'mutate', { fixture, runId, operation: 'state', value: state });
  } finally { await context.setOffline(false); }
  await page.reload();
  await page.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready && game.socket?.connected, null, { timeout: 90000 });
}

export async function interactiveMutation(page, operation, value, start, diagnose = async () => {}) {
  if (!['action-roll', 'strike', 'initiative', 'hide', 'seek', 'sneak'].includes(operation)) return start();
  const started = Date.now();
  const originalApps = await page.evaluate(() => [...new Set([...Object.values(ui.windows), ...(foundry.applications.instances?.values?.() ?? [])])].map(a => a.id));
  let done = false, failure, output;
  // The operation can await a native roll dialog. Drive only known roll/cover
  // controls while retaining and awaiting the actual mutation promise.
  const pending = start().then(result => { output = result; }, error => { failure = error; }).finally(() => { done = true; });
  let uiFailure;
  try {
    while (!done) {
      await prepareVisualSurface(page);
      const cover = page.locator('.pv-cover-quick-override').last();
      if (await cover.count() && await cover.isVisible()) {
        if (value?.cover !== undefined) await cover.locator(`[data-state="${value.cover}"]`).click();
        await cover.locator('[data-action="roll"]').click();
      }
      const roll = page.locator('.check-modifiers-content button[type="submit"]').last();
      if (await roll.count() && await roll.isVisible()) await roll.click();
      if (operation === 'action-roll' && value?.action === 'take-cover') {
        const choice = await page.evaluate(async () => {
          const run = canvas.scene?.getFlag('pf2e-visioner', 'liveTestRun');
          const apps = new Set([...Object.values(ui.windows), ...(foundry.applications.instances?.values?.() ?? [])]);
          const app = [...apps].find(a => run && a.item?.actor?.getFlag('pf2e-visioner', 'liveTestRun') === run &&
            a.item?.sourceId?.endsWith('.I9lfZUiCwMiGogVi') && Array.isArray(a.choices) && a.element?.id);
          if (!app) return null;
          const index = app.choices.findIndex(c => c.value?.level === 'greater');
          if (index < 0) throw Error('Native Take Cover prompt has no greater-cover choice');
          // Combat hooks can reopen their panel after it was closed. Raising
          // the actual native prompt preserves normal pointer hit-testing.
          await app.bringToFront();
          return { selector: `#${CSS.escape(app.element.id)}`, index };
        });
        if (choice) {
          try { await page.locator(`${choice.selector} .choice-buttons .select-button`).nth(choice.index).click({ timeout: 1000 }); }
          catch (error) { if (error.name !== 'TimeoutError') throw error; }
        }
      }
      if (!done && Date.now() - started > 30000) throw Error(`Native ${operation} did not finish after automatic prompt handling`);
      await Promise.race([pending, new Promise(resolve => setTimeout(resolve, 100))]);
    }
  } catch (error) {
    uiFailure = error;
    try {
      const prompts = await page.evaluate(() => [...new Set([...Object.values(ui.windows), ...(foundry.applications.instances?.values?.() ?? [])])]
        .filter(a => a.element?.getClientRects?.().length).map(a => ({ id: a.id, title: a.title, source: a.item?.sourceId,
          actorRun: a.item?.actor?.getFlag('pf2e-visioner', 'liveTestRun'), choices: a.choices })));
      uiFailure.message += `; open prompts: ${JSON.stringify(prompts)}`;
      await diagnose(uiFailure);
      // Closing an unanswered prompt ends the native action promise; it does
      // not count as a successful choice. Only prompts opened by this operation
      // for an owned QA actor are eligible, and the case remains failed.
      await page.evaluate(async before => {
        const run = canvas.scene?.getFlag('pf2e-visioner', 'liveTestRun');
        const apps = new Set([...Object.values(ui.windows), ...(foundry.applications.instances?.values?.() ?? [])]);
        for (const app of apps) if (!before.includes(app.id) && run &&
          (app.item?.actor ?? app.actor)?.getFlag?.('pf2e-visioner', 'liveTestRun') === run) await app.close();
      }, originalApps);
    } catch { /* The RPC timeout retains recovery if the browser is unavailable. */ }
  }
  await pending;
  if (failure || uiFailure) throw uiFailure ?? failure;
  return output;
}
