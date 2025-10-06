/**
 * @jest-environment jsdom
 */

import { batchUpdateCoverEffects } from '../../../scripts/cover/batch.js';

// Import test setup first to define global mock functions
import '../../setup.js';

// Mock the helper functions
jest.mock('../../../scripts/helpers/cover-helpers.js', () => ({
  extractSignaturesFromPredicate: jest.fn((predicate) => {
    if (!predicate || !Array.isArray(predicate)) return [];
    return predicate
      .filter((p) => String(p).startsWith('origin:signature:'))
      .map((p) => String(p).slice('origin:signature:'.length));
  }),
  extractCoverAgainstFromPredicate: jest.fn((predicate) => {
    if (!predicate || !Array.isArray(predicate)) return [];
    return predicate
      .filter((p) => String(p).startsWith('cover-against:'))
      .map((p) => String(p).slice('cover-against:'.length));
  }),
  getCoverLabel: jest.fn(
    (state) => `${state?.charAt(0)?.toUpperCase() || ''}${state?.slice(1) || ''} Cover`,
  ),
  getCoverImageForState: jest.fn(() => 'mock-image.webp'),
  getBonus: jest.fn((state) => {
    switch (state) {
      case 'lesser':
        return 1;
      case 'standard':
        return 2;
      case 'greater':
        return 4;
      default:
        return 0;
    }
  }),
  createAggregate: jest.fn((target, state, rules) => ({
    name: `Cover (${state.charAt(0).toUpperCase() + state.slice(1)})`,
    type: 'effect',
    flags: { 'pf2e-visioner': { aggregateCover: true, coverState: state } },
    system: { rules },
  })),
}));

// Mock the stores
jest.mock('../../../scripts/stores/cover-map.js', () => ({
  getCoverMap: jest.fn(() => ({})),
}));

// Mock the aggregates module
jest.mock('../../../scripts/cover/aggregates.js', () => ({
  updateReflexStealthAcrossCoverAggregates: jest.fn(),
}));

// Mock the cover effect lock utility
jest.mock('../../../scripts/cover/utils.js', () => ({
  runWithCoverEffectLock: jest.fn((actor, fn) => fn()),
}));

describe('Cover Array Selector Bug Fix', () => {
  let mockTarget;
  let mockObserver;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock observer with realistic data
    mockObserver = createMockToken({
      id: 'observer123',
      actor: createMockActor({
        signature: 'TestCharacter.abc123',
        id: 'observerActorId',
      }),
    });

    // Mock target with realistic cover aggregates using ARRAY selectors (like real game)
    mockTarget = createMockToken({
      id: 'target123',
      name: 'Test Target',
      actor: createMockActor({
        id: 'targetActorId',
        type: 'character',
      }),
    });

    // Add effect tracking
    mockTarget.actor.itemTypes = { effect: [] };
    mockTarget.actor.items = {
      get: (id) => mockTarget.actor.itemTypes.effect.find((e) => e.id === id),
    };

    // Mock document operations with tracking
    mockTarget.actor.deleteEmbeddedDocuments = jest.fn(async (type, ids) => {
      mockTarget.actor.itemTypes.effect = mockTarget.actor.itemTypes.effect.filter(
        (e) => !ids.includes(e.id),
      );
    });

    mockTarget.actor.updateEmbeddedDocuments = jest.fn(async (type, updates) => {
      for (const update of updates) {
        const effect = mockTarget.actor.itemTypes.effect.find((e) => e.id === update._id);
        if (effect) {
          if (update['system.rules']) {
            effect.system.rules = update['system.rules'];
          }
        }
      }
    });

    mockTarget.actor.createEmbeddedDocuments = jest.fn(async (type, documents) => {
      for (const doc of documents) {
        const id = `effect-${Date.now()}-${Math.random()}`;
        mockTarget.actor.itemTypes.effect.push({ ...doc, id });
      }
    });
  });

  test('should remove rules with array selectors during cross-state cleanup', async () => {
    // Create existing greater cover aggregate with ARRAY selector (realistic format)
    const greaterCoverAggregate = {
      id: 'greaterCoverId',
      flags: { 'pf2e-visioner': { aggregateCover: true, coverState: 'greater' } },
      system: {
        rules: [
          {
            key: 'FlatModifier',
            selector: ['ac'], // ARRAY format - this was the bug!
            type: 'circumstance',
            value: 4,
            predicate: [`origin:signature:${mockObserver.actor.signature}`],
          },
          {
            key: 'RollOption',
            domain: 'all',
            option: `cover-against:${mockObserver.id}`,
          },
          {
            key: 'FlatModifier',
            selector: ['reflex'], // Other rule should remain
            type: 'circumstance',
            value: 4,
            predicate: ['area-effect'],
          },
        ],
      },
    };

    mockTarget.actor.itemTypes.effect = [greaterCoverAggregate];

    // Test: Change from greater to standard cover
    const targetUpdates = [
      {
        target: mockTarget,
        state: 'standard',
      },
    ];

    await batchUpdateCoverEffects(mockObserver, targetUpdates);

    // Verify the greater cover aggregate was updated (not deleted)
    expect(mockTarget.actor.updateEmbeddedDocuments).toHaveBeenCalledWith(
      'Item',
      expect.arrayContaining([
        expect.objectContaining({
          _id: 'greaterCoverId',
          'system.rules': expect.arrayContaining([
            // Should only contain the reflex rule (area-effect)
            expect.objectContaining({
              key: 'FlatModifier',
              selector: ['reflex'],
              predicate: ['area-effect'],
            }),
          ]),
        }),
      ]),
    );

    // Verify the updated rules array length is correct (only 1 remaining rule)
    const updateCall = mockTarget.actor.updateEmbeddedDocuments.mock.calls.find(
      (call) => call[0] === 'Item',
    )[1][0];
    expect(updateCall['system.rules']).toHaveLength(1);

    // Verify standard cover aggregate was created
    expect(mockTarget.actor.createEmbeddedDocuments).toHaveBeenCalledWith(
      'Item',
      expect.arrayContaining([
        expect.objectContaining({
          flags: expect.objectContaining({
            'pf2e-visioner': expect.objectContaining({
              coverState: 'standard',
            }),
          }),
          system: expect.objectContaining({
            rules: expect.arrayContaining([
              expect.objectContaining({
                key: 'FlatModifier',
                value: 2, // Standard cover bonus
              }),
              expect.objectContaining({
                key: 'RollOption',
                option: `cover-against:${mockObserver.id}`,
              }),
            ]),
          }),
        }),
      ]),
    );
  });

  test('should remove rules with array selectors during "no cover" removal', async () => {
    // Create existing standard cover aggregate with ARRAY selector
    const standardCoverAggregate = {
      id: 'standardCoverId',
      flags: { 'pf2e-visioner': { aggregateCover: true, coverState: 'standard' } },
      system: {
        rules: [
          {
            key: 'FlatModifier',
            selector: ['ac'], // ARRAY format
            type: 'circumstance',
            value: 2,
            predicate: [`origin:signature:${mockObserver.actor.signature}`],
          },
          {
            key: 'RollOption',
            domain: 'all',
            option: `cover-against:${mockObserver.id}`,
          },
          {
            key: 'FlatModifier',
            selector: ['stealth'], // Other rule should remain
            type: 'circumstance',
            value: 2,
            predicate: ['action:hide'],
          },
        ],
      },
    };

    mockTarget.actor.itemTypes.effect = [standardCoverAggregate];

    // Test: Remove cover (set to 'none')
    const targetUpdates = [
      {
        target: mockTarget,
        state: 'none',
      },
    ];

    await batchUpdateCoverEffects(mockObserver, targetUpdates);

    // Verify the standard cover aggregate was updated (AC and RollOption rules removed)
    expect(mockTarget.actor.updateEmbeddedDocuments).toHaveBeenCalledWith(
      'Item',
      expect.arrayContaining([
        expect.objectContaining({
          _id: 'standardCoverId',
          'system.rules': expect.arrayContaining([
            // Should only contain the stealth rule
            expect.objectContaining({
              key: 'FlatModifier',
              selector: ['stealth'],
              predicate: ['action:hide'],
            }),
          ]),
        }),
      ]),
    );

    // Verify only 1 rule remains
    const updateCall = mockTarget.actor.updateEmbeddedDocuments.mock.calls.find(
      (call) => call[0] === 'Item',
    )[1][0];
    expect(updateCall['system.rules']).toHaveLength(1);
  });

  test('should delete aggregate when all rules with array selectors are removed', async () => {
    // Create aggregate with only the observer's rules
    const coverAggregate = {
      id: 'coverId',
      flags: { 'pf2e-visioner': { aggregateCover: true, coverState: 'standard' } },
      system: {
        rules: [
          {
            key: 'FlatModifier',
            selector: ['ac'], // ARRAY format
            type: 'circumstance',
            value: 2,
            predicate: [`origin:signature:${mockObserver.actor.signature}`],
          },
          {
            key: 'RollOption',
            domain: 'all',
            option: `cover-against:${mockObserver.id}`,
          },
        ],
      },
    };

    mockTarget.actor.itemTypes.effect = [coverAggregate];

    // Test: Remove cover
    const targetUpdates = [
      {
        target: mockTarget,
        state: 'none',
      },
    ];

    await batchUpdateCoverEffects(mockObserver, targetUpdates);

    // Verify the aggregate was deleted (no rules remaining)
    expect(mockTarget.actor.deleteEmbeddedDocuments).toHaveBeenCalledWith('Item', ['coverId']);
  });

  test('should work correctly with mixed string and array selectors', async () => {
    // Test edge case with mixed selector formats
    const mixedAggregate = {
      id: 'mixedId',
      flags: { 'pf2e-visioner': { aggregateCover: true, coverState: 'greater' } },
      system: {
        rules: [
          {
            key: 'FlatModifier',
            selector: ['ac'], // Array format
            type: 'circumstance',
            value: 4,
            predicate: [`origin:signature:${mockObserver.actor.signature}`],
          },
          {
            key: 'FlatModifier',
            selector: 'reflex', // String format
            type: 'circumstance',
            value: 4,
            predicate: ['area-effect'],
          },
        ],
      },
    };

    mockTarget.actor.itemTypes.effect = [mixedAggregate];

    const targetUpdates = [
      {
        target: mockTarget,
        state: 'none',
      },
    ];

    await batchUpdateCoverEffects(mockObserver, targetUpdates);

    // Should remove the AC rule (array selector) but keep reflex rule (string selector)
    expect(mockTarget.actor.updateEmbeddedDocuments).toHaveBeenCalledWith(
      'Item',
      expect.arrayContaining([
        expect.objectContaining({
          _id: 'mixedId',
          'system.rules': [
            expect.objectContaining({
              key: 'FlatModifier',
              selector: 'reflex',
            }),
          ],
        }),
      ]),
    );
  });
});
