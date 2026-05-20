import fs from 'fs';
import path from 'path';

describe('detection wrapper module ownership', () => {
  const root = path.resolve(__dirname, '../../..');
  const servicesRoot = path.join(root, 'scripts/services');
  const detectionWrapperPath = path.join(servicesRoot, 'DetectionWrapper.js');
  const registrationPath = path.join(servicesRoot, 'detection-wrapper-registration.js');

  test('DetectionWrapper is only the lifecycle adapter', () => {
    const source = fs.readFileSync(detectionWrapperPath, 'utf8');

    expect(source).toContain("from './detection-wrapper-registration.js'");
    expect(source).toContain('registerDetectionWrappers()');
    expect(source).not.toContain('libWrapper.register');
    expect(source).not.toContain('DetectionFrameCache');
    expect(source).not.toContain('pending-token-movement');
    expect(source).not.toContain('createCanDetectVisibilityWrapper');
    expect(source).not.toContain('testDetectionModeVisibility');
    expect(source).not.toContain('wrapTokenVisionSource');
  });

  test('registration module wires named detection behavior modules', () => {
    const source = fs.readFileSync(registrationPath, 'utf8');

    expect(source).toContain("from './detection-mode-visibility.js'");
    expect(source).toContain("from './detection-canvas-visibility.js'");
    expect(source).toContain("from './detection-can-detect.js'");
    expect(source).toContain("from './detection-token-refresh.js'");
    expect(source).toContain("from './detection-vision-sharing.js'");
    expect(source).toContain('testDetectionModeVisibility');
    expect(source).toContain('wrapCanvasVisibilityTest');
    expect(source).toContain('createCanDetectVisibilityWrapper');
    expect(source).toContain('wrapTokenRefreshVisibility');
    expect(source).toContain('wrapTokenVisionSource');
    expect(source).toContain('wrapTokenDocumentPrepareBaseData');
  });

  test('detection wrappers use the pending movement detection gate seam', () => {
    const gatePath = path.join(servicesRoot, 'pending-movement-detection-gate.js');
    const detectionModulePaths = [
      'detection-can-detect.js',
      'detection-canvas-visibility.js',
      'detection-mode-visibility.js',
    ].map((fileName) => path.join(servicesRoot, fileName));

    expect(fs.existsSync(gatePath)).toBe(true);
    for (const modulePath of detectionModulePaths) {
      const source = fs.readFileSync(modulePath, 'utf8');
      expect(source).toContain("from './pending-movement-detection-gate.js'");
      expect(source).not.toContain("from './pending-token-movement.js'");
    }
  });
});
