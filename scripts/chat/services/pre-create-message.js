async function defaultCaptureRollTimePosition(message) {
  const { captureRollTimePosition } = await import('./position-capture-service.js');
  return captureRollTimePosition(message);
}

async function defaultExpireTakeCoverOnAttackMessage(message) {
  const { expireTakeCoverOnAttackMessage } = await import('./take-cover-expiration-service.js');
  return expireTakeCoverOnAttackMessage(message);
}

export async function handlePreCreateChatMessage(
  message,
  {
    captureRollTimePosition = defaultCaptureRollTimePosition,
    expireTakeCoverOnAttackMessage = defaultExpireTakeCoverOnAttackMessage,
    warn = console.warn,
  } = {},
) {
  let positionCaptured = true;
  let takeCoverExpired = true;

  try {
    await captureRollTimePosition(message);
  } catch (error) {
    positionCaptured = false;
    warn('PF2E Visioner | Failed to capture roll-time position:', error);
  }

  try {
    await expireTakeCoverOnAttackMessage(message);
  } catch (error) {
    takeCoverExpired = false;
    warn('PF2E Visioner | Failed to expire Take Cover on attack:', error);
  }

  return { positionCaptured, takeCoverExpired };
}
