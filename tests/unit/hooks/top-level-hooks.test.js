describe('Top-level hook registration', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../../../scripts/hooks/registration.js');
    jest.dontMock('../../../scripts/hooks/party-token-hooks.js');
  });

  test('awaits modular hook registration before resolving', async () => {
    const calls = [];

    jest.doMock('../../../scripts/hooks/registration.js', () => ({
      registerHooks: jest.fn(async () => {
        await Promise.resolve();
        calls.push('modular');
      }),
    }));
    jest.doMock('../../../scripts/hooks/party-token-hooks.js', () => ({
      registerPartyTokenHooks: jest.fn(() => {
        calls.push('party');
      }),
    }));

    const { registerHooks } = await import('../../../scripts/hooks.js');
    const result = registerHooks();

    expect(result).toBeInstanceOf(Promise);
    await result;

    expect(calls).toEqual(['modular', 'party']);
  });

  test('propagates core modular registration failures', async () => {
    const failure = new Error('registration failed');

    jest.doMock('../../../scripts/hooks/registration.js', () => ({
      registerHooks: jest.fn(async () => {
        throw failure;
      }),
    }));
    jest.doMock('../../../scripts/hooks/party-token-hooks.js', () => ({
      registerPartyTokenHooks: jest.fn(),
    }));

    const { registerHooks } = await import('../../../scripts/hooks.js');

    await expect(registerHooks()).rejects.toBe(failure);
  });
});
