import { clickChatAction } from './ui-workflows.mjs';
import { chromium } from 'playwright';
import { input, password, confirm } from '@inquirer/prompts';
import { PNG } from 'pngjs';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { smokeCases, fullCases } from './cases.mjs';
import { executeWorkflow, workflows } from './workflows.mjs';
import { assessRequirements } from './requirements.mjs';
import { coverageFor, validateCases } from './coverage.mjs';
import { finishCleanup, readJournal, validateCredentials, writeJournal } from './lifecycle.mjs';
import { artworkPattern, matchesArtwork, detectionPattern } from './artwork.mjs';
import { targetGesture, animateAndMeasure, reconnectPlayer, interactiveMutation } from './runner-actions.mjs';
import { sourceFingerprint } from './evidence.mjs';
import { prepareVisualSurface, verifySamplingArea } from './visual-surface.mjs';
import { assertQaWorld, DEFAULT_QA_WORLD } from './world-guard.mjs';
import { accountDefaults, loadLocalDefaults, promptAccount } from './local-defaults.mjs';

const directory = path.resolve('artifacts/live');
const journalPath = path.join(directory, 'recovery.json');
const abort = new AbortController();
let browser, gm, gm2, player, journal, locked = false;
let evidenceDirectory = directory;
let localDefaults = {};
const report = { started: new Date().toISOString(), cases: [], startupErrors: [], cleanup: 'not-needed' };
let collectingStartup = true;
const credentials = [];
const expectedWorld = process.env.VISIONER_DISPOSABLE_WORLD ?? DEFAULT_QA_WORLD;
process.once('SIGINT', () => abort.abort());
process.once('SIGTERM', () => abort.abort());

function checkAbort() { if (abort.signal.aborted) throw Error('Live suite cancelled'); }
async function rpc(page, method, data) {
  let timer;
  try {
    return await Promise.race([
      page.evaluate(async ({ method, data }) => {
        const api = await import('/modules/pf2e-visioner/tests/live/world.js');
        return api[method](data);
      }, { method, data }),
      new Promise((_, reject) => { timer = setTimeout(() => {
        // Stop browser-side async work before any later cleanup can race it.
        // A closed/crashed browser retains the write-ahead journal for recovery.
        abort.abort();
        void browser?.close().catch(() => {});
        reject(Error(`Foundry operation timed out: ${method}; run cleanup recovery`));
      }, 120000); }),
    ]);
  } finally { clearTimeout(timer); }
}
async function account(role) {
  const result = await promptAccount(role, localDefaults, process.env, { input, password, confirm }, { signal: abort.signal });
  credentials.push(result.password);
  if (role !== 'player' && !result.password) throw Error('GM accounts require a password');
  return result;
}
function safeError(error) {
  let text = String(error?.stack ?? error?.message ?? error);
  for (const secret of credentials.filter(Boolean)) text = text.split(secret).join('[redacted]');
  return text;
}
async function login(context, url, account, isGM) {
  const page = await context.newPage();
  page.on('pageerror', error => { if (collectingStartup) report.startupErrors.push(safeError(error)); });
  page.on('console', message => { if (collectingStartup && message.type() === 'error') report.startupErrors.push(safeError(message.text())); });
  page.setDefaultTimeout(20000);
  await page.goto(`${url}/join`);
  const select = page.locator('select[name="userid"]');
  await page.locator('select[name="userid"], input[name="username"]').first().waitFor();
  // Check the world advertised by Foundry before submitting either account's credentials.
  assertQaWorld(await page.evaluate(() => globalThis.game?.world?.id), expectedWorld);
  if (await select.count()) {
    const options = await select.locator('option').evaluateAll(options => options.map(o => ({ label: o.textContent.trim(), value: o.value })));
    const match = options.find(o => o.label.toLowerCase() === account.username.trim().toLowerCase());
    if (!match) throw Error(`Account not found for ${isGM ? 'GM' : 'player'} session`);
    await select.selectOption(match.value);
  } else await page.locator('input[name="username"]').fill(account.username);
  await page.locator('input[name="password"]').fill(account.password);
  await page.locator('button[name="join"]').click();
  await page.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready, null, { timeout: 90000 });
  // Some worlds enforce client settings on first login. Only handle this known
  // reload prompt; never blindly dismiss arbitrary dialogs or grant permissions.
  const syncDialog = page.locator('[role="dialog"], .application, .window-app').filter({ hasText: 'You have new GM-enforced settings. A reload is required.' }).last();
  const needsReload = await syncDialog.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, error => {
    if (error.name !== 'TimeoutError') throw error;
    return false;
  });
  if (needsReload) {
    await Promise.all([page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() }), syncDialog.getByRole('button', { name: 'Reload', exact: true }).click()]);
    await page.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready, null, { timeout: 90000 });
  }
  const state = await rpc(page, 'preflight');
  // Recheck after joining in case the server changed worlds during login.
  assertQaWorld(state.world, expectedWorld);
  if (state.isGM !== isGM) throw Error(`Wrong account role: expected ${isGM ? 'GM' : 'player'}`);
  return { page, state };
}
async function view(page, fixture) {
  await page.waitForFunction(id => globalThis.game?.scenes?.has(id), fixture.scene);
  await page.waitForFunction(() => globalThis.canvas?.ready && !canvas.loading);
  await rpc(page, 'view', fixture);
}
async function viewEncounter(page, fixture) {
  await page.waitForFunction(f => game.combats.some(c => c.scene?.id === f.scene &&
    c.getFlag('pf2e-visioner', 'liveTestRun') === canvas.scene?.getFlag('pf2e-visioner', 'liveTestRun')), fixture);
  await rpc(page, 'viewEncounter', fixture);
}
async function mutateFixture(step, fixture, runId, diagnose) {
  const value = step.operation === 'combat' ? { ...step.value, start: false } : step.value;
  const result = await interactiveMutation(gm.page, step.operation, value,
    () => rpc(gm.page, 'mutate', { ...step, value, fixture, runId }), diagnose);
  if (step.operation === 'combat') {
    // Every connected client selects the encounter before startCombat broadcasts
    // a turn update. Core's tracker expects that update to contain its viewed ID.
    await viewEncounter(player.page, fixture);
    if (gm2) await viewEncounter(gm2.page, fixture);
    if (step.value?.start !== false) await rpc(gm.page, 'mutate', { operation: 'combat-start', fixture, runId });
  }
  return result;
}

async function eventually(page, fixture, expected = {}) {
  await page.waitForFunction(f => globalThis.canvas?.ready && !canvas.loading && canvas.scene?.id === f.scene &&
    !!canvas.tokens.get(f.observer) && !!canvas.tokens.get(f.target), fixture);
  const deadline = Date.now() + 60000;
  let actual, stable = 0;
  while (Date.now() < deadline) {
    checkAbort();
    actual = await rpc(page, 'snapshot', fixture);
    if (Object.entries(expected).every(([key, value]) => actual[key] === value)) {
      if (++stable === 2) return actual;
    } else stable = 0;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw Error(`Expected ${JSON.stringify(expected)}; got ${JSON.stringify(actual)}`);
}
async function screenshot(page, fixture, file, art, sampleRect) {
  if (art === undefined) { await page.screenshot({ path: file }); return; }
  // Core fade animations may outlive flag synchronization. Require stable
  // rendered evidence, not a single screenshot halfway through a fade.
  const deadline = Date.now() + 5000;
  let buffer, pattern, stable = 0;
  do {
    checkAbort();
    await prepareVisualSurface(page);
    const rect = sampleRect ?? (await rpc(page, 'snapshot', fixture)).rect;
    await verifySamplingArea(page, rect);
    buffer = await page.screenshot();
    pattern = artworkPattern(PNG.sync.read(buffer), rect);
    stable = matchesArtwork(pattern, art) ? stable + 1 : 0;
    if (stable >= 2) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  } while (Date.now() < deadline);
  await writeFile(file, buffer);
  if (stable < 2) throw Error(`Rendered artwork mismatch: expected ${art}, pattern=${pattern.luminance}`);
}
async function restoreSessions(record) {
  const failures = [];
  try { if (record.player.manualRollPermission) await gm.page.evaluate(async ({ world, userId, saved }) => {
    if (!game.user.isGM || game.world.id !== world) throw Error('QA GM required to restore permission');
    const user = game.users.get(userId);
    await user.update(saved.existed ? { 'permissions.MANUAL_ROLLS': saved.value } : { 'permissions.-=MANUAL_ROLLS': null });
    if (Object.hasOwn(user._source.permissions, 'MANUAL_ROLLS') !== saved.existed ||
      (saved.existed && user._source.permissions.MANUAL_ROLLS !== saved.value)) throw Error('Manual roll permission restoration failed');
  }, { world: record.world, userId: record.player.user, saved: record.player.manualRollPermission });
  } catch (error) { failures.push(error); }
  for (const session of [gm, gm2, player].filter(Boolean)) {
    try { await rpc(session.page, 'cleanupAuditTransients', record.runId); } catch (error) { failures.push(error); }
  }
  if (record.worldSettings) {
    try { await rpc(gm.page, 'restoreSettings', record.worldSettings); } catch (error) { failures.push(error); }
  }
  for (const [session, saved] of [[gm, record.gm], [gm2, record.gm2], [player, record.player]]) {
    if (session && saved && session.state.user === saved.user) {
      try { await rpc(session.page, 'restore', saved); } catch (error) { failures.push(error); }
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Could not restore every test session');
}
async function syncPause(record, paused) {
  await rpc(gm.page, 'setPause', { world: record.world, paused });
  await Promise.all([gm, gm2, player].filter(Boolean).map(session =>
    session.page.waitForFunction(({ world, paused }) =>
      game.world.id === world && game.paused === paused, { world: record.world, paused })));
}
async function recover(record) {
  if (record.world !== gm.state.world || record.url !== journal.url) throw Error('Recovery journal belongs to another world/URL');
  if (record.gm.user !== gm.state.user || record.player.user !== player.state.user || (record.gm2 && record.gm2.user !== gm2?.state.user)) throw Error('Recovery requires the original GM and player accounts');
  report.cleanup = 'running';
  await finishCleanup({ journal: journalPath,
    cleanup: () => rpc(gm.page, 'cleanup', record.runId),
    restore: async () => {
      const failures = [];
      try { await restoreSessions(record); } catch (error) { failures.push(error); }
      if (typeof record.pauseState === 'boolean') {
        try { await syncPause(record, record.pauseState); } catch (error) { failures.push(error); }
      }
      if (failures.length) throw new AggregateError(failures, 'QA state restoration incomplete');
    },
    verify: async () => {
      const remaining = await rpc(gm.page, 'leftovers', record.runId);
      if (Object.values(remaining).some(ids => ids.length)) throw Error('Test documents remain after cleanup');
    },
  });
  report.cleanup = 'complete';
}

async function saveReport() {
  report.functionalCoverage = assessRequirements(fullCases, report.cases);
  report.coverage = {
    automated: coverageFor(fullCases, report.cases),
  };
  report.shippingReady = report.functionalCoverage.complete && !report.error && !report.startupErrors.length && !report.environmentWarning && !report.sourceChangedDuringRun && report.cleanup === 'complete' &&
    Object.values(report.coverage).every(group => !group.failed.length && !group.unrun.length);
  if (locked) await writeJournal(path.join(directory, 'report.json'), report);
  if (locked && evidenceDirectory !== directory) await writeJournal(path.join(evidenceDirectory, 'report.json'), report);
}

async function run() {
  validateCases(fullCases);
  if (process.argv.includes('--coverage')) {
    console.log(JSON.stringify(assessRequirements(fullCases, []), null, 2));
    return;
  }
  if (process.argv.includes('--list')) {
    console.table(fullCases.map(c => ({ case: c.name, mode: 'automated', area: c.area ?? 'core', smoke: smokeCases.includes(c), steps: c.steps.length })));
    return;
  }
  if (process.argv.includes('--release') && (process.env.VISIONER_LIVE_CASE || process.argv.includes('--performance') || !process.argv.includes('--full'))) {
    throw Error('Shipping validation requires --full, without a case filter');
  }
  if (process.argv.includes('--guided')) throw Error('Manual reviews were removed. Use --full for the automated suite.');
  for (const c of fullCases) for (const step of c.steps) if (step.workflow && !Object.hasOwn(workflows, step.workflow)) throw Error(`Missing workflow: ${step.workflow}`);
  const allCases = process.argv.includes('--performance') ? fullCases.filter(c => c.area === 'performance' || c.name === 'movement-animation-performance')
    : process.argv.includes('--full') ? fullCases : smokeCases;
  const requested = process.env.VISIONER_LIVE_CASE?.split(',').map(name => name.trim()).filter(Boolean);
  const unknown = requested?.filter(name => !allCases.some(c => c.name === name)) ?? [];
  if (unknown.length && !process.argv.includes('--cleanup-only')) throw Error(`Unknown live cases (or --full missing): ${unknown.join(', ')}`);
  const cases = requested ? allCases.filter(c => requested.includes(c.name)) : allCases;
  if (!cases.length && !process.argv.includes('--cleanup-only')) throw Error('No live cases matched VISIONER_LIVE_CASE');
  await mkdir(directory, { recursive: true });
  const lockPath = path.join(directory, 'runner.lock');
  // Atomic single-run guard. A stale lock can be removed only after confirming its PID stopped.
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(await readFile(lockPath, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0) throw Error('Invalid runner lock; inspect before removing it');
    try { process.kill(pid, 0); throw Error(`Live suite already running (PID ${pid})`); }
    catch (probe) { if (probe.code !== 'ESRCH') throw probe; }
    await unlink(lockPath);
    lock = await open(lockPath, 'wx');
  }
  locked = true;
  await lock.writeFile(String(process.pid)); await lock.close();
  localDefaults = await loadLocalDefaults();
  const url = (process.env.VISIONER_FOUNDRY_URL || await input({ message: 'Foundry URL:', default: localDefaults.url || 'https://localhost:30000' }, { signal: abort.signal })).replace(/\/$/, '');
  const gmAccount = await account('gm'), playerAccount = await account('player');
  validateCredentials(gmAccount, playerAccount);
  browser = await chromium.launch({ headless: process.argv.includes('--headless'), channel: process.env.VISIONER_BROWSER_CHANNEL || undefined });
  const options = { viewport: { width: 1600, height: 1000 }, ignoreHTTPSErrors: new URL(url).hostname === 'localhost' };
  gm = await login(await browser.newContext(options), url, gmAccount, true);
  console.log('GM session ready');
  player = await login(await browser.newContext(options), url, playerAccount, false);
  console.log('Player session ready');
  if (accountDefaults('gm2', localDefaults).username) {
    gm2 = await login(await browser.newContext(options), url, await account('gm2'), true);
    if ([gm.state.user, player.state.user].includes(gm2.state.user) || gm2.state.world !== gm.state.world) throw Error('Second GM must be a distinct account in the same world');
  }
  if (gm.state.world !== player.state.world) throw Error('Accounts joined different worlds');
  journal = { url, world: gm.state.world, runId: randomUUID(), gm: gm.state, player: player.state, ...(gm2 ? { gm2: gm2.state } : {}) };
  const pending = await readJournal(journalPath);
  if (pending) {
    await recover(pending);
    journal = { ...journal, gm: await rpc(gm.page, 'preflight'), player: await rpc(player.page, 'preflight'),
      ...(gm2 ? { gm2: await rpc(gm2.page, 'preflight') } : {}) };
  }
  if (process.argv.includes('--cleanup-only')) return;
  collectingStartup = false;
  if (report.startupErrors.length) console.warn(`Foundry startup produced ${report.startupErrors.length} errors; retained in report and shipping certification blocked.`);
  const checkoutVersion = JSON.parse(await readFile('module.json', 'utf8')).version;
  report.environment = { core: gm.state.core, system: gm.state.system, module: gm.state.module, checkoutVersion, modules: gm.state.modules };
  report.sourceFingerprint = await sourceFingerprint();
  if (checkoutVersion !== gm.state.module) {
    report.environmentWarning = 'Foundry module metadata differs from checkout. Restart Foundry before shipping verification.';
    console.warn(report.environmentWarning);
    if (process.argv.includes('--release')) throw Error(report.environmentWarning);
  }
  for (const [key, expected] of Object.entries({ autoVisibilityEnabled: true, avsOnlyInCombat: false, enableHoverTooltips: true, allowPlayerTooltips: true })) {
    if (gm.state.settings[key] !== expected) throw Error(`QA world requires ${key}=${expected}; no settings were changed`);
  }
  journal.pauseState = (await rpc(gm.page, 'preflight')).paused;
  await writeJournal(journalPath, journal); // Save original pause state before changing it or creating fixtures.
  await syncPause(journal, false);
  if (journal.pauseState) console.log('QA world unpaused; original pause state will be restored after tests.');
  report.runId = journal.runId;
  evidenceDirectory = path.join(directory, journal.runId);
  await mkdir(evidenceDirectory, { recursive: true });
  await rpc(gm.page, 'installMessageTagger', journal.runId);
  const errors = [];
  let activeCaseName = null;
  gm.page.on('pageerror', error => errors.push(safeError(error)));
  gm2?.page.on('pageerror', error => errors.push(safeError(error)));
  player.page.on('pageerror', error => errors.push(safeError(error)));
  for (const session of [gm, gm2, player].filter(Boolean)) session.page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // This negative contract deliberately asks the API to reject this value.
    if (activeCaseName === 'api-rejects-unsupported-state' && text.startsWith('Invalid visibility state: unnoticed. Valid states are:')) return;
    errors.push(`Console error: ${safeError(text)}`);
  });
  for (const testCase of cases) {
    checkAbort();
    const result = { name: testCase.name, mode: 'automated', area: testCase.area ?? 'core', steps: [], status: 'running', started: new Date().toISOString() }; report.cases.push(result);
    console.log(`RUN ${testCase.name}`);
    activeCaseName = testCase.name;
    const firstError = errors.length;
    let fixture;
    try {
      if (testCase.secondGm && !gm2) throw Error('Prerequisite: second existing GM credentials required (VISIONER_GM2_USER)');
      if (testCase.disposableWorld) assertQaWorld(gm.state.world, expectedWorld);
      if (testCase.settings?.length || testCase.steps.some(step => step.setting)) {
        journal.worldSettings = await rpc(gm.page, 'captureSettings', { worldId: gm.state.world, keys: [...new Set([...(testCase.settings ?? []), ...testCase.steps.filter(step => step.setting).map(step => step.setting.key)])] });
        await writeJournal(journalPath, journal); // Must precede the first settings write.
      }
      fixture = await rpc(gm.page, 'setup', { ...testCase, runId: journal.runId, playerId: player.state.user });
      await view(gm.page, fixture); await view(player.page, fixture);
      if (gm2) await view(gm2.page, fixture);
      let viewFixture = fixture;
      for (const [index, step] of testCase.steps.entries()) {
        checkAbort();
        const stepResult = { index, status: 'running', expected: step.expect ?? null };
        const page = step.session === 'gm' ? gm.page : player.page;
        stepResult.session = step.session ?? 'player';
        result.steps.push(stepResult);
        if (step.setting) await rpc(gm.page, 'changeSetting', { ...step.setting, runId: journal.runId, worldId: gm.state.world });
        if (step.restoreSettings) await rpc(gm.page, 'restoreSettings', journal.worldSettings);
        const beforeMessages = step.actionMessage ? (await rpc(gm.page, 'snapshot', fixture)).messages.map(m => m.id) : [];
        const diagnosePrompt = async error => {
          console.error(safeError(error));
          await gm.page.screenshot({ path: path.join(evidenceDirectory, `${testCase.name}-${index}-native-prompt.png`) });
        };
        if (step.operation) await mutateFixture(step, fixture, journal.runId, diagnosePrompt);
        if (step.workflow) {
          stepResult.assertions = [];
          let substep = 0;
          const context = {
            gm: gm.page, gm2: gm2?.page, player: player.page, fixture, runId: journal.runId,
            rpc, evidence: stepResult.assertions,
            setting: async (key, value) => {
              if (!journal.worldSettings?.settings.some(entry => entry.key === key)) throw Error(`Unjournaled QA setting: ${key}`);
              await rpc(gm.page, 'changeSetting', { key, value, runId: journal.runId, worldId: gm.state.world });
              for (const session of [gm, gm2, player].filter(Boolean)) await session.page.waitForFunction(
                ({ key, value }) => (key === 'core.scrollingStatusText'
                  ? game.settings.get('core', 'scrollingStatusText')
                  : game.settings.get('pf2e-visioner', key)) === value, { key, value });
            },
            pause: paused => syncPause(journal, paused),
            mutate: async (operation, value, overrides = {}) => {
              checkAbort();
              const f = { ...fixture, ...overrides };
              const result = await mutateFixture({ operation, value }, f, journal.runId, diagnosePrompt);
              if (operation === 'observer-move' && Number.isFinite(value?.elevation)) {
                await view(gm.page, f); await view(player.page, f);
              }
              return result;
            },
            messages: async () => (await rpc(gm.page, 'snapshot', fixture)).messages,
            tileArt: async () => {
              const item = { label: 'background-tile-pixels', status: 'running' }; stepResult.assertions.push(item);
              try {
                await player.page.waitForFunction(f => {
                  const run = canvas.scene?.getFlag('pf2e-visioner', 'liveTestRun');
                  return run && canvas.ready && !canvas.loading && canvas.scene.id === f.scene &&
                    canvas.tiles.placeables.some(t => t.document.getFlag('pf2e-visioner', 'liveTestRun') === run);
                }, fixture);
                const rect = await player.page.evaluate(f => {
                  const tiles = canvas.tiles.placeables.filter(t => t.document.getFlag('pf2e-visioner', 'liveTestRun') === canvas.scene?.getFlag('pf2e-visioner', 'liveTestRun'));
                  if (canvas.scene?.id !== f.scene || tiles.length !== 1) throw Error('Exactly one owned tile required');
                  // Native bounds account for the centered shape anchor in
                  // Foundry 14 and the top-left coordinates in Foundry 13.
                  const bounds = tiles[0].bounds, p = canvas.stage.toGlobal(new PIXI.Point(bounds.x, bounds.y));
                  return { x: p.x, y: p.y, width: bounds.width * canvas.stage.scale.x, height: bounds.height * canvas.stage.scale.y };
                }, fixture);
                await screenshot(player.page, fixture, path.join(evidenceDirectory, `${testCase.name}-${index}-${substep++}-tile.png`), true, rect);
                item.status = 'passed';
              } catch (error) { item.status = 'failed'; item.error = safeError(error); throw error; }
            },
            indicator: async neutral => {
              const item = { label: neutral ? 'neutral-hearing-pixels' : 'detection-indicator-pixels', status: 'running' }; stepResult.assertions.push(item);
              try {
                await player.page.mouse.move(10, 10);
                const deadline = Date.now() + 5000;
                let buffer, stable = 0;
                do {
                  checkAbort(); await prepareVisualSurface(player.page);
                  const { rect } = await rpc(player.page, 'snapshot', fixture);
                  await verifySamplingArea(player.page, rect);
                  buffer = await player.page.screenshot();
                  item.actual = detectionPattern(PNG.sync.read(buffer), rect);
                  stable = item.actual.visible && (!neutral || item.actual.neutral) ? stable + 1 : 0;
                  if (stable >= 2) break;
                  await new Promise(resolve => setTimeout(resolve, 200));
                } while (Date.now() < deadline);
                await writeFile(path.join(evidenceDirectory, `${testCase.name}-${index}-${substep++}-indicator.png`), buffer);
                if (stable < 2) item.renderSnapshot = await rpc(player.page, 'snapshot', fixture);
                if (stable < 2) throw Error(`Detection pixels failed: ${JSON.stringify(item.actual)}`);
                item.status = 'passed';
              } catch (error) { item.status = 'failed'; item.error = safeError(error); throw error; }
            },
            check: async (expected, art, label = 'state', overrides = {}) => {
              checkAbort();
              const f = { ...fixture, probe: 'workflow', ...overrides };
              const evidencePage = overrides.session === 'gm' ? gm.page : player.page;
              const item = { label, expected, session: overrides.session ?? 'player', status: 'running' }; stepResult.assertions.push(item);
              try {
                item.actual = await eventually(evidencePage, f, expected);
              } catch (error) {
                item.status = 'failed'; item.error = safeError(error);
                for (const [role, page] of [['gm', gm.page], ['player', player.page]]) {
                  try {
                    item[role + 'FinalSnapshot'] = await rpc(page, 'snapshot', f);
                    item[role + 'VisibilityFactors'] = await page.evaluate(async f => {
                      const { api } = await import('/modules/pf2e-visioner/scripts/api.js');
                      return api.getVisibilityFactors(f.observer, f.target);
                    }, f);
                  } catch (diagnosticError) { item[role + 'DiagnosticError'] = safeError(diagnosticError); }
                }
                try {
                  item.gmFreshCalculation = await gm.page.evaluate(async f => {
                    const { autoVisibilitySystem } = await import('/modules/pf2e-visioner/scripts/visibility/auto-visibility/index.js');
                    return autoVisibilitySystem.calculateVisibility(canvas.tokens.get(f.observer), canvas.tokens.get(f.target));
                  }, f);
                } catch (error) { item.freshCalculationError = safeError(error); }
                throw error;
              }
              try {
                await screenshot(evidencePage, f, path.join(evidenceDirectory, `${testCase.name}-${index}-${substep++}.png`), art);
                item.status = 'passed';
              } catch (error) {
                // State is correct, so later Apply/Revert transitions are safe to
                // exercise. Keep the pixel failure; it still fails the workflow.
                item.status = 'failed'; item.error = safeError(error);
              }
            },
          };
          await executeWorkflow(step.workflow, context);
        }
        if (step.reconnect) {
          await reconnectPlayer({ page: player.page, gmPage: gm.page, fixture, runId: journal.runId, state: step.reconnect.state, rpc });
          await view(player.page, viewFixture);
        }
        if (step.reload) {
          await player.page.reload();
          await player.page.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready, null, { timeout: 90000 });
          await view(player.page, viewFixture);
        }
        if (step.switchObserver) {
          const id = step.switchObserver === 'second' ? fixture.secondObserver : fixture.observer;
          await player.page.evaluate(id => canvas.tokens.get(id).control({ releaseOthers: true }), id);
          viewFixture = { ...fixture, observer: id };
        }
        if (step.hover || step.targetGesture) await targetGesture(page, viewFixture, step.targetGesture);
        if (step.animate) {
          stepResult.performance = await animateAndMeasure(gm.page, player.page, viewFixture, step.animate);
          if (!stepResult.performance.passed) throw Error(`Animation contract failed: ${JSON.stringify(stepResult.performance)}`);
        }
        if (step.expectSetting) {
          const { key, original, value } = step.expectSetting;
          const expected = original ? journal.worldSettings.settings.find(s => s.key === key).value : value;
          await page.waitForFunction(({ key, expected }) => game.settings.get('pf2e-visioner', key) === expected, { key, expected });
          stepResult.setting = { key, expected, actual: await page.evaluate(key => game.settings.get('pf2e-visioner', key), key) };
        }
        const after = step.actionMessage ? await rpc(gm.page, 'snapshot', fixture) : null;
        if (step.actionMessage && !after.messages.some(m => m.roll && !beforeMessages.includes(m.id))) throw Error('Action produced no new roll message');
        if (step.applyAction) {
          const message = after.messages.findLast(m => m.roll && !beforeMessages.includes(m.id));
          await clickChatAction(gm.page, `[data-message-id="${message.id}"] [data-action="open-${step.applyAction}-results"]`);
          const dialog = gm.page.locator('.application, .window-app').filter({ has: gm.page.locator('[data-action="applyAll"]') }).last();
          await dialog.locator('[data-action="applyAll"]').click();
        }
        if (step.revertAction) {
          const dialog = gm.page.locator(`.${step.revertAction}-preview-dialog`).filter({ has: gm.page.locator('[data-action="revertAll"]') }).last();
          await dialog.locator('[data-action="revertAll"]').click();
        }
        if (step.key) { await page.bringToFront(); await page.keyboard.down(step.key); }
        try {
          stepResult.actual = await eventually(page, { ...viewFixture, probe: step.probe }, step.expect);
          try {
            await screenshot(page, viewFixture, path.join(evidenceDirectory, `${testCase.name}-${index}.png`), step.art);
          } catch (error) {
            // Stored-state prerequisites passed. Preserve a rendering failure
            // while still exercising later edit/remove/revert transitions.
            if (!String(error.message).startsWith('Rendered artwork mismatch:')) throw error;
            stepResult.status = 'failed'; stepResult.error = safeError(error);
            console.error(`FAIL ${testCase.name} step ${index}: ${stepResult.error}`);
            continue;
          }
          stepResult.status = 'passed';
        } finally { if (step.key) await page.keyboard.up(step.key); }
      }
      if (errors.length > firstError) throw Error(`Browser exception: ${errors.slice(firstError).join('; ')}`);
      const failedSteps = result.steps.filter(step => step.status === 'failed');
      if (failedSteps.length) throw Error(failedSteps.map(step => `Step ${step.index}: ${step.error}`).join('; '));
      result.status = 'passed';
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      result.status = String(error.message).includes('Prerequisite:') ? 'blocked' : 'failed'; result.error = safeError(error);
      if (result.steps.at(-1)?.status === 'running') result.steps.at(-1).status = 'failed';
      console.error(`FAIL ${testCase.name}: ${result.error.slice(0, 1600)}${result.error.length > 1600 ? ' [full error in report]' : ''}`);
      if (fixture) for (const [role, session] of [['gm', gm], ['gm2', gm2], ['player', player]]) {
        try { if (session) result[role + 'FailureSnapshot'] = await rpc(session.page, 'snapshot', fixture); } catch {}
      }
      try { await player.page.screenshot({ path: path.join(evidenceDirectory, `${testCase.name}-failure.png`) }); } catch { /* browser may have closed */ }
      try { await gm.page.screenshot({ path: path.join(evidenceDirectory, `${testCase.name}-failure-gm.png`) }); } catch { /* browser may have closed */ }
    } finally {
      const failures = [];
      for (const operation of [() => restoreSessions(journal), () => rpc(gm.page, 'cleanup', journal.runId), async () => {
        const remaining = await rpc(gm.page, 'leftovers', journal.runId);
        if (Object.values(remaining).some(ids => ids.length)) throw Error('Test documents remain');
      }]) {
        try { await operation(); } catch (error) { failures.push(safeError(error)); }
      }
      if (failures.length) { result.status = 'failed'; result.cleanupError = failures; abort.abort(); }
      result.cleanup = failures.length ? 'failed' : 'complete';
      if (!failures.length && journal.worldSettings) {
        delete journal.worldSettings;
        await writeJournal(journalPath, journal);
      }
      result.finished = new Date().toISOString();
      await saveReport();
    }
  }
}

try { await run(); }
catch (error) { report.error = safeError(error); console.error(report.error); }
finally {
  try {
    const pending = await readJournal(journalPath);
    if (locked && gm && player && pending && journal) await recover(pending);
  } catch (error) { report.cleanup = 'failed'; report.cleanupError = safeError(error); console.error(report.cleanupError); }
  await browser?.close().catch(() => {});
  if (report.sourceFingerprint) {
    try { report.sourceChangedDuringRun = report.sourceFingerprint !== await sourceFingerprint(); }
    catch (error) { report.sourceChangedDuringRun = true; report.error = safeError(error); }
  }
  if (locked) await unlink(path.join(directory, 'runner.lock')).catch(() => {});
  report.finished = new Date().toISOString();
  await saveReport();
}
const failed = report.error || (!process.argv.includes('--cleanup-only') && report.startupErrors.length) || report.sourceChangedDuringRun || report.cleanup === 'failed' || report.cases.some(c => c.status !== 'passed') ||
  (process.argv.includes('--release') && !report.shippingReady);
console.log(`Live tests: ${report.cases.filter(c => c.status === 'passed').length}/${report.cases.length} passed; cleanup: ${report.cleanup}`);
if (process.argv.includes('--release') && report.functionalCoverage && !report.functionalCoverage.complete) {
  const incomplete = report.functionalCoverage.details.filter(r => r.missing.length || r.unrun.length || r.failed.length);
  console.error(`Functional coverage incomplete: ${incomplete.map(r => r.name).join(', ')}. See report.functionalCoverage for exact blockers.`);
}
process.exitCode = failed ? 1 : 0;
