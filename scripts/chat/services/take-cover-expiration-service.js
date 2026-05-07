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

export async function expireTakeCoverOnAttackMessage(message) {
  if (!game.user?.isGM) return false;
  if (!isAttackActionMessage(message)) return false;

  const token = resolveMessageToken(message);
  if (!token?.actor) return false;

  const { removeTakeCoverProneRangedEffects } = await import('../../cover/batch.js');
  await removeTakeCoverProneRangedEffects(token);
  return true;
}
