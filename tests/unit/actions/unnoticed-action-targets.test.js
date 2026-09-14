import '../../setup.js';
jest.mock('../../../scripts/utils.js', () => ({ getVisibilityBetween: jest.fn() }));
jest.mock('../../../scripts/stores/visibility-map.js', () => ({ getVisibilityBetween: jest.fn() }));
jest.mock('../../../scripts/chat/services/infra/shared-utils.js', () => ({ shouldFilterAlly: () => false, isTokenWithinTemplate: () => true }));
import { getVisibilityBetween as utilityVisibility } from '../../../scripts/utils.js';
import { getVisibilityBetween as storedVisibility } from '../../../scripts/stores/visibility-map.js';
import { checkForValidTargets } from '../../../scripts/chat/services/infra/target-checker.js';
import { isSearchExplorationCandidate } from '../../../scripts/chat/services/search-exploration-service.js';

describe('Unnoticed action eligibility', () => {
  test('Seek can locate an Unnoticed creature while failed rolls preserve awareness', async () => {
    const { getDefaultNewStateFor } = await import('../../../scripts/chat/services/data/action-state-config.js');
    expect(getDefaultNewStateFor('seek', 'unnoticed', 'critical-success')).toBe('observed');
    expect(getDefaultNewStateFor('seek', 'unnoticed', 'success')).toBe('hidden');
    expect(getDefaultNewStateFor('seek', 'unnoticed', 'failure')).toBe('unnoticed');
    expect(getDefaultNewStateFor('seek', 'unnoticed', 'critical-failure')).toBe('unnoticed');
  });
  test.each(['hidden', 'undetected', 'unnoticed', 'observed'])('%s obeys the same gate and discovery contract', state => {
    const pc = createMockToken({ id: 'pc', actor: createMockActor({ type: 'character', hasPlayerOwner: true }) });
    const npc = createMockToken({ id: 'npc', actor: createMockActor({ type: 'npc' }) });
    canvas.tokens.placeables = [pc, npc];
    utilityVisibility.mockReturnValue(state);
    storedVisibility.mockReturnValue(state);
    expect(checkForValidTargets({ actionType: 'consequences', actor: npc })).toBe(state !== 'observed');
    expect(checkForValidTargets({ actionType: 'seek', actor: pc })).toBe(state !== 'observed');
    expect(isSearchExplorationCandidate(npc)).toBe(state !== 'observed');
  });
});
