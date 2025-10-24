/**
 * Extract action data from a chat message. Supports Seek, Point Out, Hide, Sneak,
 * Create a Diversion, and damage consequences.
 */
export async function extractActionData(message) {
  if (!message) return null;

  const context = message.flags?.pf2e?.context;
  const origin = message.flags?.pf2e?.origin;

  const isPointOutAction =
    message.flavor?.toLowerCase?.().includes?.('point out') ||
    message.flavor?.toLowerCase?.().includes?.('указать') || // temporary fix for russian language
    context?.options?.some((opt) => opt.includes('action:point-out')) ||
    origin?.rollOptions?.some((opt) => opt.includes('item:point-out'));

  const isSeekAction =
    context?.type === 'perception-check' &&
    (context.options?.includes('action:seek') || context.slug === 'seek');

  // Only detect Create a Diversion if explicit context present
  const isCreateADiversionAction =
    context?.type === 'skill-check' &&
    (context.options?.some((opt) => opt.startsWith('action:create-a-diversion')) ||
      context.slug === 'create-a-diversion');

  // Take Cover: PF2e doesn't provide structured data for this action
  // Only detect via context/origin flags if they exist, or our module's flag (if we add one)
  const isTakeCoverAction =
    // Only treat as Take Cover when structured context or origin flags indicate the action.
    // Avoid matching generic messages that merely mention "Take Cover" (e.g., condition summaries).
    (context?.type === 'action' &&
      (context.options?.includes?.('action:take-cover') || context.slug === 'take-cover')) ||
    origin?.rollOptions?.includes?.('origin:item:take-cover') ||
    origin?.rollOptions?.includes?.('origin:item:slug:take-cover') ||
    message.flavor?.toLowerCase?.().includes?.('take cover') ||
    message.flavor?.includes?.("Mise à l'abri");

  // Only detect Avoid Notice if explicit context or origin flags present
  const isAvoidNoticeAction =
    origin?.rollOptions?.includes('origin:item:avoid-notice') ||
    origin?.rollOptions?.includes('origin:item:slug:avoid-notice') ||
    context?.options?.includes('action:avoid-notice');

  // Only detect Sneak if explicit context present
  const isSneakAction =
    context &&
    !isCreateADiversionAction &&
    !isAvoidNoticeAction &&
    context.type === 'skill-check' &&
    (context.options?.includes('action:sneak') || context.slug === 'sneak');

  // Check for hide action after sneak (less specific, can overlap)
  // Only rely on explicit context, not flavor text, to avoid false positives (e.g., "Hide Shield")
  const isHideAction =
    context &&
    !isCreateADiversionAction &&
    !isSneakAction &&
    context.type === 'skill-check' &&
    (context.options?.includes('action:hide') || context.slug === 'hide');

  const isAttackRoll =
    (context?.type === 'attack-roll' ||
      context?.type === 'spell-attack-roll' ||
      context?.type === 'strike-attack-roll' ||
      message.content?.includes('Attack Roll') ||
      message.content?.includes('Strike') ||
      context?.options?.some((opt) => opt.includes('attack-roll'))) &&
    !context?.domains?.some((dom) => dom.includes('skill-check')) &&
    context?.type !== 'self-effect';

  // Skip attack consequences for damage-taken messages
  const isDamageTakenMessage =
    context?.type === 'damage-taken' || message.flags?.pf2e?.appliedDamage;

  let actorToken = null;
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

  // Debug logging for action type detection

  let actionType = null;
  if (isSeekAction) actionType = 'seek';
  else if (isPointOutAction) actionType = 'point-out';
  else if (isSneakAction)
    actionType = 'sneak'; // Check sneak BEFORE hide
  else if (isHideAction) actionType = 'hide';
  else if (isCreateADiversionAction) actionType = 'create-a-diversion';
  else if (isTakeCoverAction) actionType = 'take-cover';
  else if (isAttackRoll && !isDamageTakenMessage) {
    const flags = actorToken?.document?.flags?.['pf2e-visioner'] || {};
    const hasHiddenOverride = Object.entries(flags).some(([k, v]) =>
      k.startsWith('avs-override-from-') && ['hidden', 'undetected'].includes(v?.state));
    if (hasHiddenOverride) actionType = 'consequences';
  }

  if (!actionType) return null;

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

  if (context?.type === 'skill-check' && message.rolls?.[0]) {
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
