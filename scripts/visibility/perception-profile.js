export const DEFAULT_PERCEPTION_PROFILE = {
  detectionState: 'observed',
  hasConcealment: false,
  coverState: 'none',
  detectionSense: null,
  awarenessState: null,
};

const VALID_DETECTION_STATES = new Set(['observed', 'hidden', 'undetected']);
const VALID_COVER_STATES = new Set(['none', 'lesser', 'standard', 'greater']);

function normalizeLegacyState(state) {
  return typeof state === 'string' ? state.toLowerCase() : 'observed';
}

function normalizeCoverState(coverState) {
  return VALID_COVER_STATES.has(coverState) ? coverState : DEFAULT_PERCEPTION_PROFILE.coverState;
}

function normalizeAwarenessState(awarenessState, detectionState) {
  return detectionState === 'undetected' ? awarenessState ?? null : null;
}

export function awarenessStateForLegacyVisibility(state) {
  return normalizeLegacyState(state) === 'unnoticed' ? 'unnoticed' : null;
}

export function legacyVisibilityToProfile(state, metadata = {}) {
  const legacyState = normalizeLegacyState(state);
  const profile = {
    ...DEFAULT_PERCEPTION_PROFILE,
    coverState: normalizeCoverState(metadata.coverState),
    detectionSense: metadata.detectionSense ?? DEFAULT_PERCEPTION_PROFILE.detectionSense,
    awarenessState: metadata.awarenessState ?? awarenessStateForLegacyVisibility(legacyState),
  };

  if (legacyState === 'concealed') {
    return {
      ...profile,
      detectionState: 'observed',
      hasConcealment: true,
      awarenessState: null,
    };
  }

  if (legacyState === 'hidden') {
    return {
      ...profile,
      detectionState: 'hidden',
      hasConcealment: false,
      awarenessState: null,
    };
  }

  if (legacyState === 'undetected' || legacyState === 'unnoticed') {
    return {
      ...profile,
      detectionState: 'undetected',
      hasConcealment: false,
    };
  }

  return {
    ...profile,
    detectionState: 'observed',
    hasConcealment: Boolean(metadata.hasConcealment),
    awarenessState: null,
  };
}

export function normalizePerceptionProfile(profile = {}) {
  if (typeof profile === 'string') {
    return legacyVisibilityToProfile(profile);
  }

  if (!profile || typeof profile !== 'object') {
    return { ...DEFAULT_PERCEPTION_PROFILE };
  }

  if (profile.state) {
    return legacyVisibilityToProfile(profile.state, profile);
  }

  if (profile.detectionState === 'concealed' || profile.detectionState === 'unnoticed') {
    return legacyVisibilityToProfile(profile.detectionState, profile);
  }

  const detectionState = VALID_DETECTION_STATES.has(profile.detectionState)
    ? profile.detectionState
    : DEFAULT_PERCEPTION_PROFILE.detectionState;

  return {
    ...DEFAULT_PERCEPTION_PROFILE,
    ...profile,
    detectionState,
    hasConcealment: Boolean(profile.hasConcealment),
    coverState: normalizeCoverState(profile.coverState),
    detectionSense: profile.detectionSense ?? DEFAULT_PERCEPTION_PROFILE.detectionSense,
    awarenessState: normalizeAwarenessState(
      profile.awarenessState ?? DEFAULT_PERCEPTION_PROFILE.awarenessState,
      detectionState,
    ),
  };
}

export function profileToLegacyVisibility(profile = {}, options = {}) {
  const normalized = normalizePerceptionProfile(profile);

  if (isConcealed(normalized)) return 'concealed';
  if (
    isUndetected(normalized)
    && isUnnoticedAwareness(normalized)
    && options.preserveEncounterUnnoticed
  ) {
    return 'unnoticed';
  }

  return normalized.detectionState;
}

export function isObserved(profile) {
  return normalizePerceptionProfile(profile).detectionState === 'observed';
}

export function isHidden(profile) {
  return normalizePerceptionProfile(profile).detectionState === 'hidden';
}

export function isUndetected(profile) {
  return normalizePerceptionProfile(profile).detectionState === 'undetected';
}

export function isConcealed(profile) {
  const normalized = normalizePerceptionProfile(profile);
  return normalized.detectionState === 'observed' && normalized.hasConcealment;
}

export function isUnnoticedAwareness(profile) {
  return normalizePerceptionProfile(profile).awarenessState === 'unnoticed';
}

export function hasStandardOrGreaterCover(profile) {
  return ['standard', 'greater'].includes(normalizePerceptionProfile(profile).coverState);
}

export function canAttemptHideOrRemainHidden(profile) {
  const normalized = normalizePerceptionProfile(profile);
  return normalized.hasConcealment || hasStandardOrGreaterCover(normalized);
}

export function blocksCanvasDetection(profile) {
  return isUndetected(profile);
}

export function hidesEncounterTracker(profile, { source } = {}) {
  const normalized = normalizePerceptionProfile(profile);
  return (
    source === 'encounter_stealth_initiative'
    && normalized.detectionState === 'undetected'
    && normalized.awarenessState === 'unnoticed'
  );
}
