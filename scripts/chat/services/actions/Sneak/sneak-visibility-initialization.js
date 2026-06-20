import { MODULE_ID, SNEAK_FLAGS } from '../../../../constants.js';
import { resolveSneakingToken } from './sneak-token-resolution.js';

async function applySneakSpeedEffect(sneakingToken, applySneakWalkSpeed) {
  try {
    if (applySneakWalkSpeed) {
      await applySneakWalkSpeed(sneakingToken);
      return;
    }
    const { SneakSpeedService } = await import('../../SneakSpeedService.js');
    await SneakSpeedService.applySneakWalkSpeed(sneakingToken);
  } catch (error) {
    console.warn('PF2E Visioner | Failed to apply sneak walk speed:', error);
  }
}

async function loadVisibilityCalculator(provided) {
  if (provided) return provided;
  const { optimizedVisibilityCalculator } = await import(
    '../../../../visibility/auto-visibility/index.js'
  );
  if (!optimizedVisibilityCalculator) {
    throw new Error('optimizedVisibilityCalculator is undefined');
  }
  return optimizedVisibilityCalculator;
}

async function loadVisibilityMapGetter(provided) {
  if (provided) return provided;
  const { getVisibilityMap } = await import('../../../../stores/visibility-map.js');
  return getVisibilityMap;
}

async function recalculateSneakingTokens(provided) {
  try {
    if (provided) {
      await provided();
      return;
    }
    const { eventDrivenVisibilitySystem } = await import(
      '../../../../visibility/auto-visibility/EventDrivenVisibilitySystem.js'
    );
    if (eventDrivenVisibilitySystem) {
      await eventDrivenVisibilitySystem.recalculateSneakingTokens();
    }
  } catch (error) {
    console.warn('PF2E Visioner | Failed to trigger AVS recalculation:', error);
  }
}

function tokenPosition(token) {
  return {
    x: token.document.x,
    y: token.document.y,
    elevation: token.document.elevation || 0,
  };
}

export async function initializeSneakVisibility(
  actionData,
  {
    getSneakingToken = resolveSneakingToken,
    applySneakWalkSpeed = null,
    visibilityCalculator = null,
    getVisibilityMap = null,
    recalculateSneaking = null,
  } = {},
) {
  try {
    if (actionData.previewOnly) return;

    const sneakingToken = getSneakingToken(actionData);
    if (!sneakingToken) return;

    await sneakingToken.document.setFlag(MODULE_ID, SNEAK_FLAGS.SNEAK_ACTIVE, true);
    await applySneakSpeedEffect(sneakingToken, applySneakWalkSpeed);

    const observerTokens = (canvas.tokens.placeables || [])
      .filter((token) => token && token.actor)
      .filter((token) => token.id !== sneakingToken.id);
    const calculator = await loadVisibilityCalculator(visibilityCalculator);
    const getMap = await loadVisibilityMapGetter(getVisibilityMap);

    for (const observer of observerTokens) {
      try {
        const observerToSneaking = await calculator.calculateVisibilityBetweenTokens(
          observer,
          sneakingToken,
          tokenPosition(observer),
          tokenPosition(sneakingToken),
        );
        const observerVisibilityMap = getMap(observer);
        observerVisibilityMap[sneakingToken.document.id] = observerToSneaking;
      } catch (error) {
        console.error('PF2E Visioner | Error processing observer:', observer.name, error);
      }
    }

    await recalculateSneakingTokens(recalculateSneaking);
  } catch (error) {
    console.error('PF2E Visioner | Error initializing sneak visibility:', error);
    console.error('PF2E Visioner | Error stack:', error.stack);
    console.error('PF2E Visioner | Error details:', {
      name: error.name,
      message: error.message,
      cause: error.cause,
    });
  }
}
