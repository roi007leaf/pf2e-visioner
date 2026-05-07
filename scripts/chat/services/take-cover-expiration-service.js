function isAttackRollMessage(message) {
  const context = message?.flags?.pf2e?.context;
  if (!context) return false;
  if (context.type === 'damage-taken' || context.type === 'self-effect') return false;
  if (message?.flags?.pf2e?.appliedDamage) return false;
  if (context.domains?.some?.((domain) => domain.includes('skill-check'))) return false;

  return (
    context.type === 'attack-roll' ||
    context.type === 'spell-attack-roll' ||
    context.type === 'strike-attack-roll' ||
    context.type === 'impulse-attack-roll' ||
    context.options?.some?.((option) => option.includes('attack-roll'))
  );
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
  if (!isAttackRollMessage(message)) return false;

  const token = resolveMessageToken(message);
  if (!token?.actor) return false;

  const { removeTakeCoverProneRangedEffects } = await import('../../cover/batch.js');
  await removeTakeCoverProneRangedEffects(token);
  return true;
}
