import { getTokenVerticalSpanFt } from './size-elevation-utils.js';

export function isWallHeightActive() {
    try {
        const active = game?.modules?.get?.('wall-height')?.active === true;
        console.log('PF2E Visioner | Wall Height | isWallHeightActive:', active, {
            hasGame: !!game,
            hasModules: !!game?.modules,
            hasWallHeight: !!game?.modules?.get?.('wall-height'),
            moduleActive: game?.modules?.get?.('wall-height')?.active,
            globalWallHeightAPI: !!globalThis.WallHeight,
            wallHeightAPIMethods: globalThis.WallHeight ? Object.keys(globalThis.WallHeight) : []
        });
        return active;
    } catch (error) {
        console.warn('PF2E Visioner | Wall Height | isWallHeightActive error:', error);
        return false;
    }
}

export function getWallBounds(wallDoc) {
    if (!isWallHeightActive()) {
        return { top: Infinity, bottom: -Infinity };
    }

    try {
        console.log('PF2E Visioner | Wall Height | getWallBounds for wall:', wallDoc?.id, {
            wallDocType: wallDoc?.constructor?.name,
            wallFlags: wallDoc?.flags,
            wallHeightFlags: wallDoc?.flags?.['wall-height']
        });

        // Wall Height stores elevation in flags["wall-height"].top and flags["wall-height"].bottom
        const top = wallDoc?.flags?.['wall-height']?.top ?? Infinity;
        const bottom = wallDoc?.flags?.['wall-height']?.bottom ?? -Infinity;

        console.log('PF2E Visioner | Wall Height | Wall bounds from flags:', { top, bottom });
        return { top, bottom };
    } catch (error) {
        console.warn('PF2E Visioner | Wall Height | getWallBounds error:', error);
        return { top: Infinity, bottom: -Infinity };
    }
}

export function getTokenHeight(token) {
    if (!isWallHeightActive()) return null;

    try {
        const tokenDoc = token?.document || token;

        console.log('PF2E Visioner | Wall Height | getTokenHeight for token:', token?.name || token?.id, {
            hasToken: !!token,
            hasTokenDoc: !!tokenDoc,
            hasFlags: !!tokenDoc?.flags,
            wallHeightFlags: tokenDoc?.flags?.['wall-height'],
            tokenHeight: tokenDoc?.flags?.['wall-height']?.tokenHeight
        });

        if (tokenDoc?.flags?.['wall-height']?.tokenHeight != null) {
            const height = Number(tokenDoc.flags['wall-height'].tokenHeight);
            console.log('PF2E Visioner | Wall Height | Token height from flags:', height);
            if (Number.isFinite(height) && height > 0) {
                return height;
            }
        }

        if (typeof globalThis.WallHeight?.getTokenHeight === 'function') {
            const height = globalThis.WallHeight.getTokenHeight(tokenDoc);
            console.log('PF2E Visioner | Wall Height | Token height from API:', height);
            if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
                return height;
            }
        }
    } catch (error) {
        console.warn('PF2E Visioner | Wall Height | getTokenHeight error:', error);
        return null;
    }

    console.log('PF2E Visioner | Wall Height | No token height found, returning null');
    return null;
}

export function canTokenSeeOverWall(token, wallDoc) {
    if (!isWallHeightActive()) return false;

    try {
        const wallBounds = getWallBounds(wallDoc);

        if (wallBounds.top === Infinity) {
            return false;
        }

        const tokenSpan = getTokenVerticalSpanFt(token);
        const wallHeightTokenHeight = getTokenHeight(token);

        const tokenEyeHeight = wallHeightTokenHeight
            ? (tokenSpan.bottom + wallHeightTokenHeight)
            : tokenSpan.top;

        return tokenEyeHeight > wallBounds.top;
    } catch {
        return false;
    }
}

export function canTokenSeeUnderWall(token, wallDoc) {
    if (!isWallHeightActive()) return false;

    try {
        const wallBounds = getWallBounds(wallDoc);

        if (wallBounds.bottom === -Infinity) {
            return false;
        }

        const tokenSpan = getTokenVerticalSpanFt(token);

        return tokenSpan.bottom < wallBounds.bottom;
    } catch {
        return false;
    }
}

export function doesWallBlockVertically(observerToken, targetToken, wallDoc) {
    if (!isWallHeightActive()) {
        console.log('PF2E Visioner | Wall Height | doesWallBlockVertically: Wall Height not active, returning true');
        return true;
    }

    try {
        const wallBounds = getWallBounds(wallDoc);

        if (wallBounds.top === Infinity && wallBounds.bottom === -Infinity) {
            console.log('PF2E Visioner | Wall Height | doesWallBlockVertically: Wall has infinite bounds, returning true');
            return true;
        }

        const observerSpan = getTokenVerticalSpanFt(observerToken);
        const targetSpan = getTokenVerticalSpanFt(targetToken);

        const minElevation = Math.min(observerSpan.bottom, targetSpan.bottom);
        const maxElevation = Math.max(observerSpan.top, targetSpan.top);

        const wallHeightObserver = getTokenHeight(observerToken);
        const wallHeightTarget = getTokenHeight(targetToken);

        const observerEyeHeight = wallHeightObserver
            ? (observerSpan.bottom + wallHeightObserver)
            : observerSpan.top;

        const targetTopHeight = wallHeightTarget
            ? (targetSpan.bottom + wallHeightTarget)
            : targetSpan.top;

        const lineOfSightTop = Math.max(observerEyeHeight, targetTopHeight);
        const lineOfSightBottom = Math.min(observerSpan.bottom, targetSpan.bottom);

        const wallBlocksAbove = wallBounds.bottom >= lineOfSightTop;
        const wallBlocksBelow = wallBounds.top <= lineOfSightBottom;

        console.log('PF2E Visioner | Wall Height | doesWallBlockVertically DETAILED:', {
            observerName: observerToken?.name,
            targetName: targetToken?.name,
            wallId: wallDoc?.id,
            wallBounds_top: wallBounds.top,
            wallBounds_bottom: wallBounds.bottom,
            observerSpan_top: observerSpan.top,
            observerSpan_bottom: observerSpan.bottom,
            targetSpan_top: targetSpan.top,
            targetSpan_bottom: targetSpan.bottom,
            observerEyeHeight,
            targetTopHeight,
            lineOfSightTop,
            lineOfSightBottom,
            wallBlocksAbove,
            wallBlocksBelow,
            canSeeOverOrUnder: wallBlocksAbove || wallBlocksBelow,
            willBlock: !(wallBlocksAbove || wallBlocksBelow) && !(lineOfSightBottom < wallBounds.bottom && lineOfSightTop > wallBounds.top)
        });

        if (wallBlocksAbove || wallBlocksBelow) {
            console.log('PF2E Visioner | Wall Height | Tokens can see over or under wall, returning false (wall does not block)');
            return false;
        }

        if (lineOfSightBottom < wallBounds.bottom && lineOfSightTop > wallBounds.top) {
            console.log('PF2E Visioner | Wall Height | Line of sight completely encompasses wall, returning false (wall does not block)');
            return false;
        }

        console.log('PF2E Visioner | Wall Height | Wall blocks vertically, returning true');
        return true;
    } catch (error) {
        console.warn('PF2E Visioner | Wall Height | doesWallBlockVertically error:', error);
        return true;
    }
}

export function getEffectiveWallHeightForCover(attackerToken, targetToken, wallDoc) {
    if (!isWallHeightActive()) {
        return null;
    }

    try {
        const wallBounds = getWallBounds(wallDoc);

        if (wallBounds.top === Infinity) {
            return null;
        }

        const attackerSpan = getTokenVerticalSpanFt(attackerToken);
        const targetSpan = getTokenVerticalSpanFt(targetToken);

        const attackerHeight = getTokenHeight(attackerToken);
        const attackerEyeHeight = attackerHeight
            ? (attackerSpan.bottom + attackerHeight)
            : attackerSpan.top;

        const targetHeight = getTokenHeight(targetToken);
        const targetTopHeight = targetHeight
            ? (targetSpan.bottom + targetHeight)
            : targetSpan.top;

        if (attackerEyeHeight > wallBounds.top && targetTopHeight > wallBounds.top) {
            return 0;
        }

        const wallHeight = wallBounds.top - wallBounds.bottom;
        const targetVisibleHeight = Math.max(0, targetTopHeight - wallBounds.top);
        const targetTotalHeight = targetHeight || (targetSpan.top - targetSpan.bottom);

        if (targetTotalHeight <= 0) return wallHeight;

        const coverageRatio = 1 - (targetVisibleHeight / targetTotalHeight);

        return wallHeight * coverageRatio;
    } catch {
        return null;
    }
}
