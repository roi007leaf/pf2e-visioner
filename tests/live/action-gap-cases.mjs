export const actionGapCases = [
  ...['hide', 'sneak', 'seek'].map(action => ({
    name: `action-gap-degrees-${action}`, area: 'action-degree-boundaries', disposableWorld: true,
    settings: ['autoVisibilityEnabled', 'seekUseTemplate', 'limitSeekRangeInCombat', 'limitSeekRangeOutOfCombat'],
    camera: { x: 900, y: 550, scale: 0.7 }, steps: [{ workflow: `action-gap-degrees-${action}` }],
  })),
  ...['combat', 'exploration', 'transition'].map(mode => ({
    name: `action-gap-range-${mode}`, area: 'seek-range-outcomes', disposableWorld: true,
    settings: ['autoVisibilityEnabled', 'seekUseTemplate', 'limitSeekRangeInCombat',
      'limitSeekRangeOutOfCombat', 'customSeekDistance', 'customSeekDistanceOutOfCombat'],
    camera: { x: 900, y: 550, scale: 0.7 }, steps: [{ workflow: `action-gap-range-${mode}` }],
  })),
  ...['start', 'end', 'legendary-sneak', 'very-very-sneaky'].map(mode => ({
    name: `action-gap-position-${mode}`, area: 'sneak-position-outcomes',
    targetType: 'character', disposableWorld: true,
    settings: ['autoVisibilityEnabled', 'sneakAllowHiddenUndetectedEndPosition'],
    camera: { x: 900, y: 550, scale: 0.7 }, steps: [{ workflow: `action-gap-position-${mode}` }],
  })),
  ...['single', 'bulk', 'end-turn-cover', 'end-turn-open'].map(mode => ({
    name: `action-gap-sneak-${mode}`, area: 'sneak-deferred-workflow',
    targetType: 'character', disposableWorld: true, settings: ['autoVisibilityEnabled'],
    camera: { x: 900, y: 550, scale: 0.7 }, steps: [{ workflow: `action-gap-sneak-${mode}` }],
  })),
  ...['circle', 'cone', 'cancel-config', 'cancel-placement', 'clamp', 'remove-existing'].map(mode => ({
    name: `action-gap-seek-${mode}`, area: 'seek-native-template', disposableWorld: true,
    settings: ['seekUseTemplate', 'seekTemplateSkipDialog', 'seekTemplateMaxPlacementDistance'],
    camera: { x: 900, y: 550, scale: 0.7 }, steps: [{ workflow: `action-gap-seek-${mode}` }],
  })),
];
