import { filterOutcomesByTemplate } from '../../../scripts/chat/services/infra/shared-utils.js';

describe('filterOutcomesByTemplate', () => {
  test('retains rotated cone geometry after the native template is consumed', () => {
    canvas.scene.grid = { size: 100, distance: 5 };
    const outcomes = [{ target: { center: { x: 0, y: 200 } } },
      { target: { center: { x: 200, y: 0 } } }, { target: { center: { x: 0, y: 800 } } }];
    expect(filterOutcomesByTemplate(outcomes, { x: 0, y: 0 }, 30, 'target', 'cone',
      'consumed-message', 'observer', { direction: 90, angle: 90 })).toEqual([outcomes[0]]);
  });
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
