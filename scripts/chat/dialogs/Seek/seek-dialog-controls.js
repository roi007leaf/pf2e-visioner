import { MODULE_ID } from '../../../constants.js';

async function renderSeekDialog(app) {
  return app?.render?.({ force: true });
}

async function updateSetting(key, value) {
  try {
    await game.settings.set(MODULE_ID, key, value);
  } catch {
    /* Per-user setting persistence is non-critical */
  }
}

async function refreshFilteredOutcomes(app) {
  try {
    const list = await app.getFilteredOutcomes();
    app.outcomes = list;
    return renderSeekDialog(app);
  } catch {
    return renderSeekDialog(app);
  }
}

export function toggleSeekReactionsDropdown(app) {
  const dropdown = app?.element?.querySelector('.reactions-dropdown');
  const chevron = app?.element?.querySelector('.reactions-chevron');
  const toggleButton = app?.element?.querySelector('.reactions-toggle-button');

  if (!dropdown) return;

  const isVisible = dropdown.style.display !== 'none';
  dropdown.style.display = isVisible ? 'none' : 'block';
  chevron?.classList.toggle('rotated', !isVisible);
  toggleButton?.classList.toggle('active', !isVisible);
}

export function bindSeekInlineControls(app, content) {
  if (!content || content._pf2eVisionerSeekInlineControlsBound) return;
  content._pf2eVisionerSeekInlineControlsBound = true;

  content.addEventListener('change', async (event) => {
    const input = event.target?.closest?.('input[data-action]');
    if (!input || !content.contains(input)) return;

    if (input.dataset.action === 'toggleIgnoreAllies') {
      app.ignoreAllies = !!input.checked;
      app.bulkActionState = 'initial';
      await refreshFilteredOutcomes(app);
    } else if (input.dataset.action === 'toggleIgnoreWalls') {
      app.ignoreWalls = !!input.checked;
      app.bulkActionState = 'initial';
      await refreshFilteredOutcomes(app);
    } else if (input.dataset.action === 'toggleHideFoundryHidden') {
      app.hideFoundryHidden = !!input.checked;
      await updateSetting('hideFoundryHiddenTokens', app.hideFoundryHidden);
      await renderSeekDialog(app);
    }
  });

  content.addEventListener('click', async (event) => {
    const reactionButton = event.target?.closest?.('button[data-reaction]');
    if (reactionButton && content.contains(reactionButton)) {
      await app.applyReaction(reactionButton.dataset.reaction);
      return;
    }

    const actionButton = event.target?.closest?.('button[data-action]');
    if (!actionButton || !content.contains(actionButton)) return;

    if (actionButton.dataset.action === 'toggleReactions') {
      app.toggleReactionsDropdown();
    } else if (actionButton.dataset.action === 'applySenseUnseen') {
      await app.applySenseUnseen();
    }
  });
}

export async function toggleSeekEncounterFilter(app, target) {
  if (!app) return;
  app.encounterOnly = !!target.checked;
  app.bulkActionState = 'initial';
  return renderSeekDialog(app);
}

export async function toggleSeekFilterByDetection(app, target) {
  if (!app) return;
  app.filterByDetection = !!target.checked;
  app.bulkActionState = 'initial';
  return renderSeekDialog(app);
}

export async function toggleSeekIgnoreAllies(app, target) {
  if (!app) return;
  app.ignoreAllies = !!target.checked;
  app.bulkActionState = 'initial';
  await updateSetting('ignoreAllies', app.ignoreAllies);
  return renderSeekDialog(app);
}

export async function toggleSeekHideFoundryHidden(app, target) {
  if (!app) return;
  app.hideFoundryHidden = !!target.checked;
  app.bulkActionState = 'initial';
  await updateSetting('hideFoundryHiddenTokens', app.hideFoundryHidden);
  return renderSeekDialog(app);
}

export async function toggleSeekIgnoreWalls(app, target) {
  if (!app) return;
  app.ignoreWalls = !!target.checked;
  app.bulkActionState = 'initial';
  return renderSeekDialog(app);
}

export async function toggleSeekShowOnlyChanges(app, target) {
  if (!app) return;
  app.showOnlyChanges = !!target.checked;
  app.bulkActionState = 'initial';
  return renderSeekDialog(app);
}
