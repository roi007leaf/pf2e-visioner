import { collectUnsettledChangedTokenIds } from '../../../scripts/visibility/auto-visibility/core/BatchTokenSettlingPolicy.js';

function token({ id = 'A', x = 100, y = 200, documentX = x, documentY = y, ...extras } = {}) {
  return {
    id,
    x,
    y,
    document: {
      id,
      x: documentX,
      y: documentY,
      flags: {},
    },
    ...extras,
  };
}

describe('BatchTokenSettlingPolicy', () => {
  test('reports changed tokens with active animation or drag state as unsettled', () => {
    const tokens = new Map([
      ['animated', token({ id: 'animated', _animation: { state: 'running', active: true } })],
      ['dragging', token({ id: 'dragging', _dragHandle: {} })],
      ['settled', token({ id: 'settled', _animation: { state: 'completed' } })],
    ]);

    const result = collectUnsettledChangedTokenIds({
      changedTokens: new Set(['animated', 'dragging', 'settled']),
      getTokenById: (id) => tokens.get(id),
    });

    expect(result).toEqual(['animated', 'dragging']);
  });

  test('reports render/document position drift and pending destination drift as unsettled', () => {
    const tokens = new Map([
      ['render-drift', token({ id: 'render-drift', x: 100, y: 100, documentX: 130, documentY: 100 })],
      ['pending-render-drift', token({ id: 'pending-render-drift', x: 100, y: 100 })],
      ['pending-document-drift', token({ id: 'pending-document-drift', x: 200, y: 200 })],
      ['settled', token({ id: 'settled', x: 300, y: 300 })],
    ]);
    const pendingDestinations = new Map([
      ['pending-render-drift', { x: 140, y: 100 }],
      ['pending-document-drift', { x: 200, y: 240 }],
      ['settled', { x: 300, y: 300 }],
    ]);

    const result = collectUnsettledChangedTokenIds({
      changedTokens: new Set([
        'render-drift',
        'pending-render-drift',
        'pending-document-drift',
        'settled',
      ]),
      getTokenById: (id) => tokens.get(id),
      getPendingDestinationById: (id) => pendingDestinations.get(id),
    });

    expect(result).toEqual(['render-drift', 'pending-render-drift', 'pending-document-drift']);
  });
});
