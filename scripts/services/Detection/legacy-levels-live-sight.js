import { LevelsIntegration } from '../LevelsIntegration.js';

/**
 * V13 Levels can leave the 2D vision polygon containing a token whose elevation is separated from
 * the observer by a floor. Core V14 owns that 3D sight decision, so only supplement the legacy API.
 */
export function legacyLevelsFloorBlocksSightBetween(observer, target) {
  try {
    const levels = LevelsIntegration.getInstance?.();
    if (!levels?.isLegacyActive) return false;
    if (levels.getVerticalDistance(observer, target) === 0) return false;
    return levels.test3DCollision(observer, target, 'sight');
  } catch {
    return false;
  }
}
