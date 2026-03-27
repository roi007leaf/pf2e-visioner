import '../../setup.js';

describe('resolveSneakingToken fallback in apply-service', () => {
  test('apply-service has resolveSneakingToken that falls back to message flags', () => {
    const { readFileSync } = require('fs');
    const { join } = require('path');

    const code = readFileSync(
      join(__dirname, '../../../scripts/chat/services/apply-service.js'),
      'utf8'
    );

    expect(code).toContain('function resolveSneakingToken');
    expect(code).toContain('sneakStartPosition');
    expect(code).toContain('tokenId');
    expect(code).toContain('handler._getSneakingToken');
  });

  test('cleanupSneakState uses resolveSneakingToken for token resolution', () => {
    const { readFileSync } = require('fs');
    const { join } = require('path');

    const code = readFileSync(
      join(__dirname, '../../../scripts/chat/services/apply-service.js'),
      'utf8'
    );

    expect(code).toContain('async function cleanupSneakState');
    expect(code).toContain('resolveSneakingToken(handler, actionData)');
    expect(code).toContain('restoreSneakWalkSpeed');
  });

  test('applyNowSneak always calls cleanupSneakState', () => {
    const { readFileSync } = require('fs');
    const { join } = require('path');

    const code = readFileSync(
      join(__dirname, '../../../scripts/chat/services/apply-service.js'),
      'utf8'
    );

    const applyBody = code.slice(
      code.indexOf('export async function applyNowSneak'),
      code.indexOf('async function cleanupSneakState')
    );

    expect(applyBody).toContain('await cleanupSneakState(actionData)');
  });
});
