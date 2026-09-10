import { wrapTokenRefreshVisibility, wrapTokenApplyRenderFlags, wrapPrimaryTokenMeshRender } from '../../../scripts/services/Detection/detection-token-refresh.js';
import { wrapTokenRenderDetectionFilter } from '../../../scripts/services/Detection/detection-filter-render.js';
import { registerDetectionWrappers } from '../../../scripts/services/Detection/detection-wrapper-registration.js';
import { primeHiddenDetectionFilterVisualsForObserver } from '../../../scripts/stores/visibility-map.js';
import { clearPendingPerceptionProfileWrites } from '../../../scripts/stores/visibility-profile-flag-persistence.js';
import { prepareDoorScentRenderTransition } from '../../../scripts/services/door-state-visibility-refresh.js';

describe('scent presentation before the next animation frame', () => {
  let observer, target, profile;
  beforeEach(() => {
    global.game.user.isGM = true;
    profile = { detectionState: 'hidden', detectionSense: null };
    observer = global.createMockToken({ id: 'observer' });
    observer.controlled = true;
    observer.document.getFlag.mockImplementation((_module, key) => {
      if (key === 'visibilityV2') return { target: profile };
      if (key === 'detection') return { target: { sense: 'scent', isPrecise: false } };
      return null;
    });
    target = global.createMockToken({ id: 'target' });
    target.controlled = false;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas.tokens.controlled = [observer];
    global.canvas.tokens.placeables = [observer, target];
    global.canvas.tokens._draggedToken = null;
    global.canvas.tokens.get = (id) => id === 'target' ? target : observer;
  });
  afterEach(() => clearPendingPerceptionProfileWrites());

  test.each([13, 14])('registered detection render can suppress scent and resume sight without breaking the chain (v%i)', (foundryGeneration) => {
    const register = jest.fn();
    registerDetectionWrappers({ libWrapperAdapter: { register }, foundryGeneration });
    const [, , wrapper, type] = register.mock.calls.find(([, path]) =>
      path === 'foundry.canvas.placeables.Token.prototype._renderDetectionFilter');
    const renderer = {};
    const draw = jest.fn(function (arg) {
      expect(this).toBe(target);
      expect(arg).toBe(renderer);
      return 'drawn';
    });
    const render = () => {
      draw.mockClear();
      const result = wrapper.call(target, draw.bind(target), renderer);
      // libWrapper rejects and unregisters WRAPPER callbacks that skip their next call.
      if (type === 'WRAPPER' && draw.mock.calls.length === 0) {
        throw new Error('WRAPPER did not chain the call to the next wrapper');
      }
      return result;
    };

    for (let frame = 0; frame < 3; frame++) {
      target.detectionFilter = {};
      expect(render).not.toThrow();
      expect(draw).not.toHaveBeenCalled();
      expect(target.detectionFilterMesh.visible).toBe(false);
    }

    profile = { detectionState: 'observed', detectionSense: 'avs-visible' };
    expect(render()).toBe('drawn');
    expect(draw).toHaveBeenCalledTimes(1);
  });

  test.each([wrapTokenRefreshVisibility, wrapTokenApplyRenderFlags])('Core refresh cannot expose scent art before a marker exists (%#)', (wrapper) => {
    for (let frame = 0; frame < 3; frame++) {
      wrapper.call(target, () => {
        target.visible = true;
        target.mesh.visible = true;
        target.mesh.renderable = true;
        target.detectionFilter = {};
        target.detectionFilterMesh.visible = true;
      });
      expect(target.mesh.visible).toBe(false);
      expect(target.detectionFilterMesh.visible).toBe(false);
      expect(target.detectionFilter).toBeNull();
    }
  });

  test('Hidden visual priming never lights up the scent silhouette', () => {
    primeHiddenDetectionFilterVisualsForObserver(observer, [observer, target]);
    expect(target.mesh.visible).toBe(false);
    expect(target.detectionFilterMesh.visible).toBe(false);
  });

  test('another observer with normal sight keeps normal token art', () => {
    const ally = global.createMockToken({ id: 'ally' });
    ally.controlled = true;
    global.canvas.tokens.controlled.push(ally);
    wrapTokenRefreshVisibility.call(target, () => { target.mesh.visible = true; });
    expect(target.mesh.visible).toBe(true);
  });

  test('normal sight resumes as soon as the stored profile becomes observed', () => {
    wrapTokenRefreshVisibility.call(target, () => {});
    expect(target.mesh).toMatchObject({ visible: false, renderable: false, alpha: 0 });
    profile = { detectionState: 'observed', detectionSense: 'avs-visible' };
    primeHiddenDetectionFilterVisualsForObserver(observer, [observer, target]);
    expect(target.visible).toBe(true);
    expect(target.mesh).toMatchObject({ visible: true, renderable: true, alpha: 1 });
  });

  test('scent cleanup preserves Foundry-hidden tokens', () => {
    wrapTokenRefreshVisibility.call(target, () => {});
    target.document.hidden = true;
    profile = { detectionState: 'observed', detectionSense: 'avs-visible' };
    primeHiddenDetectionFilterVisualsForObserver(observer, [observer, target]);
    expect(target.visible).toBe(false);
    expect(target.mesh.visible).toBe(false);
  });

  test('observed priming does not restore art that scent never suppressed', () => {
    profile = { detectionState: 'observed', detectionSense: 'avs-visible' };
    target.visible = false;
    target.mesh = { visible: false, renderable: false, alpha: 0 };
    primeHiddenDetectionFilterVisualsForObserver(observer, [observer, target]);
    expect(target.visible).toBe(false);
    expect(target.mesh).toMatchObject({ visible: false, renderable: false, alpha: 0 });
  });

  test('closing a door suppresses stale Observed art before AVS updates to scent', () => {
    profile = { detectionState: 'observed', detectionSense: 'avs-visible' };
    observer.actor.system.perception = { senses: [{ type: 'scent', range: 60 }] };
    observer.center = { x: 0, y: 0 };
    target.center = { x: 100, y: 0 };
    const door = { c: [50, -50, 50, 50], door: 1, ds: 0, sight: 20, sound: 20 };
    global.canvas.walls.placeables = [{ document: door }];
    wrapTokenRefreshVisibility.call(target, () => { target.mesh.visible = true; });
    expect(target.mesh.visible).toBe(false);
    profile = { detectionState: 'hidden', detectionSense: 'vision' };
    wrapTokenRefreshVisibility.call(target, () => { target.mesh.visible = true; });
    expect(target.mesh.visible).toBe(false);
    profile = { detectionState: 'hidden', detectionSense: 'hearing' };
    wrapTokenRefreshVisibility.call(target, () => { target.mesh.visible = true; });
    expect(target.mesh.visible).toBe(false);
    profile = { detectionState: 'observed', detectionSense: 'vision' };
    door.ds = 1;
    wrapTokenRefreshVisibility.call(target, () => { target.mesh.visible = true; });
    expect(target.mesh.visible).toBe(true);
    prepareDoorScentRenderTransition(door, { ds: 0 });
    expect(target.mesh.visible).toBe(false);
    door.ds = 0;
    target.mesh.object = { object: target };
    target.mesh.visible = true;
    const draw = jest.fn();
    wrapPrimaryTokenMeshRender.call(target.mesh, draw, {});
    expect(draw).not.toHaveBeenCalled();
    target.detectionFilter = {};
    wrapTokenRenderDetectionFilter.call(target, draw, {});
    expect(draw).not.toHaveBeenCalled();
    door.ds = 1;
    wrapPrimaryTokenMeshRender.call(target.mesh, draw, {});
    expect(draw).toHaveBeenCalledTimes(1);
    global.canvas.walls.placeables = [];
  });
});
