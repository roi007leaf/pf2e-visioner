import fs from 'fs';
import path from 'path';

describe('Override Validation dialog CSS theme contrast', () => {
    test('does not hardcode dark header fallback', () => {
        const cssPath = path.join(process.cwd(), 'styles', 'dialog-layout.css');
        const css = fs.readFileSync(cssPath, 'utf8');

        expect(css).not.toContain('background: var(--color-bg-header, #2a2a2a)');
        expect(css).toContain(
            'background: var(--color-bg-header, var(--color-bg, var(--color-bg-base))) !important;',
        );
    });

    test('forces override validation window content to use theme colors', () => {
        const cssPath = path.join(process.cwd(), 'styles', 'dialog-layout.css');
        const css = fs.readFileSync(cssPath, 'utf8');

        expect(css).toContain('background: var(--color-bg);');
        expect(css).toContain('color: var(--color-text-primary);');
    });
});
