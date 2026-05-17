import { MODULE_ID } from '../../constants.js';
import { notify } from './infra/notifications.js';

const EXPIRATION_FLAG = 'takeCoverExpiration';
const ACCEPT_ACTION = 'pf2e-visioner-take-cover-expiration-accept';
const pendingExpirationPrompts = new Set();

function optionList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  return [];
}

function traitList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  if (Array.isArray(value.value)) return value.value;
  return [];
}

function hasAttackTrait(message, context) {
  const origin = message?.flags?.pf2e?.origin;
  const options = optionList(context?.options).concat(optionList(origin?.rollOptions));
  if (
    options.some(
      (option) =>
        option === 'attack' ||
        option === 'trait:attack' ||
        option === 'item:trait:attack' ||
        option.endsWith(':trait:attack'),
    )
  ) {
    return true;
  }

  const traits = [
    ...traitList(context?.traits),
    ...traitList(context?.item?.traits),
    ...traitList(origin?.traits),
    ...traitList(origin?.item?.traits),
  ];
  return traits.includes('attack');
}

function isAttackActionMessage(message) {
  const context = message?.flags?.pf2e?.context;
  if (!context) return false;
  if (context.type === 'damage-taken' || context.type === 'self-effect') return false;
  if (message?.flags?.pf2e?.appliedDamage) return false;

  const options = optionList(context.options);
  const isAttackRoll =
    context.type === 'attack-roll' ||
    context.type === 'spell-attack-roll' ||
    context.type === 'strike-attack-roll' ||
    context.type === 'impulse-attack-roll' ||
    options.some((option) => option.includes('attack-roll'));

  if (isAttackRoll && !context.domains?.some?.((domain) => domain.includes('skill-check'))) {
    return true;
  }

  return hasAttackTrait(message, context);
}

function resolveMessageToken(message) {
  if (message?.token?.object) return message.token.object;

  if (message?.speaker?.token && canvas?.tokens?.get) {
    const token = canvas.tokens.get(message.speaker.token);
    if (token) return token;
  }

  if (message?.speaker?.actor) {
    try {
      const speakerActor = game.actors?.get?.(message.speaker.actor);
      return speakerActor?.getActiveTokens?.(true, true)?.[0] || null;
    } catch (_) {
      return null;
    }
  }

  return null;
}

function getTokenId(token) {
  return token?.document?.id || token?.id || null;
}

function getSceneId() {
  return canvas?.scene?.id || game?.scenes?.current?.id || 'current-scene';
}

function getPromptKey(token, reason) {
  return `${getSceneId()}:${getTokenId(token)}:${reason || 'unknown'}`;
}

export function isTakeCoverTrackingFlag(flagData, { includePending = true } = {}) {
  if (!includePending && flagData?.takeCoverExpirationPending === true) return false;
  return (
    flagData?.coverOnly === true ||
    flagData?.coverOverrideSource === 'take_cover_action' ||
    (flagData?.source === 'take_cover_action' && flagData?.expectedCover)
  );
}

function hasTakeCoverTrackingFlag(flagData) {
  return isTakeCoverTrackingFlag(flagData, { includePending: false });
}

export function tokenHasTakeCoverExpirationState(token) {
  try {
    const flags = token?.document?.flags?.[MODULE_ID] || {};
    if (Object.values(flags).some((flagData) => hasTakeCoverTrackingFlag(flagData))) return true;
  } catch {}

  try {
    return (
      token?.actor?.itemTypes?.effect?.some?.(
        (effect) => effect.flags?.[MODULE_ID]?.takeCoverProneRangedOnly === true,
      ) === true
    );
  } catch {
    return false;
  }
}

export function tokenHasActiveTakeCoverState(tokenLike) {
  try {
    const token = tokenLike?.object || tokenLike;
    const flags = token?.document?.flags?.[MODULE_ID] || token?.flags?.[MODULE_ID] || {};
    if (
      Object.values(flags).some((flagData) =>
        isTakeCoverTrackingFlag(flagData, { includePending: true }),
      )
    ) {
      return true;
    }

    return (
      token?.actor?.itemTypes?.effect?.some?.(
        (effect) => effect.flags?.[MODULE_ID]?.takeCoverProneRangedOnly === true,
      ) === true
    );
  } catch {
    return false;
  }
}

export function notifyTakeCoverAlreadyActive(tokenLike) {
  const token = tokenLike?.object || tokenLike;
  const tokenName = token?.name || token?.document?.name || token?.actor?.name || 'Token';
  notify.warn(`${tokenName} already has Take Cover. Remove it before taking cover again.`);
}

function hasPendingPrompt(promptKey) {
  if (pendingExpirationPrompts.has(promptKey)) return true;
  try {
    const messages = game.messages?.contents || Array.from(game.messages || []);
    return messages.some?.((message) => {
      const data =
        message?.flags?.[MODULE_ID]?.[EXPIRATION_FLAG] ||
        message?.getFlag?.(MODULE_ID, EXPIRATION_FLAG);
      return data?.promptKey === promptKey && data?.status === 'pending';
    });
  } catch {
    return false;
  }
}

function reasonLabel(reason) {
  switch (reason) {
    case 'movement':
      return 'moved from their current space';
    case 'attack':
      return 'used an attack action';
    case 'unconscious':
      return 'became unconscious, dying, or dead';
    default:
      return 'met an ending condition';
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPendingContent({ tokenName, reason }) {
  const safeName = escapeHtml(tokenName);
  const safeReason = escapeHtml(reasonLabel(reason));
  return `
    <div class="pf2e-visioner-take-cover-expiration-card">
      <h3><i class="fas fa-shield-alt"></i> Take Cover Should End</h3>
      <p><strong>${safeName}</strong> ${safeReason}. Remove Take Cover and return cover to normal automation?</p>
      <button type="button" class="visioner-btn visioner-btn-take-cover" data-action="${ACCEPT_ACTION}">
        <i class="fas fa-check"></i> Remove Take Cover
      </button>
    </div>
  `;
}

function buildAcceptedContent({ tokenName, reason }) {
  const safeName = escapeHtml(tokenName);
  const safeReason = escapeHtml(reasonLabel(reason));
  return `
    <div class="pf2e-visioner-take-cover-expiration-card resolved">
      <h3><i class="fas fa-shield-alt"></i> Take Cover removed</h3>
      <p><strong>${safeName}</strong> ${safeReason}. Take Cover removed.</p>
    </div>
  `;
}

async function markExpirationPending(token, reason) {
  try {
    const { default: AvsOverrideManager } = await import('./infra/AvsOverrideManager.js');
    await AvsOverrideManager.markTakeCoverExpirationPending(token, reason);
  } catch {}
}

export async function expireTakeCoverOnAttackMessage(message) {
  if (!game.user?.isGM) return false;
  if (!isAttackActionMessage(message)) return false;

  const token = resolveMessageToken(message);
  if (!token?.actor) return false;

  return requestTakeCoverExpirationForToken(token, 'attack');
}

export async function requestTakeCoverExpirationForToken(token, reason = 'unknown') {
  if (!game.user?.isGM) return false;
  if (!token?.actor) return false;
  if (!tokenHasTakeCoverExpirationState(token)) return false;

  const tokenId = getTokenId(token);
  if (!tokenId) return false;
  const promptKey = getPromptKey(token, reason);
  if (hasPendingPrompt(promptKey)) return true;

  const chatMessage = globalThis.ChatMessage;
  if (!chatMessage?.create) return false;

  const tokenName = token.name || token.document?.name || token.actor?.name || 'Token';
  const whisperRecipients = chatMessage.getWhisperRecipients?.('GM') || [];
  const whisper = whisperRecipients.map((user) => user.id).filter(Boolean);
  if (whisper.length === 0 && game.user?.id) whisper.push(game.user.id);

  pendingExpirationPrompts.add(promptKey);
  await markExpirationPending(token, reason);

  try {
    await chatMessage.create({
      speaker: chatMessage.getSpeaker?.({ token }) || { token: tokenId },
      whisper,
      content: buildPendingContent({ tokenName, reason }),
      flags: {
        [MODULE_ID]: {
          [EXPIRATION_FLAG]: {
            tokenId,
            tokenName,
            sceneId: getSceneId(),
            reason,
            status: 'pending',
            promptKey,
          },
        },
      },
    });
    return true;
  } catch (error) {
    pendingExpirationPrompts.delete(promptKey);
    throw error;
  }
}

export async function expireTakeCoverForToken(token, reason = 'unknown') {
  if (!game.user?.isGM) return false;
  if (!token?.actor) return false;

  const { removeTakeCoverProneRangedEffects } = await import('../../cover/batch.js');
  await removeTakeCoverProneRangedEffects(token);

  const { default: AvsOverrideManager } = await import('./infra/AvsOverrideManager.js');
  await AvsOverrideManager.expireTakeCoverForToken(token, reason);
  return true;
}

export async function acceptTakeCoverExpirationMessage(message) {
  if (!game.user?.isGM) return false;
  const data =
    message?.flags?.[MODULE_ID]?.[EXPIRATION_FLAG] ||
    message?.getFlag?.(MODULE_ID, EXPIRATION_FLAG);
  if (!data?.tokenId) return false;

  const token = canvas.tokens?.get?.(data.tokenId);
  if (!token?.actor) return false;

  const removed = await expireTakeCoverForToken(token, data.reason || 'unknown');
  if (!removed) return false;

  const promptKey = data.promptKey || getPromptKey(token, data.reason);
  pendingExpirationPrompts.delete(promptKey);

  try {
    await message.update?.({
      [`flags.${MODULE_ID}.${EXPIRATION_FLAG}.status`]: 'accepted',
      content: buildAcceptedContent({
        tokenName: data.tokenName || token.name || token.document?.name || 'Token',
        reason: data.reason || 'unknown',
      }),
    });
  } catch {}

  return true;
}

export function bindTakeCoverExpirationCard(message, element) {
  const data =
    message?.flags?.[MODULE_ID]?.[EXPIRATION_FLAG] ||
    message?.getFlag?.(MODULE_ID, EXPIRATION_FLAG);
  if (!data || data.status !== 'pending') return;

  const root = element?.querySelector ? element : element?.[0] || element?.get?.(0);
  const button = root?.querySelector?.(`[data-action="${ACCEPT_ACTION}"]`);
  if (!button) return;

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.disabled) return;
    button.disabled = true;
    try {
      await acceptTakeCoverExpirationMessage(message);
    } finally {
      button.disabled = false;
    }
  });
}
