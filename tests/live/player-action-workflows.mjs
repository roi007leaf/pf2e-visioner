import { interactiveMutation } from './runner-actions.mjs';
import { clickChatAction, closeDialogs, unfilter } from './ui-workflows.mjs';
import { playerSeekTemplate } from './player-seek-template.mjs';

const actions = ['hide', 'sneak', 'seek', 'strike', 'create-a-diversion'];
export const playerActionCases = [...actions.map(action => ({
  name: `player-native-${action}`, area: 'player-originated-actions', disposableWorld: true,
  settings: ['autoVisibilityEnabled', 'seekUseTemplate', 'limitSeekRangeInCombat', 'limitSeekRangeOutOfCombat'],
  steps: [{ workflow: `player-native-${action}` }],
})), ...actions.filter(action => action !== 'strike').map(action => ({
  name: `player-character-${action}`, area: 'player-originated-actions', observerType: 'character', disposableWorld: true,
  settings: ['autoVisibilityEnabled', 'seekUseTemplate', 'limitSeekRangeInCombat', 'limitSeekRangeOutOfCombat'],
  steps: [{ workflow: `player-native-${action}` }],
})), ...['circle', 'cone', 'cancel-config', 'cancel-placement'].map(mode => ({
  name: `player-seek-template-${mode}`, area: 'player-seek-template', observerType: 'character', disposableWorld: true,
  settings: ['autoVisibilityEnabled', 'seekUseTemplate', 'limitSeekRangeInCombat', 'limitSeekRangeOutOfCombat', 'seekTemplateSkipDialog', 'seekTemplateMaxPlacementDistance'],
  steps: [{ workflow: `player-seek-template-${mode}` }],
}))];

export const playerActionWorkflows = Object.fromEntries([...actions.map(action =>
  [`player-native-${action}`, c => playerAction(c, action)]), ...['circle', 'cone', 'cancel-config', 'cancel-placement'].map(mode =>
  [`player-seek-template-${mode}`, c => playerAction(c, 'seek', mode)])]);

async function playerAction(c, action, templateMode) {
  await c.setting('autoVisibilityEnabled', false);
  await c.setting('seekUseTemplate', !!templateMode);
  await c.setting('limitSeekRangeInCombat', false);
  await c.setting('limitSeekRangeOutOfCombat', false);
  await c.mutate('combat');
  if (templateMode) {
    await c.setting('seekTemplateSkipDialog', false);
    await c.setting('seekTemplateMaxPlacementDistance', 0);
    const combatId = await c.gm.evaluate(() => game.combat.id);
    await c.player.evaluate(async id => {
      await ui.combat.render({ force: true, combat: game.combats.get(id), renderContext: 'viewCombat', renderData: [] });
      if (game.combat?.id !== id) throw Error('Player must view QA encounter');
    }, combatId);
  }
  await c.mutate('cover', 'standard', { observer: c.fixture.target, target: c.fixture.observer });
  if (action === 'seek') await c.mutate('target-data', { 'system.skills.stealth.base': 0 });
  if (action === 'strike') await c.mutate('strike-item', { subject: 'observer' });
  const direction = action === 'seek' ? {} : { observer: c.fixture.target, target: c.fixture.observer };
  const initial = ['hide', 'create-a-diversion'].includes(action) ? 'observed' : action === 'strike' ? 'unnoticed' : 'hidden';
  const expected = ['hide', 'create-a-diversion'].includes(action) ? 'hidden' : action === 'sneak' ? 'undetected' : 'observed';
  await c.mutate('state', initial, direction);
  const playerId = await c.player.evaluate(() => game.user.id);
  await c.gm.evaluate(async ({ id, f, runId }) => {
    if (!game.user.isGM || canvas.scene.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId || game.users.get(id).isGM) throw Error('QA player required');
    await game.users.get(id).assignPermission('MANUAL_ROLLS', true);
  }, { id: playerId, f: c.fixture, runId: c.runId });
  await c.player.waitForFunction(() => game.user.hasPermission('MANUAL_ROLLS'));
  const saved = await c.player.evaluate(() => ({
    config: foundry.utils.deepClone(game.settings.get('core', foundry.dice.Roll.DICE_CONFIGURATION_SETTING)),
    manual: game.user.hasPermission('MANUAL_ROLLS'), isGM: game.user.isGM,
  }));
  c.assert(!saved.isGM, 'Action runs on a non-GM client');
  c.assert(saved.manual, 'Player account permits native manual dice');
  try {
    await c.player.evaluate(() => game.settings.set('core', foundry.dice.Roll.DICE_CONFIGURATION_SETTING, { default: 'manual', d20: 'manual' }));
    const before = await c.gm.evaluate(() => game.messages.contents.map(m => m.id));
    await interactiveMutation(c.player, action === 'strike' ? 'strike' : 'action-roll', { action, manualDie: 20 }, () =>
      c.player.evaluate(async ({ f, action, runId }) => {
        const token = canvas.tokens.get(f.observer), target = canvas.tokens.get(f.target);
        if (game.user.isGM || canvas.scene.id !== f.scene || canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId ||
          ![token, target].every(t => t?.document.getFlag('pf2e-visioner', 'liveTestRun') === runId) ||
          !token.actor.isOwner) throw Error('Player-owned QA fixture required');
        const hook = Hooks.on('preCreateChatMessage', message => {
          if (message.speaker.actor === token.actor.id) message.updateSource({ 'flags.pf2e-visioner.liveTestRun': runId });
        });
        try {
          token.control({ releaseOthers: true });
          target.setTarget(true, { releaseOthers: true });
          const event = new MouseEvent('click', { shiftKey: !game.user.settings.showCheckDialogs });
          if (action === 'strike') await token.actor.system.actions.find(a => a.item?.name === 'QA Strike').variants[0].roll({ event });
          else await game.pf2e.actions.get(action).use({ actors: [token.actor], target, event,
            ...(action === 'create-a-diversion' ? { variant: 'distracting-words' } : {}) });
        } finally { Hooks.off('preCreateChatMessage', hook); }
      }, { f: c.fixture, action, runId: c.runId }));
    const message = await c.player.evaluate(({ before, id }) => {
      const m = game.messages.contents.findLast(m => !before.includes(m.id) && m.speaker.token === id && m.rolls.length);
      return m ? { id: m.id, author: m.author.id, user: game.user.id, dice: m.rolls.flatMap(r => r.dice.flatMap(d => d.results.map(r => r.result))) } : null;
    }, { before, id: c.fixture.observer });
    c.assert(!!message && message.author === message.user, 'Native roll message authored by player');
    c.assert(message.dice.includes(20), 'Native roll contains manually entered natural 20');
    await c.gm.waitForFunction(id => game.messages.has(id), message.id);
    c.equal(await c.player.locator(`[data-message-id="${message.id}"] [data-action^="apply-now-"], [data-message-id="${message.id}"] [data-action="applyAll"]`).count(), 0,
      'Player chat exposes no GM Apply controls');
    if (templateMode) {
      await playerSeekTemplate(c, message, templateMode);
      return;
    }
    if (action === 'sneak') {
      await clickChatAction(c.player, `[data-message-id="${message.id}"] [data-action="start-sneak"]`);
      await c.gm.waitForFunction(id => !!game.messages.get(id)?.getFlag('pf2e-visioner', 'sneakStartStates'), message.id);
      await c.player.evaluate(async f => {
        const token = canvas.tokens.get(f.observer);
        if (!token.isOwner || canvas.scene.id !== f.scene || !token.document.getFlag('pf2e-visioner', 'liveTestRun')) throw Error('Owned test token required');
        await token.document.update({ x: 500 }, { animate: false });
      }, c.fixture);
      for (const page of [c.gm, c.player]) await page.waitForFunction(id => canvas.tokens.get(id)?.document.x === 500, c.fixture.observer);
      c.assert(true, 'Player Sneak movement synchronized to GM');
    }
    await closeDialogs(c);
    const kind = action === 'strike' ? 'consequences' : action;
    await clickChatAction(c.gm, `[data-message-id="${message.id}"] [data-action="open-${kind === 'create-a-diversion' ? 'diversion' : kind}-results"]`);
    const dialog = c.gm.locator(`.${kind}-preview-dialog`).last();
    await dialog.waitFor(); await unfilter(dialog);
    await dialog.locator('[data-action="applyAll"]').click();
    for (const session of ['gm', 'player']) await c.check({ state: expected }, undefined, `${action}-${session}-applied`, { ...direction, session });
    if (action === 'seek') await c.check({ state: 'observed', visible: true, filter: null }, true, 'player-seek-reveals-target-art');
    await dialog.locator('[data-action="revertAll"]').click();
    for (const session of ['gm', 'player']) await c.check({ state: initial }, undefined, `${action}-${session}-undone`, { ...direction, session });
  } finally {
    await c.player.evaluate(config => game.settings.set('core', foundry.dice.Roll.DICE_CONFIGURATION_SETTING, config), saved.config);
    c.equal(await c.player.evaluate(() => game.settings.get('core', foundry.dice.Roll.DICE_CONFIGURATION_SETTING)), saved.config, 'Player dice settings restored');
    await closeDialogs(c);
  }
}
