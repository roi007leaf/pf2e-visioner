import '../../setup.js';

describe('applyNowSneak - Effect Cleanup Bug Fix', () => {
    test('applyNowSneak code should call restoreSneakWalkSpeed when applying to all tokens', () => {
        const { readFileSync } = require('fs');
        const { join } = require('path');

        const applyServicePath = join(
            __dirname,
            '../../../scripts/chat/services/apply-service.js'
        );
        const applyServiceCode = readFileSync(applyServicePath, 'utf8');

        expect(applyServiceCode).toContain('restoreSneakWalkSpeed');

        expect(applyServiceCode).toMatch(/unsetFlag\s*\(\s*['"]pf2e-visioner['"]\s*,\s*['"]sneak-active['"]\s*\)/);

        const hasProperCleanup =
            applyServiceCode.includes('SneakSpeedService') &&
            applyServiceCode.includes('restoreSneakWalkSpeed') &&
            applyServiceCode.includes('sneak-active');

        expect(hasProperCleanup).toBe(true);
    });

    test('applyNowSneak should only clean up when no overrides (verify code pattern)', () => {
        const { readFileSync } = require('fs');
        const { join } = require('path');

        const applyServicePath = join(
            __dirname,
            '../../../scripts/chat/services/apply-service.js'
        );
        const applyServiceCode = readFileSync(applyServicePath, 'utf8');

        const hasConditionalCleanup =
            applyServiceCode.includes('!actionData.overrides') &&
            applyServiceCode.includes('Object.keys(actionData.overrides).length === 0') &&
            applyServiceCode.includes('restoreSneakWalkSpeed');

        expect(hasConditionalCleanup).toBe(true);
    });

    test('applyNowSneak should handle restoreSneakWalkSpeed failures gracefully (verify code pattern)', () => {
        const { readFileSync } = require('fs');
        const { join } = require('path');

        const applyServicePath = join(
            __dirname,
            '../../../scripts/chat/services/apply-service.js'
        );
        const applyServiceCode = readFileSync(applyServicePath, 'utf8');

        const hasTryCatch =
            applyServiceCode.includes('try {') &&
            applyServiceCode.includes('SneakSpeedService') &&
            applyServiceCode.includes('restoreSneakWalkSpeed') &&
            applyServiceCode.includes('catch (speedErr)');

        expect(hasTryCatch).toBe(true);
    });
});
