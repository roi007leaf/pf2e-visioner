/**
 * Position Capture Service
 * Captures token positions at the moment stealth rolls are made,
 * before the chat message is created and before users can move tokens.
 */

/**
 * Captures token position at roll time for stealth actions
 * @param {ChatMessage} message - The chat message being created
 */
export async function captureRollTimePosition(message) {
  // Quick check if this might be a stealth-related action
  if (!isStealthRelatedAction(message)) {
    return;
  }

  try {
    // Extract action data to determine if this is a sneak action
    const { extractActionData } = await import('./action-extractor.js');
    const actionData = await extractActionData(message);

    if (!actionData || actionData.actionType !== 'sneak') {
      return;
    }

    // Get the sneaking token
    const sneakingToken = actionData.actor;
    if (!sneakingToken) {
      return;
    }

    // Capture current position and store it in the message flags
    const rollTimePosition = {
      tokenId: sneakingToken.id,
      tokenName: sneakingToken.name,
      x: sneakingToken.x,
      y: sneakingToken.y,
      center: {
        x: sneakingToken.center.x,
        y: sneakingToken.center.y,
      },
      timestamp: Date.now(),
    };

    // Store the position in message flags so it can be retrieved later
    if (!message.flags) message.flags = {};
    if (!message.flags['pf2e-visioner']) message.flags['pf2e-visioner'] = {};
    message.flags['pf2e-visioner'].rollTimePosition = rollTimePosition;

  } catch (error) {
    console.warn('PF2E Visioner | Error capturing roll-time position:', error);
  }
}

/**
 * Quick check if a message might be stealth-related
 * @param {ChatMessage} message - The chat message
 * @returns {boolean} - True if potentially stealth-related
 */
function isStealthRelatedAction(message) {
  const context = message.flags?.pf2e?.context;
  const flavor = message.flavor?.toLowerCase?.() || '';

  // Quick checks for stealth-related content
  return (
    context?.type === 'skill-check' &&
    (context.options?.includes('action:sneak') ||
      context.slug === 'sneak' ||
      flavor.includes('sneak'))
  );
}

/**
 * Retrieves the roll-time position from a chat message
 * @param {ChatMessage} message - The chat message
 * @returns {Object|null} - The stored position data or null
 */
export function getRollTimePosition(message) {
  return message.flags?.['pf2e-visioner']?.rollTimePosition || null;
}
