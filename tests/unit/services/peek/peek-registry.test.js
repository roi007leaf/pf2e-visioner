import '../../../setup.js';
import { PeekRegistry } from '../../../../scripts/services/Peek/PeekRegistry.js';

describe('PeekRegistry', () => {
  let reg;
  beforeEach(() => { reg = new PeekRegistry(); });

  test('set/get/has/clear round-trip', () => {
    reg.set('t1', { origin: { x: 1, y: 2 }, direction: 0, fov: 90, ignoredWallIds: ['w1'] }, 1000);
    expect(reg.has('t1')).toBe(true);
    expect(reg.get('t1').origin).toEqual({ x: 1, y: 2 });
    expect(reg.get('t1').ignoredWallIds).toEqual(['w1']);
    reg.clear('t1');
    expect(reg.has('t1')).toBe(false);
    expect(reg.get('t1')).toBeNull();
  });

  test('set stamps ts from provided now', () => {
    reg.set('t1', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 5000);
    expect(reg.get('t1').ts).toBe(5000);
  });

  test('pruneStale removes entries older than ttl', () => {
    reg.set('old', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1000);
    reg.set('fresh', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1900);
    reg.pruneStale(1000, 2000);
    expect(reg.has('old')).toBe(false);
    expect(reg.has('fresh')).toBe(true);
  });

  test('ids returns token IDs when entries exist and empty array when registry is empty', () => {
    expect(reg.ids()).toEqual([]);
    reg.set('t1', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1000);
    reg.set('t2', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1000);
    expect(reg.ids()).toEqual(['t1', 't2']);
  });

  test('clearAll wipes all entries', () => {
    reg.set('t1', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1000);
    reg.set('t2', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1000);
    reg.clearAll();
    expect(reg.has('t1')).toBe(false);
    expect(reg.has('t2')).toBe(false);
    expect(reg.ids()).toEqual([]);
  });

  test('pruneStale deletes entries at exactly TTL age', () => {
    reg.set('exact', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1000);
    reg.pruneStale(1000, 2000);
    expect(reg.has('exact')).toBe(false);
  });
});
