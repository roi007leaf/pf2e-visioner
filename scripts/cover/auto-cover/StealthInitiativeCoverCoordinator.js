import { CoverQuickOverrideDialog } from '../QuickOverrideDialog.js';
import { StealthInitiativeCoverWaitingDialog } from '../StealthInitiativeCoverWaitingDialog.js';
import {
  requestGMStealthInitiativeCover,
  sendStealthInitiativeCoverResponse,
} from '../../services/socket.js';
import { higherStealthCoverState } from './usecases/stealth-observer-analysis.js';

const GM_RESPONSE_TIMEOUT_MS = 30000;

class StealthInitiativeCoverCoordinator {
  constructor() {
    this._pending = new Map();
  }

  async resolveCoverState({ hider, suggestedState, manualCoverState = 'none' }) {
    if (manualCoverState && manualCoverState !== 'none') {
      return higherStealthCoverState(manualCoverState, suggestedState);
    }

    if (game.user?.isGM) {
      return this._openCoverDialog(hider?.name ?? '', suggestedState);
    }

    return this._requestFromGM(hider, suggestedState);
  }

  async _openCoverDialog(hiderName, suggestedState) {
    try {
      const title =
        game.i18n
          ?.localize?.('PF2E_VISIONER.DIALOG_TITLES.STEALTH_INITIATIVE_COVER')
          ?.replace?.('{NAME}', hiderName) ?? `Set Cover — ${hiderName}'s Stealth Roll`;
      const confirmLabel = game.i18n?.localize?.('PF2E_VISIONER.UI.CONFIRM') ?? 'Confirm';

      const chosen = await new Promise((resolve) => {
        const app = new CoverQuickOverrideDialog(suggestedState, 'none', {
          isStealthContext: true,
          title,
          confirmLabel,
        });
        app.setResolver(resolve);
        app.render(true);
      });

      return chosen ?? suggestedState;
    } catch (e) {
      console.warn('PF2E Visioner | Failed to open stealth-initiative cover dialog:', e);
      return suggestedState;
    }
  }

  _requestFromGM(hider, suggestedState) {
    return new Promise((resolve) => {
      const requestId = foundry?.utils?.randomID?.() ?? `${Date.now()}-${Math.random()}`;
      let waitingDialog = null;

      const resolveAndClose = (state) => {
        try {
          waitingDialog?.close();
        } catch (_) { }
        resolve(state);
      };

      const timeoutHandle = setTimeout(() => {
        this._pending.delete(requestId);
        resolveAndClose(suggestedState);
      }, GM_RESPONSE_TIMEOUT_MS);

      this._pending.set(requestId, { resolve: resolveAndClose, timeoutHandle });

      const sent = requestGMStealthInitiativeCover({
        requestId,
        hiderTokenId: hider?.document?.id ?? hider?.id ?? null,
        hiderName: hider?.name ?? '',
        suggestedState,
        userId: game.userId,
      });

      if (!sent) {
        clearTimeout(timeoutHandle);
        this._pending.delete(requestId);
        resolve(suggestedState);
        return;
      }

      try {
        waitingDialog = new StealthInitiativeCoverWaitingDialog();
        waitingDialog.render(true);
      } catch (_) { }
    });
  }

  async handleIncomingGMRequest({ requestId, hiderTokenId, hiderName, suggestedState, userId } = {}) {
    if (!game.user?.isGM || !requestId) return;

    const chosenState = await this._openCoverDialog(
      hiderName || canvas?.tokens?.get?.(hiderTokenId)?.name || '',
      suggestedState,
    );

    sendStealthInitiativeCoverResponse(userId, { requestId, chosenState });
  }

  handleGMResponse({ requestId, chosenState } = {}) {
    const pending = this._pending.get(requestId);
    if (!pending) return false;

    clearTimeout(pending.timeoutHandle);
    this._pending.delete(requestId);
    pending.resolve(chosenState);
    return true;
  }
}

const stealthInitiativeCoverCoordinator = new StealthInitiativeCoverCoordinator();
export default stealthInitiativeCoverCoordinator;
export { StealthInitiativeCoverCoordinator };
