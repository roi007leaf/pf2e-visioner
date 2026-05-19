import fs from 'fs';
import path from 'path';

describe('Walls service module ownership', () => {
  const root = path.resolve(__dirname, '../../..');
  const servicesRoot = path.join(root, 'scripts/services');
  const wallsRoot = path.join(servicesRoot, 'Walls');
  const wallModuleFiles = [
    'connected-walls.js',
    'hidden-wall-sync.js',
    'wall-indicator-cleanup.js',
    'wall-indicator-rendering.js',
    'wall-lifecycle.js',
    'wall-sight-policy.js',
    'wall-visual-refresh.js',
    'wall-visual-state.js',
    'wall-visual-update-application.js',
    'wall-visual-workflow.js',
  ];

  function getScriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return getScriptFiles(entryPath);
      return entry.name.endsWith('.js') ? [entryPath] : [];
    });
  }

  function importSpecifiers(source) {
    return Array.from(
      source.matchAll(/(?:from\s+|import\(\s*)['"]([^'"]+)['"]/g),
      (match) => match[1],
    );
  }

  function normalizeImportPath(filePath, specifier) {
    if (!specifier.startsWith('.')) return null;
    return path.normalize(path.resolve(path.dirname(filePath), specifier));
  }

  test.each(wallModuleFiles)('%s lives only under scripts/services/Walls', (fileName) => {
    expect(fs.existsSync(path.join(wallsRoot, fileName))).toBe(true);
    expect(fs.existsSync(path.join(servicesRoot, fileName))).toBe(false);
  });

  test('production imports do not target old root wall service paths', () => {
    const forbiddenTargets = new Set(
      wallModuleFiles.map((fileName) => path.normalize(path.join(servicesRoot, fileName))),
    );
    const offenders = [];

    for (const filePath of getScriptFiles(path.join(root, 'scripts'))) {
      if (path.dirname(filePath) === wallsRoot) continue;
      const source = fs.readFileSync(filePath, 'utf8');
      for (const specifier of importSpecifiers(source)) {
        const normalizedImportPath = normalizeImportPath(filePath, specifier);
        if (forbiddenTargets.has(normalizedImportPath)) {
          offenders.push(
            `${path.relative(root, filePath)} imports ${path.relative(root, normalizedImportPath)}`,
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
