import { MODULE_ID } from '../../constants.js';

export function readPeekDC(doorDoc) {
  const v = doorDoc?.getFlag?.(MODULE_ID, 'peekDC');
  return typeof v === 'number' && !Number.isNaN(v) ? v : null;
}

export async function rollPeekCheck({ token, dc, roll }) {
  const result = await roll({ token, dc });
  const degree = result?.degreeOfSuccess ?? 0;
  return { success: degree >= 2, degree };
}

export async function defaultPeekRoll({ token, dc }) {
  const statistic = token?.actor?.getStatistic?.('stealth') ?? token?.actor?.perception;
  const result = await statistic?.roll?.({ dc: { value: dc }, label: game.i18n.localize('PF2E_VISIONER.PEEK.CHECK_LABEL') });
  return { degreeOfSuccess: result?.degreeOfSuccess ?? 0 };
}
