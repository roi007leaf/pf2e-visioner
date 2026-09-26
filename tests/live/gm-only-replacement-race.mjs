import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const url = process.env.VISIONER_LIVE_URL || 'https://localhost:30000';
const username = process.env.VISIONER_LIVE_GM_USERNAME;
const password = process.env.VISIONER_LIVE_GM_PASSWORD;
if (!username || !password) throw Error('Explicit GM credentials required');
const runId = randomUUID();
const directory = `artifacts/live/${runId}`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ ignoreHTTPSErrors: true });
const rpc = (name, arg) =>
  page.evaluate(
    async ({ name, arg }) => {
      const api = await import('/modules/pf2e-visioner/tests/live/world.js');
      return api[name](arg);
    },
    { name, arg },
  );
let saved, settings, fixture, activeScene;
const report = {
  runId,
  scenario: 'gm-only-mid-turn-concurrent-replacements',
  iterations: [],
  status: 'running',
};
try {
  await page.goto(`${url}/join`);
  await page.locator('select[name="userid"], input[name="username"]').first().waitFor();
  assert.equal(await page.evaluate(() => game.world.id), 'visioner-qa');
  if (await page.locator('select[name="userid"]').count())
    await page.locator('select[name="userid"]').selectOption({ label: username });
  else await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[name="join"]').click();
  await page.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready, null, {
    timeout: 90000,
  });
  await page.waitForFunction(
    () => game.users.filter((u) => u.active).length === 1 && game.user.isGM,
    null,
    { timeout: 15000 },
  );
  saved = await rpc('preflight');
  activeScene = await page.evaluate(() => game.scenes.active?.id);
  settings = await rpc('captureSettings', {
    worldId: saved.world,
    keys: ['autoVisibilityEnabled', 'avsOnlyInCombat', 'core.scrollingStatusText'],
  });
  fixture = await rpc('setup', { runId, playerId: saved.user, senses: [] });
  await rpc('view', fixture);
  await page.evaluate(async (id) => game.scenes.get(id).activate(), fixture.scene);
  await rpc('setPause', { world: saved.world, paused: false });
  for (const [key, value] of [
    ['autoVisibilityEnabled', true],
    ['avsOnlyInCombat', true],
    ['core.scrollingStatusText', false],
  ])
    await rpc('changeSetting', { worldId: saved.world, key, value, runId });
  await rpc('mutate', { fixture, runId, operation: 'combat' });
  const turn = await page.evaluate(() => ({ round: game.combat.round, turn: game.combat.turn }));
  const area = JSON.parse(
    await readFile(
      new URL('../../docs/examples/autumns-leaves/in-area.json', import.meta.url),
      'utf8',
    ),
  );
  report.writeDelayMs = 20;
  await page.evaluate((f) => {
    const document = canvas.tokens.get(f.target).document;
    const original = document.setFlag.bind(document);
    document.setFlag = async (scope, key, value) => {
      if (
        scope === 'pf2e-visioner' &&
        ['visibilityReplacements', 'visibilityReplacement'].includes(key)
      )
        await new Promise((resolve) => setTimeout(resolve, 20));
      return original(scope, key, value);
    };
  }, fixture);
  for (let iteration = 0; iteration < 8; iteration++) {
    const id = await page.evaluate(
      async ({ fixture, area }) => {
        const [item] = await canvas.tokens
          .get(fixture.target)
          .actor.createEmbeddedDocuments('Item', [area]);
        return item.id;
      },
      { fixture, area },
    );
    await page.waitForFunction(
      (f) =>
        canvas.tokens.get(f.target).document.getFlag('pf2e-visioner', 'visibilityReplacements')
          ?.length === 2,
      fixture,
      { timeout: 10000 },
    );
    await page.evaluate(
      async ({ fixture, id }) => {
        const token = canvas.tokens.get(fixture.target);
        await token.document.unsetFlag('pf2e-visioner', 'visibilityReplacements');
        await token.document.unsetFlag('pf2e-visioner', 'visibilityReplacement');
        await Promise.all(
          token.actor.items
            .get(id)
            .rules.filter((rule) => rule.key === 'PF2eVisionerEffect')
            .map((rule) => rule.applyOperations({ triggerRecalculation: true })),
        );
      },
      { fixture, id },
    );
    await page.waitForFunction(
      async (f) => {
        const { getVisibilityBetween } = await import(
          '/modules/pf2e-visioner/scripts/stores/visibility-map.js'
        );
        const a = canvas.tokens.get(f.observer),
          b = canvas.tokens.get(f.target);
        return (
          b.document.getFlag('pf2e-visioner', 'visibilityReplacements')?.length === 2 &&
          getVisibilityBetween(a, b) === 'concealed' &&
          getVisibilityBetween(b, a) === 'concealed'
        );
      },
      fixture,
      { timeout: 10000 },
    );
    assert.deepEqual(
      await page.evaluate(() => ({ round: game.combat.round, turn: game.combat.turn })),
      turn,
    );
    report.iterations.push({
      iteration,
      directions: ['to', 'from'],
      state: 'concealed',
      turnAdvanced: false,
    });
    await page.evaluate(
      async ({ fixture, id }) => canvas.tokens.get(fixture.target).actor.items.get(id).delete(),
      { fixture, id },
    );
    await page.waitForFunction(
      (f) =>
        !canvas.tokens.get(f.target).document.getFlag('pf2e-visioner', 'visibilityReplacements')
          ?.length,
      fixture,
    );
  }
  await page.screenshot({ path: `${directory}/gm-only.png` });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  throw error;
} finally {
  try {
    if (saved) {
      if (activeScene)
        await page.evaluate(async (id) => game.scenes.get(id).activate(), activeScene);
      await rpc('restore', saved);
      await rpc('cleanup', runId);
      await rpc('restoreSettings', settings);
      await rpc('setPause', { world: saved.world, paused: saved.paused });
      assert(Object.values(await rpc('leftovers', runId)).every((ids) => ids.length === 0));
      report.cleanup = 'complete';
    }
  } finally {
    await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
    await browser.close();
  }
}
console.log(
  `PASS GM-only mid-turn race: ${report.iterations.length} iterations; cleanup ${report.cleanup}; ${directory}/report.json`,
);
