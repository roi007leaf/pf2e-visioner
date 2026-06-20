import fs from 'fs';
import path from 'path';

describe('token flag persistence module ownership', () => {
  const root = path.resolve(__dirname, '../../..');
  const scriptsRoot = path.join(root, 'scripts');
  const legacyWriterPath = path.join(root, 'scripts/stores/token-flag-map-batch-writer.js');
  const visibilityMapPath = path.join(root, 'scripts/stores/visibility-map.js');

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

  test('visibility map delegates visibilityV2 flag write mechanics', () => {
    const source = fs.readFileSync(visibilityMapPath, 'utf8');

    expect(source).toContain("from './visibility-profile-flag-persistence.js'");
    expect(source).not.toContain('buildTokenFlagSetUpdate');
    expect(source).not.toContain('buildTokenFlagUnsetUpdate');
    expect(source).not.toContain('foundry?.data?.operators?.ForcedDeletion');
    expect(source).not.toContain('document.setFlag');
    expect(source).not.toContain('document.unsetFlag');
  });
});
