import { canRenderTooltipToken } from './hover-tooltip-visibility-requests.js';

export const DETECTION_FACTOR_KEYWORDS = [
  'Detected by',
  'detected by',
  'vision',
  'Vision',
  'Darkvision',
  'darkvision',
  'Low-light',
  'low-light',
  'lifesense',
  'Lifesense',
  'thoughtsense',
  'Thoughtsense',
  'tremorsense',
  'Tremorsense',
  'tremor',
  'vibration',
  'Vibration',
  'vibrationsense',
  'Vibrationsense',
  'scent',
  'Scent',
  'smell',
  'Smell',
  'odor',
  'Odor',
  'stench',
  'Stench',
  'hearing',
  'Hearing',
  'Heard',
  'hear',
  'Hear',
  'echolocation',
  'Echolocation',
  'wavesense',
  'Wavesense',
  'blindsight',
  'Blindsight',
  'bloodsense',
  'Bloodsense',
  'touch',
  'Touch',
  'tactile',
  'Tactile',
  'pressure',
  'Pressure',
  'taste',
  'Taste',
  'gustation',
  'Gustation',
  'sees',
  'see',
  'sense',
  'Sense',
];

function defaultLocalize(key) {
  return key;
}

function defaultFormatStateLabel(state) {
  return state;
}

export function normalizeVisibilityFactorLightingKey(lightingKey) {
  if (
    lightingKey?.startsWith?.('magicalDarkness') &&
    lightingKey !== 'magicalDarkness' &&
    lightingKey !== 'greaterMagicalDarkness'
  ) {
    return 'magicalDarkness';
  }

  return lightingKey;
}

export function isDetectionFactorReason(reason) {
  return DETECTION_FACTOR_KEYWORDS.some((keyword) => reason.includes(keyword));
}

export function buildVisibilityFactorTooltipLines(
  factors,
  { localize = defaultLocalize, formatStateLabel = defaultFormatStateLabel } = {},
) {
  const lines = [];

  if (factors?.state) {
    const localizedState = formatStateLabel(factors.state);
    const stateLabel = localize('PF2E_VISIONER.VISIBILITY_FACTORS.STATE_LABEL');
    lines.push({ text: `${stateLabel}: ${localizedState}` });
  }

  if (factors?.lighting) {
    const lightingKey = normalizeVisibilityFactorLightingKey(factors.lighting);
    const lightingText = localize(`PF2E_VISIONER.VISIBILITY_FACTORS.LIGHTING.${lightingKey}`);
    const lightingLabel = localize('PF2E_VISIONER.VISIBILITY_FACTORS.LIGHTING_LABEL');
    lines.push({ text: `${lightingLabel}: ${lightingText}` });
  }

  if (Array.isArray(factors?.reasons) && factors.reasons.length > 0) {
    lines.push({ text: '' });

    factors.reasons.forEach((reason) => {
      if (typeof reason !== 'string') return;

      lines.push({
        text: reason,
        bullet: true,
        emphasized: isDetectionFactorReason(reason),
      });
    });
  }

  if (lines.length === 0) {
    const unknownState = localize('PF2E_VISIONER.VISIBILITY_FACTORS.UNKNOWN_STATE');
    lines.push({ text: factors?.state || unknownState });
  }

  return lines;
}

export function serializeVisibilityFactorTooltipLine(line) {
  if (typeof line === 'string') return line;
  if (!line) return '';

  const text = line.text ?? '';
  if (line.bullet && line.emphasized) return `&bull; <strong>${text}</strong>`;
  if (line.bullet) return `&bull; ${text}`;
  return text;
}

export function formatVisibilityFactors(
  factors,
  { localize = defaultLocalize, formatStateLabel = defaultFormatStateLabel } = {},
) {
  const lines = buildVisibilityFactorTooltipLines(factors, {
    localize,
    formatStateLabel,
  }).map(serializeVisibilityFactorTooltipLine);

  return lines.join('\n');
}

export function getVisibilityFactorTargets(allTokens = [], observerToken = null) {
  return allTokens.filter(
    (token) => token && token !== observerToken && canRenderTooltipToken(token),
  );
}

export async function buildVisibilityFactorIndicatorRequests({
  observerToken,
  targetTokens = [],
  getVisibilityFactors,
  formatFactors = formatVisibilityFactors,
  buildLines = buildVisibilityFactorTooltipLines,
  onError = () => {},
} = {}) {
  if (!observerToken || typeof getVisibilityFactors !== 'function') return [];

  const requests = await Promise.all(
    targetTokens.map(async (targetToken) => {
      try {
        const factors = await getVisibilityFactors(observerToken.id, targetToken.id);
        if (!factors) return null;

        return {
          observerToken,
          targetToken,
          factorText: formatFactors(factors),
          factorLines: buildLines(factors),
          state: factors.state,
          factors,
        };
      } catch (error) {
        onError(error, { observerToken, targetToken });
        return null;
      }
    }),
  );

  return requests.filter(Boolean);
}
