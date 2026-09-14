export const gapCases = [
  ...['en', 'pl', 'cn', 'fr'].map(language => ({
    name: `gap-localization-${language}`, area: 'localization-keyboard',
    camera: { x: 900, y: 550, scale: 0.7 }, steps: [{ workflow: `gap-localization-${language}` }],
  })),
  ...['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'].map(mode => ({
    name: `gap-colorblind-${mode}`, area: 'colorblind-ui',
    camera: { x: 900, y: 550, scale: 0.7 }, steps: [{ workflow: `gap-colorblind-${mode}` }],
  })),
  ...['strike', 'saves'].flatMap(kind => ['none', 'lesser', 'standard', 'greater'].map(grade => ({
    name: `gap-native-${kind}-${grade}`, area: 'native-cover-grades',
    camera: { x: 900, y: 550, scale: 0.7 },
    steps: [{ workflow: `gap-native-${kind}-${grade}` }],
  }))),
  ...['macro-manager', 'macro-player-guard', 'manager-apply-both', 'quick-panel-target'].map(mode => ({
    name: `gap-${mode}`, area: 'native-ui-entry',
    camera: { x: 900, y: 550, scale: 0.7 }, steps: [{ workflow: `gap-${mode}` }],
  })),
  ...['scent', 'lifesense', 'thoughtsense'].map(sense => ({
    name: `gap-presence-interaction-${sense}`, area: 'presence-marker-interaction',
    darkness: true, senses: [sense],
    camera: { x: 900, y: 550, scale: 0.7 },
    steps: [{ workflow: `gap-presence-interaction-${sense}` }],
  })),
];
