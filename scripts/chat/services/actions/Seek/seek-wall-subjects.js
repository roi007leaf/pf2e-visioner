import { MODULE_ID } from '../../../../constants.js';
import { LevelsIntegration } from '../../../../services/LevelsIntegration.js';

export function buildHiddenWallSeekSubjects(walls, defaultWallDC) {
  return (walls || [])
    .filter((wall) => !!wall?.document?.getFlag?.(MODULE_ID, 'hiddenWall'))
    .map((wall) => {
      const dcOverride = Number(wall.document?.getFlag?.(MODULE_ID, 'stealthDC'));
      const dc = Number.isFinite(dcOverride) && dcOverride > 0 ? dcOverride : defaultWallDC;

      return { _isWall: true, _isHiddenWall: true, wall, dc };
    });
}

export function getSeekWallCurrentVisibility(actionData, subject) {
  try {
    const observerToken = actionData.actorToken || actionData.actor;
    let map = observerToken?.document?.getFlag?.(MODULE_ID, 'walls') || {};

    if (Object.keys(map).length === 0 && observerToken?.actor?.id) {
      const actorId = observerToken.actor.id;
      const allTokensOfSameActor = (canvas?.tokens?.placeables || []).filter(
        (token) => token.actor?.id === actorId,
      );

      for (const token of allTokensOfSameActor) {
        const tokenMap = token.document?.getFlag?.(MODULE_ID, 'walls') || {};
        if (Object.keys(tokenMap).length > 0) {
          map = tokenMap;
          break;
        }
      }
    }

    return map?.[subject.wall?.id] || 'hidden';
  } catch {
    return 'hidden';
  }
}

export async function buildSeekWallMetadata(subject) {
  if (!subject?._isWall) return {};

  try {
    const d = subject.wall?.document;
    const doorType = Number(d?.door) || 0;
    const name =
      d?.getFlag?.(MODULE_ID, 'wallIdentifier') ||
      (doorType === 2 ? 'Hidden Secret Door' : doorType === 1 ? 'Hidden Door' : 'Hidden Wall');
    const { getWallImage } = await import('../../../../utils.js');

    return {
      _isWall: true,
      wall: subject.wall,
      wallId: subject.wall?.id,
      wallIdentifier: name,
      wallImg: getWallImage(doorType),
    };
  } catch {
    return {};
  }
}

export function calculateDistanceToWall(token, wall) {
  try {
    if (!token?.center || !wall?.center) return Infinity;

    const dx = token.center.x - wall.center.x;
    const dy = token.center.y - wall.center.y;
    let distance = Math.hypot(dx, dy);

    const levelsIntegration = LevelsIntegration.getInstance();
    if (levelsIntegration.isActive) {
      const tokenElevation = levelsIntegration.getTokenElevation(token);
      const wallTop = wall.document?.flags?.['wall-height']?.top ?? tokenElevation;
      const wallBottom = wall.document?.flags?.['wall-height']?.bottom ?? tokenElevation;

      const wallMidElevation = (wallTop + wallBottom) / 2;
      const dz = tokenElevation - wallMidElevation;
      distance = Math.sqrt(distance * distance + dz * dz);
    }

    const gridSize = canvas?.grid?.size || 100;
    const unitDist = canvas?.scene?.grid?.distance || 5;
    return (distance / gridSize) * unitDist;
  } catch {
    return Infinity;
  }
}
