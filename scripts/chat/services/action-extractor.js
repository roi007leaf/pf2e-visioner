/**
 * Extract action data from a chat message. Supports Seek, Point Out, Hide, Sneak,
 * Create a Diversion, and damage consequences.
 */
import { overrideToDisplayVisibility } from '../../visibility/perception-profile.js';

function listFrom(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value[Symbol.iterator] === 'function') {
    try {
      return Array.from(value);
    } catch (_) {
      return [];
    }
  }
  return [];
}

function textFrom(value) {
  return typeof value === 'string' ? value : String(value ?? '');
}

function lowerTextFrom(value) {
  if (value && typeof value.toLowerCase === 'function') {
    return String(value.toLowerCase());
  }
  return textFrom(value).toLowerCase();
}

function trimmedTextFrom(value) {
  if (value && typeof value.trim === 'function') {
    return String(value.trim());
  }
  return textFrom(value).trim();
}

export async function extractActionData(message) {
  if (!message) return null;

  const context = message.flags?.pf2e?.context;
  const origin = message.flags?.pf2e?.origin;
  const contextOptions = listFrom(context?.options);
  const contextDomains = listFrom(context?.domains);
  const originRollOptions = listFrom(origin?.rollOptions);
  const flavorLower = lowerTextFrom(message.flavor);
  const flavorTrimmed = trimmedTextFrom(message.flavor);
  const isAttackRollContext =
    context?.type === 'attack-roll' ||
    context?.type === 'spell-attack-roll' ||
    context?.type === 'strike-attack-roll' ||
    context?.type === 'impulse-attack-roll' ||
    contextOptions.some((opt) => opt.includes('attack-roll'));

  const isPointOutAction =
    flavorLower.includes('point out') ||
    flavorLower.includes('указать') || // temporary fix for russian language
    contextOptions.some((opt) => opt.includes('action:point-out')) ||
    originRollOptions.some((opt) => opt.includes('item:point-out'));

  const isSeekAction =
    context?.type === 'perception-check' &&
    (contextOptions.includes('action:seek') || context.slug === 'seek');
  const searchExplorationFlag = message.flags?.['pf2e-visioner']?.searchExploration;
  const isSearchExplorationCheck =
    !!searchExplorationFlag ||
    contextOptions.some((opt) => opt === 'exploration:search' || opt === 'activity:search');

  // Only detect Create a Diversion if explicit context present
  const isCreateADiversionAction =
    context?.type === 'skill-check' &&
    (contextOptions.some((opt) => opt.startsWith('action:create-a-diversion')) ||
      context.slug === 'create-a-diversion');

  // Take Cover: PF2e doesn't provide structured data for this action
  // Only detect via context/origin flags if they exist, or our module's flag (if we add one)
  const isTakeCoverAction =
    // Only treat as Take Cover when structured context or origin flags indicate the action.
    // Avoid matching generic messages that merely mention "Take Cover" (e.g., condition summaries).
    (context?.type === 'action' &&
      (contextOptions.includes('action:take-cover') || context.slug === 'take-cover')) ||
    (!isAttackRollContext &&
      (originRollOptions.includes('origin:item:take-cover') ||
        originRollOptions.includes('origin:item:slug:take-cover') ||
        flavorLower.trim() === 'take cover' ||
        flavorTrimmed === "Mise à l'abri"));

  // Only detect Avoid Notice if explicit context or origin flags present
  const isAvoidNoticeAction =
    originRollOptions.includes('origin:item:avoid-notice') ||
    originRollOptions.includes('origin:item:slug:avoid-notice') ||
    contextOptions.includes('action:avoid-notice');

  // Only detect Sneak if explicit context present
  const isSneakAction =
    context &&
    !isCreateADiversionAction &&
    !isAvoidNoticeAction &&
    context.type === 'skill-check' &&
    (contextOptions.includes('action:sneak') || context.slug === 'sneak');

  // Check for hide action after sneak (less specific, can overlap)
  // Only rely on explicit context, not flavor text, to avoid false positives (e.g., "Hide Shield")
  const isHideAction =
    context &&
    !isCreateADiversionAction &&
    !isSneakAction &&
    context.type === 'skill-check' &&
    (contextOptions.includes('action:hide') || context.slug === 'hide');

  const isAttackRoll =
    (isAttackRollContext ||
      message.content?.includes('Attack Roll') ||
      message.content?.includes('Strike') ||
      contextOptions.some((opt) => opt.includes('attack-roll'))) &&
    !contextDomains.some((dom) => dom.includes('skill-check')) &&
    context?.type !== 'self-effect';

  // Skip attack consequences for damage-taken messages
  const isDamageTakenMessage =
    context?.type === 'damage-taken' || message.flags?.pf2e?.appliedDamage;

  let actorToken = null;
  const resolveActorToken = () => {
    if (actorToken) return actorToken;
    if (message.token?.object) {
      actorToken = message.token.object;
    } else if (message.speaker?.token && canvas?.tokens?.get) {
      actorToken = canvas.tokens.get(message.speaker.token);
    }
    if (!actorToken && message.speaker?.actor) {
      try {
        const speakerActor = game.actors?.get?.(message.speaker.actor);
        const activeTokens = speakerActor?.getActiveTokens?.(true, true) || [];
        actorToken = activeTokens[0] || null;
      } catch (_) { }
    }
    if (!actorToken && origin?.uuid && typeof fromUuidSync === 'function') {
      try {
        const originDoc = fromUuidSync(origin.uuid);
        const originActor = originDoc?.actor ?? originDoc?.parent?.actor ?? null;
        const activeTokens = originActor?.getActiveTokens?.(true, true) || [];
        actorToken = activeTokens[0] || null;
      } catch (_) { }
    }
    return actorToken;
  };

  // Debug logging for action type detection

  let actionType = null;
  if (isSeekAction || isSearchExplorationCheck) actionType = 'seek';
  else if (isPointOutAction) actionType = 'point-out';
  else if (isSneakAction)
    actionType = 'sneak'; // Check sneak BEFORE hide
  else if (isHideAction) actionType = 'hide';
  else if (isCreateADiversionAction) actionType = 'create-a-diversion';
  else if (isTakeCoverAction) actionType = 'take-cover';
  else if (isAttackRoll && !isDamageTakenMessage) {
    actorToken = resolveActorToken();
    const flags = actorToken?.document?.flags?.['pf2e-visioner'] || {};
    const hasHiddenOverride = Object.entries(flags).some(([k, v]) =>
      k.startsWith('avs-override-from-') &&
      ['hidden', 'undetected'].includes(overrideToDisplayVisibility(v)));
    if (hasHiddenOverride) actionType = 'consequences';
  }

  if (!actionType) return null;
  actorToken = resolveActorToken();

  // Build common action data object
  const data = {
    messageId: message.id,
    actor: actorToken,
    context,
    origin,
    actionType,
  };

  // Add attack roll data for consequences
  if (actionType === 'consequences') {
    data.attackData = { isAttackRoll: true };
  }

  if (actionType === 'seek' && isSearchExplorationCheck) {
    const radiusFeet = Number(searchExplorationFlag?.radiusFeet);
    data.searchExploration = true;
    data.searchExplorationRadiusFeet = Number.isFinite(radiusFeet) && radiusFeet > 0
      ? radiusFeet
      : undefined;
    data.searchExplorationTokenId =
      searchExplorationFlag?.tokenId ||
      message.speaker?.token ||
      actorToken?.id ||
      message.speaker?.actor ||
      null;
    data.searchExplorationTargetTokenId = searchExplorationFlag?.targetTokenId || null;
    data.searchExplorationTargetWallId = searchExplorationFlag?.targetWallId || null;
    data.searchExplorationGroupId = searchExplorationFlag?.groupId || null;
  }

  if ((context?.type === 'skill-check' || context?.type === 'perception-check') && message.rolls?.[0]) {
    try {
      const roll = message.rolls[0];
      const total = Number(roll.total ?? roll?._total ?? 0);
      const die = roll.dice?.[0]?.total ?? roll.terms?.[0]?.total;
      if (Number.isFinite(total)) {
        data.roll = { total, dice: [{ total: die }] };
      }
    } catch (_) { }
  }

  // For Point Out, include target reference if present
  try {
    if (actionType === 'point-out' && !data.context?.target && message.flags?.pf2e?.target) {
      data.context = data.context || {};
      data.context.target = { ...message.flags.pf2e.target };
    }
  } catch (_) { }

  return data;
}
