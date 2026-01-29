import { filterOutcomesByTemplate } from '../../../scripts/chat/services/infra/shared-utils.js';

describe('filterOutcomesByTemplate', () => {
  test('keeps unchanged outcomes inside template area', () => {
    global.canvas.grid.size = 50;
    global.canvas.scene.grid.size = 50;
    delete global.canvas.scene.grid.distance;

    const center = { x: 0, y: 0 };

    const insideWithCenter = {
      id: 'inside-1',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      center: { x: 0, y: 0 },
    };

    const insideWithoutCenter = {
      id: 'inside-2',
      x: 100,
      y: 0,
      width: 1,
      height: 1,
    };

    const outside = {
      id: 'outside-1',
      x: 500,
      y: 0,
      width: 1,
      height: 1,
      center: { x: 500, y: 0 },
    };

    const outcomes = [
      { target: insideWithCenter, changed: false },
      { target: insideWithoutCenter, changed: false },
      { target: outside, changed: true },
    ];

    const filtered = filterOutcomesByTemplate(outcomes, center, 30, 'target', 'circle', 'm1', 'a1');

    expect(filtered.map((o) => o.target.id)).toEqual(['inside-1', 'inside-2']);
  });
});
