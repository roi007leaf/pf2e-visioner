import {
  DEFAULT_PERCEPTION_PROFILE,
  awarenessStateForLegacyVisibility,
  blocksCanvasDetection,
  canAttemptHideOrRemainHidden,
  hasStandardOrGreaterCover,
  hidesEncounterTracker,
  isConcealed,
  isHidden,
  isObserved,
  isUndetected,
  isUnnoticedAwareness,
  legacyVisibilityToProfile,
  normalizePerceptionProfile,
  profileToLegacyVisibility,
} from '../../../scripts/visibility/perception-profile.js';

describe('perception profile adapter', () => {
  test('legacy concealed is observed plus concealment', () => {
    expect(legacyVisibilityToProfile('concealed')).toMatchObject({
      detectionState: 'observed',
      hasConcealment: true,
      coverState: 'none',
      detectionSense: null,
      awarenessState: null,
    });
  });

  test('legacy hidden and undetected do not imply concealment', () => {
    expect(legacyVisibilityToProfile('hidden')).toMatchObject({
      detectionState: 'hidden',
      hasConcealment: false,
    });
    expect(legacyVisibilityToProfile('undetected')).toMatchObject({
      detectionState: 'undetected',
      hasConcealment: false,
    });
  });

  test('legacy unnoticed is undetected plus encounter awareness', () => {
    expect(legacyVisibilityToProfile('unnoticed')).toMatchObject({
      detectionState: 'undetected',
      awarenessState: 'unnoticed',
      hasConcealment: false,
    });
    expect(awarenessStateForLegacyVisibility('unnoticed')).toBe('unnoticed');
  });

  test('observed with concealment serializes to legacy concealed', () => {
    expect(profileToLegacyVisibility({
      detectionState: 'observed',
      hasConcealment: true,
    })).toBe('concealed');
  });

  test('unnoticed awareness serializes to undetected by default', () => {
    expect(profileToLegacyVisibility({
      detectionState: 'undetected',
      awarenessState: 'unnoticed',
    })).toBe('undetected');
  });

  test('legacy unnoticed can be preserved explicitly for encounter transition', () => {
    expect(profileToLegacyVisibility(
      {
        detectionState: 'undetected',
        awarenessState: 'unnoticed',
      },
      { preserveEncounterUnnoticed: true },
    )).toBe('unnoticed');
  });

  test('predicates ask explicit rules questions', () => {
    const concealedObserved = legacyVisibilityToProfile('concealed');
    const hidden = legacyVisibilityToProfile('hidden');
    const undetected = legacyVisibilityToProfile('undetected');
    const unnoticed = legacyVisibilityToProfile('unnoticed');

    expect(isObserved(concealedObserved)).toBe(true);
    expect(isConcealed(concealedObserved)).toBe(true);
    expect(isHidden(hidden)).toBe(true);
    expect(isUndetected(undetected)).toBe(true);
    expect(isUndetected(unnoticed)).toBe(true);
    expect(isUnnoticedAwareness(unnoticed)).toBe(true);
    expect(blocksCanvasDetection(undetected)).toBe(true);
    expect(blocksCanvasDetection(unnoticed)).toBe(true);
    expect(hidesEncounterTracker(unnoticed, { source: 'encounter_stealth_initiative' })).toBe(true);
    expect(hidesEncounterTracker(unnoticed, { source: 'manual_action' })).toBe(false);
  });

  test('hide prerequisite uses cover or concealment explicitly', () => {
    expect(canAttemptHideOrRemainHidden({ hasConcealment: true })).toBe(true);
    expect(canAttemptHideOrRemainHidden({ coverState: 'standard' })).toBe(true);
    expect(canAttemptHideOrRemainHidden({ coverState: 'greater' })).toBe(true);
    expect(hasStandardOrGreaterCover({ coverState: 'lesser' })).toBe(false);
    expect(canAttemptHideOrRemainHidden(DEFAULT_PERCEPTION_PROFILE)).toBe(false);
  });

  test('normalization is defensive for missing or legacy-shaped input', () => {
    expect(normalizePerceptionProfile()).toEqual(DEFAULT_PERCEPTION_PROFILE);
    expect(normalizePerceptionProfile({ state: 'concealed' })).toMatchObject({
      detectionState: 'observed',
      hasConcealment: true,
    });
    expect(normalizePerceptionProfile({ detectionState: 'unnoticed' })).toMatchObject({
      detectionState: 'undetected',
      awarenessState: 'unnoticed',
    });
  });

  test('normalization strips stale unnoticed awareness from non-undetected profiles', () => {
    expect(normalizePerceptionProfile({
      detectionState: 'observed',
      awarenessState: 'unnoticed',
    })).toMatchObject({
      detectionState: 'observed',
      awarenessState: null,
    });

    expect(normalizePerceptionProfile({
      state: 'concealed',
      awarenessState: 'unnoticed',
    })).toMatchObject({
      detectionState: 'observed',
      hasConcealment: true,
      awarenessState: null,
    });
  });

  test('encounter tracker hiding requires unnoticed undetected awareness', () => {
    expect(hidesEncounterTracker({
      detectionState: 'observed',
      awarenessState: 'unnoticed',
    }, { source: 'encounter_stealth_initiative' })).toBe(false);
    expect(hidesEncounterTracker({
      detectionState: 'undetected',
      awarenessState: 'unnoticed',
    }, { source: 'encounter_stealth_initiative' })).toBe(true);
  });
});
