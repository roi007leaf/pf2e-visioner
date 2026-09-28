import { MODULE_ID } from '../../../../constants.js';

export function buildHiddenTileSeekSubjects(tiles, defaultDC) {
  return (tiles || [])
    .filter(tile => !!tile?.document?.getFlag?.(MODULE_ID, 'hiddenTile'))
    .map(tile => {
      const override = Number(tile.document.getFlag(MODULE_ID, 'stealthDC'));
      return {
        _isWall: true,
        _isTile: true,
        _isHiddenTile: true,
        wall: tile,
        dc: Number.isFinite(override) && override > 0 ? override : defaultDC,
      };
    });
}
