#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

const DEFAULT_URL = 'https://127.0.0.1:30000/join';
const DEFAULT_USER = 'Ass Gm';
const DEFAULT_TOKEN = 'Ezren';
const DEFAULT_OUT_DIR = 'artifacts/perf-traces';
const DEFAULT_CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    user: DEFAULT_USER,
    token: DEFAULT_TOKEN,
    outDir: DEFAULT_OUT_DIR,
    scenarios: ['normal', 'no-light', 'suppress-pending'],
    headless: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--url' && next) args.url = next;
    else if (arg === '--user' && next) args.user = next;
    else if (arg === '--token' && next) args.token = next;
    else if (arg === '--out-dir' && next) args.outDir = next;
    else if (arg === '--scenarios' && next) {
      args.scenarios = next.split(',').map((value) => value.trim()).filter(Boolean);
    } else if (arg === '--headed') args.headless = false;
    else if (arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    if (arg !== '--headed' && next && !next.startsWith('--')) i += 1;
  }

  return args;
}

async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require('playwright');
  } catch (error) {
    console.error('Could not import Playwright.');
    console.error('Run with NODE_PATH pointing at an installed Playwright, or install it locally.');
    console.error('Example: NODE_PATH=/tmp/pv-playwright/node_modules node tools/perf/trace-token-movement.mjs');
    throw error;
  }
}

async function login(page, { user }) {
  await page.waitForTimeout(1000);
  if (!page.url().includes('/join')) return;

  const userSelect = page.locator('select[name="userid"], select[name="user"]');
  if (await userSelect.count()) {
    const options = await userSelect
      .first()
      .locator('option')
      .evaluateAll((optionEls) =>
        optionEls.map((option) => ({
          value: option.value,
          text: option.textContent.trim(),
        })),
      );
    const selected = options.find((option) => option.text === user || option.text.includes(user));
    if (!selected) throw new Error(`User not found in join screen: ${user}`);
    await userSelect.first().selectOption(selected.value);
  }

  const password = page.locator('input[type="password"], input[name="password"]');
  if (await password.count()) await password.first().fill('');
  const submit = page.locator('button[type="submit"], button:has-text("Join"), button:has-text("Log In")');
  if (await submit.count()) await submit.first().click();
}

function diffNumbers(before = {}, after = {}) {
  const result = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (typeof before[key] === 'number' || typeof after[key] === 'number') {
      result[key] = (after[key] || 0) - (before[key] || 0);
    }
  }
  return result;
}

function diffSources(before = {}, after = {}) {
  const result = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    result[key] = diffNumbers(before[key], after[key]);
  }
  return result;
}

async function runScenario(page, scenario, { tokenName }) {
  return page.evaluate(
    async ({ scenarioName, requestedTokenName }) => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const api =
        game.pf2eVisioner?.autoVisibility ||
        game.modules.get('pf2e-visioner')?.api?.autoVisibility;
      const token =
        canvas.tokens.placeables.find((placeable) => placeable.name === requestedTokenName) ||
        canvas.tokens.placeables[0];
      if (!token) throw new Error('No token found on canvas');

      const originalLight = foundry.utils.deepClone(token.document.light ?? {});
      const originalPosition = { x: token.document.x, y: token.document.y };
      const gridSize = canvas.grid?.size || 100;
      const counts = {
        refreshToken: 0,
        refreshTokenControlled: 0,
        lightingRefresh: 0,
        avsBatchComplete: 0,
      };
      const off = [];
      const hook = (name, fn) => {
        const id = Hooks.on(name, fn);
        off.push(() => Hooks.off(name, id));
      };

      hook('refreshToken', (refreshed) => {
        counts.refreshToken += 1;
        const id = refreshed?.document?.id;
        const controlledIds = new Set(
          (canvas.tokens.controlled || []).map((controlled) => controlled.document?.id).filter(Boolean),
        );
        if (id && controlledIds.has(id)) counts.refreshTokenControlled += 1;
      });
      hook('lightingRefresh', () => {
        counts.lightingRefresh += 1;
      });
      hook('pf2eVisionerAvsBatchComplete', () => {
        counts.avsBatchComplete += 1;
      });

      token.control({ releaseOthers: true });
      await sleep(250);

      if (scenarioName === 'no-light') {
        await token.document.update({ light: { bright: 0, dim: 0 } }, { animate: false });
        await sleep(250);
      }
      api?.debugPendingMovementVisualRefresh?.(scenarioName !== 'suppress-pending');

      const before = api?.getMovementPerformanceSnapshot?.();
      const startedAt = performance.now();
      await token.document.update({ x: originalPosition.x + gridSize }, { animate: true });
      await sleep(1800);
      await token.document.update(originalPosition, { animate: true });
      await sleep(1800);
      const durationMs = performance.now() - startedAt;
      const after = api?.getMovementPerformanceSnapshot?.();

      api?.debugPendingMovementVisualRefresh?.(true);
      if (scenarioName === 'no-light') {
        await token.document.update({ light: originalLight }, { animate: false });
      }
      await token.document.update(originalPosition, { animate: false });
      off.forEach((dispose) => dispose());

      return {
        scenario: scenarioName,
        token: token.name,
        counts,
        durationMs,
        before,
        after,
        pendingDelta: {},
        sourceDelta: {},
      };
    },
    { scenarioName: scenario, requestedTokenName: tokenName },
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { chromium } = await loadPlaywright();
  await fs.mkdir(args.outDir, { recursive: true });

  const browser = await chromium.launch({
    headless: args.headless,
    executablePath: process.env.CHROME_EXECUTABLE_PATH || DEFAULT_CHROME_PATH,
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  await page.route('**/*', (route) =>
    route.continue({
      headers: { ...route.request().headers(), 'Cache-Control': 'no-cache' },
    }),
  );
  await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await login(page, args);
  await page.waitForFunction(() => globalThis.canvas?.ready && globalThis.game?.ready, null, {
    timeout: 60000,
  });
  await page.waitForTimeout(1500);

  const results = [];
  for (const scenario of args.scenarios) {
    const tracePath = path.join(args.outDir, `${scenario}-${Date.now()}.zip`);
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
    });
    const result = await runScenario(page, scenario, { tokenName: args.token });
    await context.tracing.stop({ path: tracePath });

    result.tracePath = tracePath;
    result.pendingDelta = diffNumbers(result.before?.pendingMovement, result.after?.pendingMovement);
    result.sourceDelta = diffSources(
      result.before?.pendingMovement?.bySource,
      result.after?.pendingMovement?.bySource,
    );
    results.push(result);
    console.log(JSON.stringify(result, null, 2));
  }

  const reportPath = path.join(args.outDir, `movement-report-${Date.now()}.json`);
  await fs.writeFile(reportPath, `${JSON.stringify({ args, results }, null, 2)}\n`);
  console.log(`Report written: ${reportPath}`);
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
