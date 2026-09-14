import { PNG } from 'pngjs';
import { closeDialogs, unfilter, clickAnimated } from './ui-workflows.mjs';

export const gapWorkflows = {
  ...Object.fromEntries(['en', 'pl', 'cn', 'fr'].map(language =>
    [`gap-localization-${language}`, c => localization(c, language)])),
  ...Object.fromEntries(['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'].map(mode =>
    [`gap-colorblind-${mode}`, c => colorblind(c, mode)])),
  ...Object.fromEntries(['strike', 'saves'].flatMap(kind => ['none', 'lesser', 'standard', 'greater'].map(grade =>
    [`gap-native-${kind}-${grade}`, c => nativeCoverGrade(c, grade, kind)]))),
  'gap-macro-manager': macroManager,
  'gap-macro-player-guard': macroPlayerGuard,
  'gap-manager-apply-both': managerApplyBoth,
  'gap-quick-panel-target': quickPanelTarget,
  ...Object.fromEntries(['scent', 'lifesense', 'thoughtsense'].map(sense =>
    [`gap-presence-interaction-${sense}`, c => presenceInteraction(c, sense)])),
};

async function localization(c, language) {
  const original = await c.gm.evaluate(() => game.i18n.lang);
  try {
    const expected = await c.gm.evaluate(async language => {
      // Native in-memory language switch; do not persist core world settings.
      await game.i18n.setLanguage(language);
      if (game.i18n.lang !== language) throw Error(`Native language switch failed: ${language}`);
      const response = await fetch(`/modules/pf2e-visioner/lang/${language}.json`);
      if (!response.ok) throw Error(`Locale resource unavailable: ${language}`);
      const data = await response.json();
      return data.PF2E_VISIONER?.TOKEN_MANAGER?.VISIBILITY_TAB;
    }, language);
    c.assert(typeof expected === 'string' && expected.length > 0, 'Locale defines visibility tab label');
    await c.mutate('manager', 'observer');
    const dialog = c.gm.locator('.visioner-token-manager'); await dialog.waitFor();
    const button = dialog.locator('[data-action="toggleTab"][data-tab="visibility"]');
    c.equal(await button.getAttribute('data-tooltip'), expected, 'Rendered tab uses selected locale');
    const unresolved = await dialog.evaluate(el => [el.innerText,
      ...[...el.querySelectorAll('[data-tooltip], [aria-label]')].flatMap(e => [e.getAttribute('data-tooltip'), e.getAttribute('aria-label')]),
    ].filter(x => /PF2E_VISIONER\./.test(x ?? '')));
    c.equal(unresolved, [], 'Manager contains no untranslated visible labels/tooltips');
    await button.focus(); await c.gm.keyboard.press('Tab');
    const focus = await dialog.evaluate(el => ({ inside: el.contains(document.activeElement),
      visible: !!document.activeElement?.getClientRects().length, disabled: !!document.activeElement?.disabled }));
    c.equal(focus, { inside: true, visible: true, disabled: false }, 'Keyboard Tab reaches visible enabled manager control');
    await c.check({}, undefined, `${language}-rendered-manager`, { session: 'gm' });
  } finally {
    try { await closeDialogs(c); }
    finally { await c.gm.evaluate(language => game.i18n.setLanguage(language), original); }
    c.equal(await c.gm.evaluate(() => game.i18n.lang), original, 'Original language restored');
  }
}

async function colorblind(c, mode) {
  const original = await c.gm.evaluate(() => game.settings.get('pf2e-visioner', 'colorblindMode'));
  const change = value => c.gm.evaluate(value => game.settings.set('pf2e-visioner', 'colorblindMode', value), value);
  try {
    await change('none');
    await c.mutate('manager', 'observer');
    const dialog = c.gm.locator('.visioner-token-manager'); await dialog.waitFor(); await unfilter(dialog);
    const button = dialog.locator(`.visibility-section [data-token-id="${c.fixture.target}"] button[data-state="observed"]`);
    const style = () => button.evaluate(el => ({ color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
    const baseline = await style();
    await change(mode);
    await c.gm.waitForFunction(mode => document.body.classList.contains(`pf2e-visioner-colorblind-${mode}`), mode);
    const alternate = await style();
    c.assert(JSON.stringify(alternate) !== JSON.stringify(baseline), `${mode} changes rendered visibility button colors`);
    await c.check({}, undefined, `${mode}-rendered-manager`, { session: 'gm' });
    await change('none');
    c.equal(await style(), baseline, 'Disabling colorblind mode restores original button colors');
    c.equal(await c.gm.evaluate(() => [...document.body.classList].filter(x => x.startsWith('pf2e-visioner-colorblind-'))), [], 'No stale colorblind mode classes');
  } finally {
    try { await closeDialogs(c); }
    finally { await change(original); }
    c.equal(await c.gm.evaluate(() => game.settings.get('pf2e-visioner', 'colorblindMode')), original, 'Original colorblind preference restored');
  }
}

async function nativeCoverGrade(c, grade, kind) {
  const bonus = { none: 0, lesser: 1, standard: 2, greater: 4 }[grade];
  const check = (expected, label) => c.check(expected, undefined, label, { session: 'gm', probe: 'audit' });
  const base = await c.gm.evaluate(f => {
    const actor = canvas.tokens.get(f.target).actor;
    return { ac: actor.system.attributes.ac.value,
      reflex: actor.saves.reflex.mod, fortitude: actor.saves.fortitude.mod, will: actor.saves.will.mod };
  }, c.fixture);
  await c.mutate('cover-geometry', { type: 'wall', cover: grade });
  await c.check({ autoCover: grade }, undefined, 'geometry-grade');
  if (kind === 'strike') {
    await c.mutate('strike-item', { subject: 'observer', ranged: true });
    c.equal(await c.gm.evaluate(f => canvas.tokens.get(f.observer).actor.items.find(i => i.name === 'QA Strike')?.isRanged,
      c.fixture), true, 'Native ranged Strike is valid at the fixture distance');
    for (let roll = 0; roll < 2; roll++) {
      await nativeRoll(c, 'strike', { subject: 'observer' }, base.ac + bonus, `strike-${roll}-cover-does-not-stack`);
    }
  } else {
    await c.mutate('audit', { action: 'template' });
    await check({ templateCount: 1, templateCover: grade, templateCreator: true }, 'native-area-cover');
    for (const statistic of ['reflex', 'fortitude', 'will']) {
      await nativeRoll(c, 'audit', { action: 'save', statistic, area: true },
        base[statistic] + (statistic === 'reflex' && bonus >= 2 ? bonus : 0), `${statistic}-area-modifier`);
    }
    await c.mutate('audit', { action: 'template', remove: true });
    await check({ templateCount: 0, templateCover: null }, 'area-cleaned');
  }
  await c.mutate('walls-delete');
  await c.check({ autoCover: 'none' }, undefined, 'wall-removal-clears-cover');
  if (kind === 'strike') {
    await nativeRoll(c, 'strike', { subject: 'observer' }, base.ac, 'subsequent-strike-has-no-stale-cover');
  } else {
    await nativeRoll(c, 'audit', { action: 'save', statistic: 'reflex', area: false }, base.reflex, 'subsequent-save-has-no-stale-cover');
  }
}

async function nativeRoll(c, operation, value, expected, label) {
  const before = (await c.messages()).map(m => m.id);
  await c.mutate(operation, value);
  const roll = await c.gm.evaluate(({ before, operation }) => {
    const run = canvas.scene.getFlag('pf2e-visioner', 'liveTestRun');
    const type = operation === 'strike' ? 'attack-roll' : 'saving-throw';
    const message = game.messages.contents.findLast(m => !before.includes(m.id) &&
      m.getFlag('pf2e-visioner', 'liveTestRun') === run && m.flags.pf2e?.context?.type === type);
    return message ? { id: message.id, evaluated: message.rolls[0]?._evaluated === true,
      value: operation === 'strike' ? message.flags.pf2e.context.dc?.value : message.rolls[0]?.options?.totalModifier } : null;
  }, { before, operation });
  c.assert(roll?.evaluated === true, `${label}: new evaluated native roll document`);
  // A completed chat roll is immutable evidence, so no visibility polling or
  // previously matching chat message can hide an incorrect roll result.
  c.equal(roll.value, expected, label);
}

async function executePackMacro(c, session, name) {
  const result = await c[session].evaluate(async ({ fixture, name }) => {
    if (canvas.scene.id !== fixture.scene || !canvas.scene.getFlag('pf2e-visioner', 'liveTestRun')) throw Error('Owned QA scene required');
    const pack = game.packs.get('pf2e-visioner.pf2e-visioner-macros');
    if (!pack) throw Error('Shipped macro compendium missing');
    const index = await pack.getIndex();
    const entry = index.find(e => e.name === name);
    if (!entry) throw Error(`Shipped macro missing: ${name}; available: ${index.map(e => e.name).join(', ')}`);
    const macro = await pack.getDocument(entry._id);
    await macro.execute();
    return { name: macro.name, type: macro.type, uuid: macro.uuid };
  }, { fixture: c.fixture, name });
  c.equal(result.name, name, 'Executed actual shipped macro document');
  c.equal(result.type, 'script', 'Macro is executable script');
}

async function macroManager(c) {
  await c.mutate('select', { subject: 'observer' });
  await executePackMacro(c, 'gm', 'Open Token Manager For Selected Token');
  const dialog = c.gm.locator('.visioner-token-manager');
  await dialog.waitFor(); await unfilter(dialog);
  c.equal(await dialog.locator(`tr[data-token-id="${c.fixture.target}"]`).count() > 0, true, 'Macro opened selected observer manager');
  await c.check({}, undefined, 'shipped-macro-manager-rendered', { session: 'gm' });
  await closeDialogs(c);
  await c.check({ state: 'observed', cover: 'none' }, true, 'Opening macro leaves state unchanged');
}

async function macroPlayerGuard(c) {
  await c.mutate('state', 'hidden'); await c.mutate('cover', 'standard');
  const flags = () => canvas.tokens.placeables.map(t => ({ id: t.id, flags: t.document.toObject().flags }));
  await c.check({ state: 'hidden', cover: 'standard' }, false, 'setup-protected-state');
  const before = await c.player.evaluate(flags);
  await executePackMacro(c, 'player', 'Clear All Scene Data');
  const warning = c.player.locator('#notifications').filter({ hasText: 'Only GMs can run this.' });
  await warning.waitFor();
  c.equal(await c.player.evaluate(flags), before, 'Player macro cannot mutate token flags');
  await c.check({ state: 'hidden', cover: 'standard' }, false, 'Player macro preserves visibility and cover');
}

async function managerApplyBoth(c) {
  await c.mutate('manager', 'observer');
  const dialog = c.gm.locator('.visioner-token-manager');
  await dialog.waitFor(); await unfilter(dialog);
  await dialog.locator(`.visibility-section [data-token-id="${c.fixture.target}"] button[data-state="hidden"]`).click();
  await dialog.locator('[data-action="toggleTab"][data-tab="cover"]').click();
  await dialog.locator(`.cover-section [data-token-id="${c.fixture.target}"] button[data-state="greater"]`).click();
  await clickAnimated(c.gm, dialog.locator('[data-action="applyBoth"]'));
  await c.check({ state: 'hidden', cover: 'greater' }, false, 'Apply Both persists visibility and cover');
  await c.mutate('manager', 'observer');
  await dialog.waitFor(); await unfilter(dialog);
  await dialog.locator('[data-action="reset"]').click();
  await closeDialogs(c);
  await c.check({ state: 'observed', cover: 'none' }, true, 'Reset clears visibility and cover');
}

async function quickPanelTarget(c) {
  await c.mutate('select', { subject: 'observer', target: 'target' });
  await c.mutate('quick-panel');
  const panel = c.gm.locator('.pf2e-visioner-quick-panel, #pf2e-visioner-quick-panel').first();
  await panel.waitFor();
  await panel.locator('[data-action="toggleMode"]').click();
  for (const state of ['hidden', 'observed']) {
    await panel.locator(`[data-action="setVisibility"][data-state="${state}"]`).click();
    await c.check({ state: 'observed', reverseState: state }, true, `target-mode-${state}-only-reverses-pair`);
  }
  await panel.locator('[data-action="clearAll"]').click();
  const selection = await c.gm.evaluate(() => ({ controlled: canvas.tokens.controlled.length, targets: game.user.targets.size }));
  c.equal(selection, { controlled: 0, targets: 0 }, 'Clear All releases selected and targeted tokens');
  await closeDialogs(c);
}

async function presenceInteraction(c, sense) {
  // Darkness removes sight; deafness removes hearing without introducing the
  // blind-and-deaf fallback marker, so this exercises the requested sense.
  await c.mutate('condition', 'deafened');
  const marker = async label => {
    await c.check({ state: 'hidden', sense, presenceMode: sense, presenceVisible: true }, false, label);
    await c.player.bringToFront();
    await c.player.mouse.move(10, 10);
    const { rect } = await c.rpc(c.player, 'snapshot', c.fixture);
    const png = PNG.sync.read(await c.player.screenshot());
    let pixels = 0;
    for (let y = Math.max(0, Math.floor(rect.y - 8)); y < Math.min(png.height, rect.y + rect.height + 8); y++) {
      for (let x = Math.max(0, Math.floor(rect.x - 8)); x < Math.min(png.width, rect.x + rect.width + 8); x++) {
        const i = (y * png.width + x) * 4;
        const [r, g, b] = png.data.subarray(i, i + 3);
        const matches = sense === 'scent' ? r > 35 && r > g * 1.25 && g > b * 1.35 && b < 90
          : sense === 'lifesense' ? g > 35 && b > 45 && g > r * 1.5 && b > r * 1.5
            : r > 30 && b > 40 && r > g * 1.5 && b > g * 1.5;
        if (matches) pixels++;
      }
    }
    c.assert(pixels > 30, `${label}: ${sense} colored marker rendered at target (${pixels} pixels)`);
    return rect;
  };
  const rect = await marker('initial-marker');
  await c.player.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  for (const targeted of [true, false]) {
    await c.player.keyboard.press('t');
    await c.player.waitForFunction(({ id, targeted }) => canvas.tokens.get(id).isTargeted === targeted,
      { id: c.fixture.target, targeted });
    c.equal(await c.player.evaluate(id => canvas.tokens.get(id).isTargeted, c.fixture.target), targeted,
      targeted ? 'marker-keyboard-target' : 'marker-keyboard-untarget');
  }
  await marker('untarget-restores-sense-color');
  for (let cycle = 0; cycle < 5; cycle++) {
    await c.mutate('move', 1200);
    await c.check({ presenceVisible: false }, false, `out-of-range-hides-marker-${cycle}`);
    await c.mutate('move', 800);
    await marker(`range-return-restores-marker-${cycle}`);
  }
  await c.player.reload();
  await c.player.waitForFunction(() => game.ready && canvas.ready);
  await c.rpc(c.player, 'view', c.fixture);
  await marker('reload-restores-marker');
}
