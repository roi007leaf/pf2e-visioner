import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const defaultsFile = path.join(homedir(), '.config', 'pf2e-visioner', 'live.json');
const defaults = JSON.parse(await readFile(defaultsFile, 'utf8'));
const url = (process.env.VISIONER_FOUNDRY_URL ?? defaults.url ?? 'https://localhost:30000').replace(/\/$/, '');
const username = process.env.VISIONER_GM_USER ?? defaults.gm?.username;
const password = process.env.VISIONER_GM_PASSWORD ?? defaults.gm?.password;
if (!username || password === undefined) throw Error('Saved GM credentials or VISIONER_GM_USER/PASSWORD required');

const runId = randomUUID();
const outputDirectory = path.resolve('artifacts', 'canvas-pan', runId);
await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: process.env.VISIONER_HEADLESS === '1', channel: process.env.VISIONER_BROWSER_CHANNEL || undefined });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, ignoreHTTPSErrors: new URL(url).hostname === 'localhost' });
const page = await context.newPage();
page.setDefaultTimeout(90000);
let profile;
try {
  await page.goto(`${url}/join`);
  const select = page.locator('select[name="userid"]');
  await page.locator('select[name="userid"], input[name="username"]').first().waitFor();
  if (await select.count()) {
    const options = await select.locator('option').evaluateAll(items => items.map(item => ({ label: item.textContent.trim(), value: item.value })));
    const account = options.find(item => item.label.toLowerCase() === username.trim().toLowerCase());
    if (!account) throw Error(`GM account not found: ${username}`);
    await select.selectOption(account.value);
  } else await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[name="join"]').click();
  await page.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready && !canvas.loading);
  const session = await page.evaluate(() => ({ world: game.world.id, user: game.user.name, isGM: game.user.isGM,
    scene: canvas.scene?.name, avs: game.settings.get('pf2e-visioner', 'autoVisibilityEnabled'),
    tokenCount: canvas.tokens.placeables.length, lightCount: canvas.lighting.placeables.length,
    wallCount: canvas.walls.placeables.length, cap: canvas.app.ticker.maxFPS,
    performanceMode: game.settings.get('core', 'performanceMode') }));
  if (!session.isGM) throw Error('GM account required');
  await page.evaluate(async () => {
    const original = { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y, scale: canvas.stage.scale.x };
    for (const dx of [300, -300, 300, -300]) {
      await canvas.animatePan({ x: original.x + dx, y: original.y, duration: 350 });
      await new Promise(resolve => setTimeout(resolve, 75));
    }
    await canvas.animatePan({ ...original, duration: 0 });
  });
  await page.waitForTimeout(2000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  const measurement = await page.evaluate(async () => {
    const renderer = canvas.app.renderer;
    const original = { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y, scale: canvas.stage.scale.x };
    const timestamps = [], longTasks = [];
    let canvasPanEvents = 0;
    const started = performance.now();
    const after = () => timestamps.push(performance.now() - started);
    const hook = Hooks.on('canvasPan', () => canvasPanEvents++);
    const observer = typeof PerformanceObserver === 'function' ? new PerformanceObserver(list => {
      longTasks.push(...list.getEntries().map(entry => ({ startMs: entry.startTime - started, durationMs: entry.duration })));
    }) : null;
    observer?.observe({ type: 'longtask' });
    renderer.on('postrender', after);
    try {
      for (const [dx, dy] of [[450, 0], [-450, 0], [0, 350], [0, -350], [450, 350], [-450, -350]]) {
        await canvas.animatePan({ x: original.x + dx, y: original.y + dy, duration: 650 });
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } finally {
      await canvas.animatePan({ ...original, duration: 0 });
      renderer.off('postrender', after);
      Hooks.off('canvasPan', hook);
      observer?.disconnect();
    }
    const durationMs = performance.now() - started;
    const gaps = timestamps.slice(1).map((value, index) => value - timestamps[index]);
    const sorted = [...gaps].sort((a, b) => a - b);
    return { durationMs, frames: timestamps.length, averageFps: timestamps.length * 1000 / durationMs,
      p95FrameMs: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? durationMs,
      p99FrameMs: sorted[Math.max(0, Math.ceil(sorted.length * 0.99) - 1)] ?? durationMs,
      worstGapMs: Math.max(timestamps[0] ?? durationMs, ...gaps, durationMs - (timestamps.at(-1) ?? 0)),
      stallsOver50Ms: gaps.filter(gap => gap > 50).length, canvasPanEvents, longTasks };
  });
  ({ profile } = await cdp.send('Profiler.stop'));
  await cdp.detach();
  const report = { runId, capturedAt: new Date().toISOString(), session, measurement };
  await writeFile(path.join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(outputDirectory, 'canvas-pan.cpuprofile'), JSON.stringify(profile));
  console.log(JSON.stringify({ outputDirectory, ...report }, null, 2));
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
