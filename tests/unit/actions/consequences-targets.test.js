import '../../setup.js';

describe('consequences targets', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.dontMock('../../../scripts/utils.js');
    jest.resetModules();
  });

  test.each(['hidden', 'undetected', 'unnoticed'])('discovers observers that see attacker as %s and caches visibility', async (state) => {
    const hiddenObserver = createMockToken({ id: 'hidden-observer' });
    const observedObserver = createMockToken({ id: 'observed-observer' });
    const attacker = createMockToken({ id: 'attacker' });
    canvas.tokens.placeables = [attacker, hiddenObserver, observedObserver];
    jest.doMock('../../../scripts/utils.js', () => ({
      __esModule: true,
      getVisibilityBetween: jest.fn((observer) =>
        observer.id === 'hidden-observer' ? state : 'observed',
      ),
    }));

    const { discoverConsequencesSubjects } = await import(
      '../../../scripts/chat/services/actions/Consequences/consequences-targets.js'
    );
    const actionData = { actor: attacker, ignoreAllies: false };

    const subjects = await discoverConsequencesSubjects(actionData);

    expect(subjects).toEqual([hiddenObserver]);
    expect(actionData._visionerConsequencesVisibility.get('hidden-observer')).toBe(state);
  });

  test.each(['hidden', 'undetected', 'unnoticed'])('builds consequence outcome from cached %s visibility and AVS default', async (state) => {
    game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', true);

    const { buildConsequencesOutcome } = await import(
      '../../../scripts/chat/services/actions/Consequences/consequences-targets.js'
    );
    const subject = createMockToken({ id: 'observer' });

    const outcome = await buildConsequencesOutcome(
      {
        actor: createMockToken({ id: 'attacker' }),
        _visionerConsequencesVisibility: new Map([['observer', state]]),
      },
      subject,
    );

    expect(outcome).toMatchObject({
      target: subject,
      currentVisibility: state,
      oldVisibility: state,
      changed: true,
      newVisibility: 'avs',
    });
  });
});
