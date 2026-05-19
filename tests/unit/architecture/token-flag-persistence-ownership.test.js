import fs from 'fs';
import path from 'path';

describe('token flag persistence module ownership', () => {
  const root = path.resolve(__dirname, '../../..');
  const scriptsRoot = path.join(root, 'scripts');
  const legacyWriterPath = path.join(root, 'scripts/stores/token-flag-map-batch-writer.js');

  function getScriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return getScriptFiles(entryPath);
      return entry.name.endsWith('.js') ? [entryPath] : [];
    });
  }

  test('legacy batch-writer module is only a compatibility re-export', () => {
    const source = fs.readFileSync(legacyWriterPath, 'utf8').trim();

    expect(source).toBe("export * from './token-flag-map-persistence.js';");
  });

  test('production code imports token flag persistence from the owning module', () => {
    const offenders = getScriptFiles(scriptsRoot)
      .filter((filePath) => filePath !== legacyWriterPath)
      .filter((filePath) =>
        fs.readFileSync(filePath, 'utf8').includes('token-flag-map-batch-writer.js'),
      )
      .map((filePath) => path.relative(root, filePath));

    expect(offenders).toEqual([]);
  });
});
