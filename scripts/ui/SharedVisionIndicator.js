/**
 * Shared Vision Indicator - floating indicator showing vision sharing relationships
 * - Shows when a selected token has shared vision with another token
 * - Left-click: pans to the master/minion token
 * - Right-click: removes the vision sharing relationship
 */

import { MODULE_ID } from '../constants.js';

class SharedVisionIndicator {
  static #instance = null;

  static getInstance() {
    if (!this.#instance) this.#instance = new this();
    return this.#instance;
  }

  constructor() {
    this._el = null;
    this._tooltipEl = null;
    this._currentToken = null;
    this._sharedVisionData = null;
    this._drag = { active: false, start: { x: 0, y: 0 }, offset: { x: 0, y: 0 }, moved: false };
    this._currentMinionIndex = 0; // For cycling through multiple minions
  }

  update(token) {
    if (!game.user?.isGM) return;

    console.log('PF2E Visioner | SharedVisionIndicator.update() called for token:', token?.name);

    this._currentToken = token;
    this._currentMinionIndex = 0; // Reset to first minion when token changes

    if (!token) {
      console.log('PF2E Visioner | No token provided, hiding indicator');
      this.hide();
      return;
    }

    const visionData = this.#getVisionSharingData(token);
    console.log('PF2E Visioner | Vision data retrieved:', visionData);

    if (!visionData) {
      console.log('PF2E Visioner | No vision data, hiding indicator');
      this.hide();
      return;
    }

    this._sharedVisionData = visionData;
    console.log('PF2E Visioner | Showing indicator');
    this.show();
  }

  #getVisionSharingData(token) {
    if (!token?.document) {
      console.log('PF2E Visioner | No token document');
      return null;
    }

    const tokenActorUuid = token.actor?.uuid || token.actor?.id;
    console.log('PF2E Visioner | Token actor UUID:', tokenActorUuid);

    // Check if this token is a minion (has a master) - look at the actual flags set by ShareVision operation
    const visionMasterTokenId = token.document.getFlag(MODULE_ID, 'visionMasterTokenId');
    const visionSharingMode = token.document.getFlag(MODULE_ID, 'visionSharingMode');
    const visionMasterActorUuid = token.document.getFlag(MODULE_ID, 'visionMasterActorUuid');

    console.log('PF2E Visioner | Vision sharing flags:', {
      visionMasterTokenId,
      visionSharingMode,
      visionMasterActorUuid,
    });

    if (visionMasterTokenId || visionMasterActorUuid) {
      // Try to get master token from token ID first (most reliable)
      let masterToken = visionMasterTokenId ? canvas?.tokens?.get(visionMasterTokenId) : null;

      // If no master token from ID, try to resolve from actor UUID
      if (!masterToken && visionMasterActorUuid) {
        try {
          let masterActor = null;
          if (visionMasterActorUuid.includes('.')) {
            masterActor = fromUuidSync(visionMasterActorUuid);
          } else {
            masterActor = game.actors.get(visionMasterActorUuid);
          }

          if (masterActor) {
            const masterTokens = masterActor.getActiveTokens?.(false, true);
            masterToken = masterTokens?.[0];
          }
        } catch (error) {
          console.warn('PF2E Visioner | Failed to resolve master actor UUID:', error);
        }
      }

      if (!masterToken) {
        console.log('PF2E Visioner | Could not find master token');
        return null;
      }

      return {
        masterToken,
        masterName: masterToken.name || masterToken.document.name,
        mode: visionSharingMode || 'one-way',
        isMaster: false,
        tokenName: token.name || token.document.name,
        relationType: 'minion',
      };
    }

    // Check if this token is a master (other tokens sharing vision with it)
    const tokenId = token.id || token.document?.id;

    const minions =
      canvas?.tokens?.placeables?.filter((t) => {
        // Check if this token references our token as master via token ID
        const minionMasterTokenId = t.document.getFlag(MODULE_ID, 'visionMasterTokenId');
        if (minionMasterTokenId === tokenId) {
          console.log('PF2E Visioner | Found minion via tokenId:', t.name);
          return true;
        }

        // Check if this token references our token as master via actor UUID
        const minionMasterUuid = t.document.getFlag(MODULE_ID, 'visionMasterActorUuid');
        if (!minionMasterUuid) return false;

        // Compare with token's actor UUID
        if (tokenActorUuid && minionMasterUuid === tokenActorUuid) {
          console.log('PF2E Visioner | Found minion via direct actor UUID match:', t.name);
          return true;
        }

        // Also try resolving the master UUID to compare actors
        try {
          let masterActor = null;
          if (minionMasterUuid.includes('.')) {
            masterActor = fromUuidSync(minionMasterUuid);
          } else {
            masterActor = game.actors.get(minionMasterUuid);
          }
          if (masterActor?.id === token.actor?.id) {
            console.log('PF2E Visioner | Found minion via resolved actor UUID:', t.name);
            return true;
          }
        } catch {
          return false;
        }

        return false;
      }) || [];

    console.log('PF2E Visioner | Found minions:', minions.length);
    if (minions.length === 0) return null;

    // Return data for all minions
    return {
      masterToken: token,
      masterName: token.name || token.document.name,
      isMaster: true,
      relationType: 'master',
      minions: minions.map((m) => ({
        token: m,
        name: m.name || m.document.name,
        mode: m.document.getFlag(MODULE_ID, 'visionSharingMode') || 'one-way',
      })),
      minionCount: minions.length,
    };
  }

  show() {
    console.log('PF2E Visioner | SharedVisionIndicator.show() called');
    if (!this._el) {
      console.log('PF2E Visioner | Creating indicator element');
      this.#createElement();
    }

    this.#updateDisplay();
    console.log('PF2E Visioner | Adding visible class to indicator');
    this._el?.classList.add('pf2e-visioner-shared-vision-indicator--visible');
    console.log('PF2E Visioner | Indicator element:', this._el, 'classes:', this._el?.className);
  }

  hide() {
    this._el?.classList.remove('pf2e-visioner-shared-vision-indicator--visible');
    this.#hideTooltip();
  }

  refreshStyles() {
    const existing = document.getElementById('pf2e-visioner-shared-vision-indicator-styles');
    if (existing) {
      existing.remove();
    }
    this.#ensureStyles();
  }

  #updateDisplay() {
    if (!this._el || !this._sharedVisionData) {
      console.log('PF2E Visioner | #updateDisplay - no element or data');
      return;
    }

    console.log('PF2E Visioner | #updateDisplay called', this._sharedVisionData);

    // Determine the mode to display
    let mode = 'one-way';
    if (this._sharedVisionData.isMaster && this._sharedVisionData.minions?.length > 0) {
      const currentMinion = this._sharedVisionData.minions[this._currentMinionIndex];
      mode = currentMinion?.mode || 'one-way';
    } else {
      mode = this._sharedVisionData.mode || 'one-way';
    }

    const modeIcon = this.#getModeIcon(mode);
    console.log('PF2E Visioner | Using icon:', modeIcon);
    const iconEl = this._el.querySelector('.indicator-icon');
    if (iconEl) {
      iconEl.innerHTML = `<i class="${modeIcon}"></i>`;
      console.log('PF2E Visioner | Updated icon element');
    } else {
      console.warn('PF2E Visioner | No icon element found!');
    }

    // Show/hide cycle button and update badge if there are multiple minions
    const cycleBtn = this._el.querySelector('.cycle-minion-btn');
    if (this._sharedVisionData.isMaster && this._sharedVisionData.minionCount > 1) {
      // Show cycle button
      if (cycleBtn) cycleBtn.style.display = 'flex';

      // Update count badge
      let badgeEl = this._el.querySelector('.minion-count-badge');
      if (!badgeEl) {
        badgeEl = document.createElement('div');
        badgeEl.className = 'minion-count-badge';
        this._el.appendChild(badgeEl);
      }
      badgeEl.textContent = `${this._currentMinionIndex + 1}/${this._sharedVisionData.minionCount}`;
    } else {
      // Hide cycle button
      if (cycleBtn) cycleBtn.style.display = 'none';

      const badgeEl = this._el.querySelector('.minion-count-badge');
      if (badgeEl) badgeEl.remove();
    }
  }

  #getModeIcon(mode) {
    const icons = {
      'one-way': 'fas fa-arrow-right',
      'two-way': 'fas fa-arrows-alt-h',
      replace: 'fas fa-exchange-alt',
      reverse: 'fas fa-arrow-left',
    };
    return icons[mode] || 'fas fa-eye';
  }

  #createElement() {
    this.#ensureStyles();

    const el = document.createElement('div');
    el.className = 'pf2e-visioner-shared-vision-indicator';
    el.innerHTML = `
      <div class="indicator-icon"><i class="fas fa-eye"></i></div>
      <button class="cycle-minion-btn" style="display: none;" type="button">
        <i class="fas fa-chevron-right"></i>
      </button>
    `;

    try {
      const saved = localStorage.getItem('pf2e-visioner-shared-vision-indicator-pos');
      if (saved) {
        const pos = JSON.parse(saved);
        if (pos?.left) el.style.left = pos.left;
        if (pos?.top) el.style.top = pos.top;
      }
    } catch {}

    // Drag handlers
    el.addEventListener('mousedown', (ev) => this.#onMouseDown(ev));
    document.addEventListener('mousemove', (ev) => this.#onMouseMove(ev));
    document.addEventListener('mouseup', (ev) => this.#onMouseUp(ev));

    el.addEventListener('mouseenter', () => this.#showTooltip());
    el.addEventListener('mouseleave', () => this.#hideTooltip());

    el.addEventListener('click', async (ev) => {
      if (this._drag.moved) return; // ignore click after drag
      ev.preventDefault();
      ev.stopPropagation();
      await this.#panToTarget();
    });

    el.addEventListener('contextmenu', async (ev) => {
      if (this._drag.moved) return; // ignore click after drag
      ev.preventDefault();
      ev.stopPropagation();
      await this.#removeVisionSharing();
    });

    // Cycle button handler
    const cycleBtn = el.querySelector('.cycle-minion-btn');
    if (cycleBtn) {
      cycleBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.#cycleMinion();
      });
    }

    document.body.appendChild(el);
    this._el = el;
  }

  #onMouseDown(event) {
    if (event.button !== 0) return; // left only for drag
    this._drag.active = true;
    this._drag.moved = false;
    this._drag.start.x = event.clientX;
    this._drag.start.y = event.clientY;
    const rect = this._el.getBoundingClientRect();
    this._drag.offset.x = event.clientX - rect.left;
    this._drag.offset.y = event.clientY - rect.top;
    this._el.classList.add('dragging');
  }

  #onMouseMove(event) {
    if (!this._drag.active) return;
    const dx = event.clientX - this._drag.start.x;
    const dy = event.clientY - this._drag.start.y;
    if (!this._drag.moved && Math.hypot(dx, dy) > 4) this._drag.moved = true;
    if (!this._drag.moved) return;
    const x = event.clientX - this._drag.offset.x;
    const y = event.clientY - this._drag.offset.y;
    const maxX = window.innerWidth - this._el.offsetWidth;
    const maxY = window.innerHeight - this._el.offsetHeight;
    this._el.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
    this._el.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
  }

  #onMouseUp() {
    if (!this._drag.active) return;
    this._drag.active = false;
    this._el.classList.remove('dragging');
    if (this._drag.moved) {
      try {
        localStorage.setItem(
          'pf2e-visioner-shared-vision-indicator-pos',
          JSON.stringify({ left: this._el.style.left, top: this._el.style.top }),
        );
      } catch {}
      setTimeout(() => (this._drag.moved = false), 50);
    } else {
      this._drag.moved = false;
    }
  }

  async #panToTarget() {
    if (!this._sharedVisionData) return;

    let targetToken = null;

    if (this._sharedVisionData.relationType === 'master') {
      // If current token is master, pan to current minion
      const currentMinion = this._sharedVisionData.minions?.[this._currentMinionIndex];
      targetToken = currentMinion?.token;
    } else {
      // If current token is minion, pan to master
      targetToken = this._sharedVisionData.masterToken;
    }

    if (!targetToken) return;

    await canvas.animatePan({
      x: targetToken.x,
      y: targetToken.y,
      scale: Math.max(1, canvas.stage?.scale?.x || 1),
      duration: 250,
    });

    targetToken.control({ releaseOthers: true });
  }

  #cycleMinion() {
    if (!this._sharedVisionData?.isMaster || !this._sharedVisionData.minions?.length) return;

    this._currentMinionIndex =
      (this._currentMinionIndex + 1) % this._sharedVisionData.minions.length;
    this.#updateDisplay();
    this.#hideTooltip();
    this.#showTooltip();
  }

  #resolveActorUuid(actorUuid) {
    try {
      if (actorUuid.includes('.')) {
        return fromUuidSync(actorUuid);
      } else {
        return game.actors.get(actorUuid);
      }
    } catch {
      return null;
    }
  }

  async #removeVisionSharing() {
    if (!this._sharedVisionData) return;

    try {
      if (this._sharedVisionData.relationType === 'master') {
        // If master, remove vision sharing from current minion
        const currentMinion = this._sharedVisionData.minions?.[this._currentMinionIndex];
        if (!currentMinion?.token?.document) return;

        await currentMinion.token.document.unsetFlag(MODULE_ID, 'visionMasterTokenId');
        await currentMinion.token.document.unsetFlag(MODULE_ID, 'visionMasterActorUuid');
        await currentMinion.token.document.unsetFlag(MODULE_ID, 'visionSharingMode');
        await currentMinion.token.document.unsetFlag(MODULE_ID, 'visionSharingSources');

        ui.notifications?.info(
          game.i18n.format('PF2E_VISIONER.NOTIFICATIONS.VISION_SHARING_REMOVED_FROM', {
            name: currentMinion.name,
          }),
        );

        // Refresh the data to see if there are more minions
        this.update(this._currentToken);
      } else {
        // If minion, remove vision sharing from self
        await this._currentToken.document.unsetFlag(MODULE_ID, 'visionMasterTokenId');
        await this._currentToken.document.unsetFlag(MODULE_ID, 'visionMasterActorUuid');
        await this._currentToken.document.unsetFlag(MODULE_ID, 'visionSharingMode');
        await this._currentToken.document.unsetFlag(MODULE_ID, 'visionSharingSources');

        ui.notifications?.info(
          game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.VISION_SHARING_REMOVED'),
        );

        this.hide();
      }
    } catch (error) {
      console.error('PF2E Visioner | Failed to remove vision sharing:', error);
      ui.notifications?.error(
        game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.VISION_SHARING_REMOVE_FAILED'),
      );
    }
  }

  #showTooltip() {
    if (!this._sharedVisionData) return;
    if (this._tooltipEl?.isConnected) return;

    const tip = document.createElement('div');
    tip.className = 'pf2e-visioner-shared-vision-tooltip';
    this._tooltipEl = tip;

    const modeLabels = {
      'one-way': game.i18n.localize('PF2E_VISIONER.VISION_MASTER_DIALOG.MODE_ONE_WAY'),
      'two-way': game.i18n.localize('PF2E_VISIONER.VISION_MASTER_DIALOG.MODE_TWO_WAY'),
      replace: game.i18n.localize('PF2E_VISIONER.VISION_MASTER_DIALOG.MODE_REPLACE'),
      reverse: game.i18n.localize('PF2E_VISIONER.VISION_MASTER_DIALOG.MODE_REVERSE'),
    };

    const isMaster = this._sharedVisionData.relationType === 'master';
    const minionCount = this._sharedVisionData.minionCount || 0;

    let relationshipBadge = '';
    let currentTokenName = '';
    let otherTokenName = '';
    let modeLabel = '';
    let sharedWithLabel = '';

    if (isMaster) {
      const currentMinion = this._sharedVisionData.minions?.[this._currentMinionIndex];
      currentTokenName = this._sharedVisionData.masterName;
      otherTokenName = currentMinion?.name || '';
      modeLabel = modeLabels[currentMinion?.mode] || currentMinion?.mode || '';
      sharedWithLabel = game.i18n.localize('PF2E_VISIONER.UI.VISION_SHARED_WITH');

      const roleText =
        minionCount > 1
          ? `${game.i18n.localize('PF2E_VISIONER.UI.VISION_ROLE_MASTER')} (${this._currentMinionIndex + 1}/${minionCount})`
          : game.i18n.localize('PF2E_VISIONER.UI.VISION_ROLE_MASTER');
      relationshipBadge = `<div class="relationship-badge master-badge"><i class="fas fa-crown"></i> ${roleText}</div>`;
    } else {
      currentTokenName = this._sharedVisionData.tokenName || '';
      otherTokenName = this._sharedVisionData.masterName;
      modeLabel = modeLabels[this._sharedVisionData.mode] || this._sharedVisionData.mode;
      sharedWithLabel = game.i18n.localize('PF2E_VISIONER.UI.VISION_MASTER');
      relationshipBadge = `<div class="relationship-badge minion-badge"><i class="fas fa-link"></i> ${game.i18n.localize('PF2E_VISIONER.UI.VISION_ROLE_MINION')}</div>`;
    }

    tip.innerHTML = `
      <div class="tip-header">
        ${relationshipBadge}
        <strong>${currentTokenName}</strong>
      </div>
      <div class="tip-content">
        <div>${sharedWithLabel}: <strong>${otherTokenName}</strong></div>
        <div>${modeLabel}</div>
      </div>
    `;

    document.body.appendChild(tip);
    const rect = this._el.getBoundingClientRect();
    tip.style.left = rect.right + 8 + 'px';
    tip.style.top = Math.max(8, rect.top - 8) + 'px';
  }

  #hideTooltip() {
    if (this._tooltipEl?.parentElement) {
      this._tooltipEl.parentElement.removeChild(this._tooltipEl);
    }
    this._tooltipEl = null;
  }

  #ensureStyles() {
    const existing = document.getElementById('pf2e-visioner-shared-vision-indicator-styles');

    // Read size preference (client setting); default small
    let size = 'small';
    try {
      size = game.settings.get('pf2e-visioner', 'sharedVisionIndicatorSize') || 'small';
    } catch {}

    const presets = {
      small: { size: 34, radius: 8, font: 15 },
      medium: { size: 42, radius: 9, font: 18 },
      large: { size: 52, radius: 10, font: 22 },
      xlarge: { size: 64, radius: 12, font: 26 },
    };
    const p = presets[size] || presets.small;

    // If styles already exist and haven't changed, skip
    if (existing && existing.dataset.size === size) return;

    // Remove old styles if they exist
    if (existing) existing.remove();

    const style = document.createElement('style');
    style.id = 'pf2e-visioner-shared-vision-indicator-styles';
    style.dataset.size = size;

    style.textContent = `
      .pf2e-visioner-shared-vision-indicator {
        position: fixed;
        left: 50%;
        top: 80px;
        width: ${p.size}px;
        height: ${p.size}px;
        background: rgba(20, 20, 20, 0.92);
        border: 2px solid rgba(33, 150, 243, 1);
        border-radius: ${p.radius}px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
        cursor: move;
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        user-select: none;
      }
      .pf2e-visioner-shared-vision-indicator--visible {
        display: flex;
      }
      .pf2e-visioner-shared-vision-indicator:hover {
        transform: scale(1.08);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      }
      .pf2e-visioner-shared-vision-indicator.dragging {
        cursor: grabbing;
        transform: scale(1.06);
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.5);
      }
      .pf2e-visioner-shared-vision-indicator .indicator-icon {
        font-size: ${p.font}px;
        color: rgba(33, 150, 243, 1);
      }
      .pf2e-visioner-shared-vision-indicator {
        overflow: visible;
      }
      .pf2e-visioner-shared-vision-indicator .cycle-minion-btn {
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        width: auto;
        height: auto;
        background: transparent;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2px;
        margin-top: 2px;
        transition: transform 0.1s ease, opacity 0.1s ease;
        z-index: 1;
        opacity: 0.7;
      }
      .pf2e-visioner-shared-vision-indicator .cycle-minion-btn:hover {
        transform: translateX(-50%) scale(1.3);
        opacity: 1;
      }
      .pf2e-visioner-shared-vision-indicator .cycle-minion-btn:active {
        transform: translateX(-50%) scale(1.1);
      }
      .pf2e-visioner-shared-vision-indicator .cycle-minion-btn i {
        font-size: 8px;
        color: rgba(255, 255, 255, 0.95);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
      }
      .pf2e-visioner-shared-vision-indicator .minion-count-badge {
        position: absolute;
        top: -6px;
        right: -6px;
        background: rgba(255, 193, 7, 0.95);
        border: 1px solid rgba(255, 193, 7, 1);
        border-radius: 6px;
        padding: 1px 4px;
        font-size: 8px;
        font-weight: 700;
        color: #000;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        line-height: 1.1;
        min-width: 18px;
        text-align: center;
      }

      .pf2e-visioner-shared-vision-tooltip {
        position: fixed;
        background: rgba(32, 32, 32, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        padding: 8px 10px;
        z-index: 10001;
        pointer-events: none;
        color: #fff;
        font-size: 12px;
        line-height: 1.3;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        white-space: nowrap;
      }
      .pf2e-visioner-shared-vision-tooltip .tip-header {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        margin-bottom: 4px;
      }
      .pf2e-visioner-shared-vision-tooltip .relationship-badge {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 600;
      }
      .pf2e-visioner-shared-vision-tooltip .master-badge {
        background: rgba(255, 193, 7, 0.2);
        border: 1px solid rgba(255, 193, 7, 0.5);
        color: rgba(255, 193, 7, 1);
      }
      .pf2e-visioner-shared-vision-tooltip .minion-badge {
        background: rgba(33, 150, 243, 0.2);
        border: 1px solid rgba(33, 150, 243, 0.5);
        color: rgba(33, 150, 243, 1);
      }
      .pf2e-visioner-shared-vision-tooltip .relationship-badge i {
        font-size: 9px;
      }
      .pf2e-visioner-shared-vision-tooltip .tip-content {
        display: flex;
        flex-direction: column;
        gap: 3px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.8);
      }
    `;

    document.head.appendChild(style);
  }
}

export default SharedVisionIndicator;
