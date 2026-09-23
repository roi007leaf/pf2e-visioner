const MODULE = 'pf2e-visioner';
const ALLOWED = new Set([
  'sneakAllowHiddenUndetectedEndPosition',
  'enableHoverTooltips', 'autoVisibilityEnabled', 'avsOnlyInCombat', 'systemConditionOverrides',
  'enableCameraVisionAggregation', 'disableLineOfSightCalculation', 'cornerPeekEnabled',
  'requireGmApprovalForDoorPeek', 'playerPeekBlockMode', 'peekRange', 'peekSlitAngle', 'peekSweepAngle',
  'hiddenWallsEnabled', 'computeCoverAtCombatStart', 'autoCover', 'seekUseTemplate',
  'seekTemplateSkipDialog', 'seekTemplateMaxPlacementDistance', 'limitSeekRangeInCombat',
  'limitSeekRangeOutOfCombat', 'customSeekDistance', 'customSeekDistanceOutOfCombat',
  'avsOverrideValidationOnTurnChange', 'avsSkipTimedOverrideValidation',
  'autoCoverIgnoreAllies', 'autoCoverIgnoreUndetected', 'autoCoverIgnoreDead',
  'autoCoverIgnoreSmallerTokens', 'autoCoverIgnoreSameSizeTokens', 'autoCoverIgnoreLargerTokens',
  'autoCoverAllowProneBlockers', 'autoCoverTokenIntersectionMode', 'wallCoverAllowGreater',
  'wallCoverStandardThreshold', 'wallCoverGreaterThreshold', 'enableStealthInitiativeVisibility',
  'raisePcShieldsWhenDefending', 'enrageBarbariansAtCombatStart',
]);
function namespace(key) { return key === 'core.scrollingStatusText' ? 'core' : MODULE; }
function settingKey(key) { return key === 'core.scrollingStatusText' ? 'scrollingStatusText' : key; }
function settingId(key) { return `${namespace(key)}.${settingKey(key)}`; }
function authorize(worldId, key) {
  if (!game.user.isGM || !worldId || game.world.id !== worldId) throw Error('Disposable-world GM required');
  if ((!ALLOWED.has(key) && key !== 'core.scrollingStatusText') || game.settings.settings.get(settingId(key))?.scope !== 'world') throw Error('Setting is not allowed for live QA');
}
function stored(key) { return game.settings.storage.get('world').find(entry => entry.key === settingId(key)); }
export function captureSettings({ worldId, keys }) {
  return { worldId, settings: keys.map(key => {
    authorize(worldId, key);
    return { key, value: game.settings.get(namespace(key), settingKey(key)), existed: !!stored(key) };
  }) };
}
export async function changeSetting({ worldId, runId, key, value }) {
  authorize(worldId, key);
  if (canvas.scene?.getFlag(MODULE, 'liveTestRun') !== runId) throw Error('Test scene required for settings change');
  const current = game.settings.get(namespace(key), settingKey(key));
  if (typeof value !== typeof current || !['boolean', 'number', 'string'].includes(typeof value) ||
    (typeof value === 'number' && !Number.isFinite(value))) throw Error('Test setting value has invalid type');
  await game.settings.set(namespace(key), settingKey(key), value);
}
export async function restoreSettings(record) {
  if (!record) return;
  // Validate the whole record before performing any writes.
  for (const { key } of record.settings) authorize(record.worldId, key);
  for (const { key, value, existed } of record.settings) {
    if (game.settings.get(namespace(key), settingKey(key)) !== value) await game.settings.set(namespace(key), settingKey(key), value);
    if (!existed && stored(key)) await stored(key).delete();
    if (game.settings.get(namespace(key), settingKey(key)) !== value || !!stored(key) !== existed) throw Error(`Setting restoration failed: ${key}`);
  }
}
