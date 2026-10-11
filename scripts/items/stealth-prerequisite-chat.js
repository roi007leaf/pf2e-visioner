import {
  applyStealthBypassEffect,
  getStealthPrerequisiteItemConfig,
} from './stealth-prerequisite-items.js';

const RECENT_MESSAGE_MS = 10_000;
const BUTTON_CLASS = 'pf2e-visioner-stealth-bypass-btn';

function getOrigin(message) {
  return message?.flags?.pf2e?.origin ?? null;
}

export function resolveMessageItem(message) {
  const origin = getOrigin(message);
  if (!origin) return null;
  try {
    return fromUuidSync(origin.uuid) ?? fromUuidSync(origin.sourceId) ?? null;
  } catch {
    return null;
  }
}

function isItemCard(message) {
  return String(message?.content ?? '').includes('item-card');
}

export function isConsumeMessage(message) {
  return getOrigin(message)?.type === 'consumable' && !isItemCard(message);
}

function getSpeakerActor(message) {
  const speaker = message?.speaker ?? {};
  const token = speaker.token ? canvas?.tokens?.get(speaker.token) : null;
  return token?.actor ?? game.actors?.get(speaker.actor) ?? null;
}

export function resolveRecipientActor(message) {
  const targets = Array.from(game.user?.targets ?? []);
  if (targets.length === 1 && targets[0]?.actor) return targets[0].actor;
  return getSpeakerActor(message);
}

function getAuthorId(message) {
  return message?.author?.id ?? message?.user?.id ?? message?.author ?? message?.user;
}

function isOwnRecentMessage(message) {
  if (getAuthorId(message) !== game.user?.id) return false;
  const age = Date.now() - Number(message?.timestamp ?? Date.now());
  return age <= RECENT_MESSAGE_MS;
}

export async function handleCreateChatMessage(message) {
  try {
    if (!isOwnRecentMessage(message) || !isConsumeMessage(message)) return;
    const item = resolveMessageItem(message);
    const config = getStealthPrerequisiteItemConfig(item);
    if (!config) return;
    await applyStealthBypassEffect(resolveRecipientActor(message), config, item);
  } catch (error) {
    console.warn('PF2E Visioner | Failed to apply stealth prerequisite item effect:', error);
  }
}

function shouldShowButton(message) {
  if (!isItemCard(message) || getOrigin(message)?.type === 'consumable') return null;
  const item = resolveMessageItem(message);
  const config = getStealthPrerequisiteItemConfig(item);
  return config ? { item, config } : null;
}

function createPanel(button) {
  const panel = document.createElement('div');
  panel.className = 'pf2e-visioner-automation-panel hide-panel';
  const actions = document.createElement('div');
  actions.className = 'automation-actions';
  actions.appendChild(button);
  panel.appendChild(actions);
  return panel;
}

function createButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `visioner-btn visioner-btn-stealth-item ${BUTTON_CLASS}`;
  button.dataset.tooltip = game.i18n.localize('PF2E_VISIONER.STEALTH_PREREQ_ITEMS.BUTTON_TOOLTIP');
  button.innerHTML = `<i class="fas fa-user-secret"></i> ${game.i18n.localize(
    'PF2E_VISIONER.STEALTH_PREREQ_ITEMS.BUTTON',
  )}`;
  return button;
}

export async function onStealthBypassButtonClick(message, item, config) {
  const actor = resolveRecipientActor(message);
  if (!actor?.isOwner) {
    ui.notifications?.warn(game.i18n.localize('PF2E_VISIONER.STEALTH_PREREQ_ITEMS.NO_PERMISSION'));
    return;
  }
  await applyStealthBypassEffect(actor, config, item);
  ui.notifications?.info(
    game.i18n.format('PF2E_VISIONER.STEALTH_PREREQ_ITEMS.APPLIED', {
      item: item?.name ?? config.slug,
      actor: actor.name,
    }),
  );
}

export function injectStealthBypassButton(message, element) {
  try {
    const match = shouldShowButton(message);
    if (!match || !element || element.querySelector(`.${BUTTON_CLASS}`)) return;
    const button = createButton();
    button.addEventListener('click', () => onStealthBypassButtonClick(message, match.item, match.config));
    (element.querySelector('.message-content') ?? element).appendChild(createPanel(button));
  } catch (error) {
    console.warn('PF2E Visioner | Failed to add stealth prerequisite item button:', error);
  }
}

let hooksRegistered = false;

export function registerStealthPrerequisiteItemHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;
  Hooks.on('createChatMessage', (message) => handleCreateChatMessage(message));
  Hooks.on('renderChatMessageHTML', (message, element) => injectStealthBypassButton(message, element));
}
