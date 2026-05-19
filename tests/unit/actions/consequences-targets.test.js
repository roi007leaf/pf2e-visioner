import '../../setup.js';

describe('consequences targets', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.dontMock('../../../scripts/utils.js');
    jest.resetModules();
  });

  test('discovers only observers that see attacker as hidden or undetected and caches visibility', async () => {
    const hiddenObserver = createMockToken({ id: 'hidden-observer' });
    const observedObserver = createMockToken({ id: 'observed-observer' });
    const attacker = createMockToken({ id: 'attacker' });
    canvas.tokens.placeables = [attacker, hiddenObserver, observedObserver];
    jest.doMock('../../../scripts/utils.js', () => ({
      __esModule: true,
      getVisibilityBetween: jest.fn((observer) =>
        observer.id === 'hidden-observer' ? 'hidden' : 'observed',
      ),
    }));

    const { discoverConsequencesSubjects } = await import(
      '../../../scripts/chat/services/actions/Consequences/consequences-targets.js'
    );
    const actionData = { actor: attacker, ignoreAllies: false };

    const subjects = await discoverConsequencesSubjects(actionData);

    expect(subjects).toEqual([hiddenObserver]);
    expect(actionData._visionerConsequencesVisibility.get('hidden-observer')).toBe('hidden');
  });

  test('builds consequence outcome from cached visibility and AVS default', async () => {
    game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', true);

    const { buildConsequencesOutcome } = await import(
      '../../../scripts/chat/services/actions/Consequences/consequences-targets.js'
    );
    const subject = createMockToken({ id: 'observer' });

    const outcome = await buildConsequencesOutcome(
      {
        actor: createMockToken({ id: 'attacker' }),
        _visionerConsequencesVisibility: new Map([['observer', 'undetected']]),
      },
      subject,
    );

    expect(outcome).toMatchObject({
      target: subject,
      currentVisibility: 'undetected',
      oldVisibility: 'undetected',
      changed: true,
      newVisibility: 'avs',
    });
  });
});
