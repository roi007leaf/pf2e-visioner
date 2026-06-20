/**
 * @jest-environment jsdom
 */

import {
  choosePrimaryUsedSense,
  isVisionSenseType,
} from '../../../scripts/chat/dialogs/Seek/seek-sense-context.js';

describe('Seek sense selection hierarchy', () => {
  const mockAllSenses = [
    { type: 'vision', range: Infinity, isPrecise: true, config: { label: 'Vision' } },
    { type: 'darkvision', range: 60, isPrecise: true, config: { label: 'Darkvision' } },
    {
      type: 'see-invisibility',
      range: Infinity,
      isPrecise: true,
      config: { label: 'See Invisibility' },
    },
    { type: 'echolocation', range: 30, isPrecise: true, config: { label: 'Echolocation' } },
    { type: 'lifesense', range: Infinity, isPrecise: false, config: { label: 'Lifesense' } },
    { type: 'tremorsense', range: 60, isPrecise: false, config: { label: 'Tremorsense' } },
    { type: 'hearing', range: Infinity, isPrecise: false, config: { label: 'Hearing' } },
    { type: 'scent', range: 30, isPrecise: false, config: { label: 'Scent' } },
  ];

  function choose(outcomes, senses = mockAllSenses) {
    return choosePrimaryUsedSense(senses, outcomes);
  }

  test('prioritizes vision over other senses', () => {
    const result = choose([
      { usedSenseType: 'vision', usedSensePrecision: 'precise' },
      { usedSenseType: 'see-invisibility', usedSensePrecision: 'precise' },
      { usedSenseType: 'echolocation', usedSensePrecision: 'precise' },
    ]);

    expect(result.chosenUsedType).toBe('vision');
    expect(result.usedSenseCount).toBe(1);
    expect(result.primaryUsedSenseLabel).toBe('Vision');
    expect(result.allSenses.find((sense) => sense.type === 'vision').wasUsed).toBe(true);
  });

  test('treats see-invisibility as vision hierarchy', () => {
    const result = choose([
      { usedSenseType: 'see-invisibility', usedSensePrecision: 'precise' },
      { usedSenseType: 'echolocation', usedSensePrecision: 'precise' },
    ]);

    expect(result.chosenUsedType).toBe('see-invisibility');
    expect(isVisionSenseType('see-invisibility')).toBe(true);
  });

  test('prioritizes precise unlimited non-vision over precise limited non-vision', () => {
    const senses = [
      ...mockAllSenses.filter((sense) => sense.type !== 'lifesense'),
      { type: 'lifesense', range: Infinity, isPrecise: true, config: { label: 'Lifesense' } },
    ];

    const result = choose(
      [
        { usedSenseType: 'lifesense', usedSensePrecision: 'precise' },
        { usedSenseType: 'echolocation', usedSensePrecision: 'precise' },
      ],
      senses,
    );

    expect(result.chosenUsedType).toBe('lifesense');
  });

  test('prioritizes darkvision over precise unlimited non-vision', () => {
    const senses = [
      ...mockAllSenses.filter((sense) => sense.type !== 'lifesense'),
      { type: 'lifesense', range: Infinity, isPrecise: true, config: { label: 'Lifesense' } },
    ];

    const result = choose(
      [
        { usedSenseType: 'lifesense', usedSensePrecision: 'precise' },
        { usedSenseType: 'darkvision', usedSensePrecision: 'precise' },
      ],
      senses,
    );

    expect(result.chosenUsedType).toBe('darkvision');
    expect(isVisionSenseType('darkvision')).toBe(true);
  });

  test('uses higher range inside same limited-range hierarchy level', () => {
    const result = choose([
      { usedSenseType: 'echolocation', usedSensePrecision: 'precise' },
      { usedSenseType: 'tremorsense', usedSensePrecision: 'precise' },
    ]);

    expect(result.chosenUsedType).toBe('tremorsense');
  });

  test('prioritizes imprecise unlimited over imprecise limited range', () => {
    const result = choose([
      { usedSenseType: 'hearing', usedSensePrecision: 'imprecise' },
      { usedSenseType: 'scent', usedSensePrecision: 'imprecise' },
    ]);

    expect(result.chosenUsedType).toBe('hearing');
    expect(result.activeSenses).toEqual([
      expect.objectContaining({ type: 'hearing', wasUsed: true }),
    ]);
  });

  test('counts legacy imprecise sense fields', () => {
    const result = choose([{ usedImprecise: true, usedImpreciseSenseType: 'scent' }]);

    expect(result.chosenUsedType).toBe('scent');
    expect(result.usedSenseCount).toBe(1);
  });
});
