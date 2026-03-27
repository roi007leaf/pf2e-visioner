import '../../setup.js';

describe('applyNowSneak - Effect Cleanup Bug Fix', () => {
    test('applyNowSneak code should call restoreSneakWalkSpeed when applying', () => {
        const { readFileSync } = require('fs');
        const { join } = require('path');

        const applyServicePath = join(
            __dirname,
            '../../../scripts/chat/services/apply-service.js'
        );
        const applyServiceCode = readFileSync(applyServicePath, 'utf8');

        expect(applyServiceCode).toContain('restoreSneakWalkSpeed');
        expect(applyServiceCode).toMatch(/unsetFlag\s*\(\s*['"]pf2e-visioner['"]\s*,\s*['"]sneak-active['"]\s*\)/);
    });

    test('applyNowSneak always calls cleanupSneakState', () => {
        const { readFileSync } = require('fs');
        const { join } = require('path');

        const code = readFileSync(
            join(__dirname, '../../../scripts/chat/services/apply-service.js'),
            'utf8'
        );

        expect(code).toContain('await cleanupSneakState(actionData)');
        expect(code).toContain('async function cleanupSneakState');
        expect(code).toContain('resolveSneakingToken');
    });

    test('resolveSneakingToken prioritizes message flag tokenId', () => {
        const { readFileSync } = require('fs');
        const { join } = require('path');

        const code = readFileSync(
            join(__dirname, '../../../scripts/chat/services/apply-service.js'),
            'utf8'
        );

        const resolveBody = code.slice(
            code.indexOf('function resolveSneakingToken'),
            code.indexOf('export async function applyNowSeek')
        );

        expect(resolveBody).toContain('sneakStartPosition');
        expect(resolveBody).toContain('tokenId');
    });
});
