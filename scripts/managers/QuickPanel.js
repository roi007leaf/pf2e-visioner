import AvsOverrideManager from '../chat/services/infra/AvsOverrideManager.js';
import { COVER_STATES, VISIBILITY_STATES } from '../constants.js';
import { setCoverBetween, setVisibilityBetween } from '../utils.js';

export class VisionerQuickPanel extends foundry.applications.api.ApplicationV2 {
  static current = null;
  static DEFAULT_OPTIONS = {
    id: 'pf2e-visioner-quick-panel',
    tag: 'div',
    window: {
      title: 'Visioner Quick Edit',
      icon: 'fas fa-bolt',
      resizable: true,
    },
    position: { width: 'auto', height: 'auto' },
    actions: {
      close: VisionerQuickPanel._onClose,
      toggleMode: VisionerQuickPanel._onToggleMode,
      setVisibility: VisionerQuickPanel._onSetVisibility,
      setCover: VisionerQuickPanel._onSetCover,
      minimize: VisionerQuickPanel._onMinimize,
      selectParty: VisionerQuickPanel._onSelectParty,
      selectEnemies: VisionerQuickPanel._onSelectEnemies,
      targetParty: VisionerQuickPanel._onTargetParty,
      targetEnemies: VisionerQuickPanel._onTargetEnemies,
      clearAll: VisionerQuickPanel._onClearAll,
    },
  };

  constructor(options = {}) {
    super(options);
    this.mode = options.mode || 'target'; // 'observer' | 'target'
    this._floatingBtnEl = null;
    this._floatingPos = null;
    try {
      VisionerQuickPanel.current = this;
    } catch (_) { }
  }

  get selectedTokens() {
    return Array.from(canvas?.tokens?.controlled ?? []).filter((t) => !!t?.actor);
  }

  get targetedTokens() {
    return Array.from(game?.user?.targets ?? []).filter((t) => !!t?.actor);
  }

  async _prepareContext(_options) {
    const visList = Object.entries(VISIBILITY_STATES).map(([key, cfg]) => ({
      key,
      label: game.i18n.localize(cfg.label),
      icon: cfg.icon,
      color: cfg.color,
      cssClass: cfg.cssClass,
    }));
    const coverList = Object.entries(COVER_STATES).map(([key, cfg]) => ({
      key,
      label: game.i18n.localize(cfg.label),
      icon: cfg.icon,
      color: cfg.color,
      cssClass: cfg.cssClass,
    }));
    const selected = this.selectedTokens;
    const targeted = this.targetedTokens;
    const formatNames = (tokens) => {
      try {
        const names = Array.from(
          new Set(
            tokens.map((t) => t?.name || t?.document?.name || t?.actor?.name).filter((n) => !!n),
          ),
        );
        return names.length ? names.join('\n') : game.i18n?.localize?.('None') || 'None';
      } catch (_) {
        return 'None';
      }
    };
    return {
      mode: this.mode,
      modeIsObserver: this.mode === 'observer',
      selCount: selected.length,
      tgtCount: targeted.length,
      selTooltip: formatNames(selected),
      tgtTooltip: formatNames(targeted),
      visibilityStates: visList,
      coverStates: coverList,
    };
  }

  async _renderHTML(context, _options) {
    return await foundry.applications.handlebars.renderTemplate(
      'modules/pf2e-visioner/templates/quick-panel.hbs',
      context,
    );
  }

  _replaceHTML(result, content, _options) {
    try {
      content.innerHTML = result;
    } catch (_) { }
    return content;
  }

  async _onRender(options) {
    await super._onRender(options);
    this._injectHeaderMinimizeButton();
    try {
      VisionerQuickPanel.current = this;
    } catch (_) { }
    this._bindAutoRefresh();

    // Fire custom hook for colorblind mode application
    try {
      Hooks.call('renderVisionerQuickPanel', this, this.element);
    } catch (error) {
      console.warn('PF2E Visioner: Failed to fire renderVisionerQuickPanel hook:', error);
    }
  }

  static _onClose(_event, _button) {
    try {
      this.close();
    } catch (_) { }
  }

  async close(options) {
    try {
      this._unbindAutoRefresh?.();
    } catch (_) { }
    try {
      await super.close(options);
    } finally {
      try {
        this._unbindAutoRefresh = null;
      } catch (_) { }
      try {
        VisionerQuickPanel.current = null;
      } catch (_) { }
    }
  }

  static async _onToggleMode(_event, _button) {
    this.mode = this.mode === 'observer' ? 'target' : 'observer';
    this.render({ force: true });
  }

  static async _onRefreshSets(_event, _button) {
    this.render({ force: true });
  }

  static async _onMinimize(_event, _button) {
    try {
      // Determine current dialog position on screen so the floater appears there
      let left = 120,
        top = 120;
      try {
        const root =
          document.getElementById(this.id) ||
          this.element?.parentElement ||
          this.element?.closest?.('section, .application, .window-app') ||
          null;
        const rect = root?.getBoundingClientRect?.();
        if (rect) {
          left = rect.left;
          top = rect.top;
        }
      } catch (_) { }
      this._showFloatingButton({ left, top });
      await this.close();
    } catch (_) { }
  }

  static async _onSetVisibility(event, button) {
    const state = button?.dataset?.state;
    if (!state) return;
    const selected = this.selectedTokens;
    const targeted = this.targetedTokens;
    if (!selected.length || !targeted.length) {
      ui.notifications?.warn?.('Select token(s) and target token(s) first.');
      return;
    }
    const pairs = [];
    for (const s of selected) {
      for (const t of targeted) {
        if (s === t) continue;
        const observer = this.mode === 'observer' ? s : t;
        const target = this.mode === 'observer' ? t : s;
        pairs.push([observer, target]);
      }
    }
    try {
      for (const [obs, tgt] of pairs) {
        // First, set AVS overrides so auto-visibility won't fight manual edits
        try {
          await AvsOverrideManager.applyOverrides(obs, { target: tgt, state }, {
            source: 'manual_action',
          });
        } catch (e) {
          console.warn('[pf2e-visioner] quick panel: failed to set AVS overrides', e);
        }

        // Then, apply the immediate visibility change for responsiveness
        await setVisibilityBetween(obs, tgt, state);
      }
      ui.notifications?.info?.(`Applied ${state} to ${pairs.length} pair(s).`);
    } catch (e) {
      console.error('[pf2e-visioner] quick visibility error', e);
    }
  }

  static async _onSetCover(event, button) {
    const state = button?.dataset?.state;
    if (!state) return;
    const selected = this.selectedTokens;
    const targeted = this.targetedTokens;
    if (!selected.length || !targeted.length) {
      ui.notifications?.warn?.('Select token(s) and target token(s) first.');
      return;
    }
    const pairs = [];
    for (const s of selected) {
      for (const t of targeted) {
        if (s === t) continue;
        const observer = this.mode === 'observer' ? s : t;
        const target = this.mode === 'observer' ? t : s;
        pairs.push([observer, target]);
      }
    }
    try {
      for (const [obs, tgt] of pairs) {
        await setCoverBetween(obs, tgt, state);
      }
      ui.notifications?.info?.(`Applied cover ${state} to ${pairs.length} pair(s).`);
    } catch (e) {
      console.error('[pf2e-visioner] quick cover error', e);
    }
  }

  static async _onSelectParty(_event, _button) {
    try {
      const partyTokens = VisionerQuickPanel._getPartyTokens();
      if (!partyTokens.length) {
        ui.notifications?.warn?.('No party tokens found in the scene.');
        return;
      }

      // Clear current selection
      canvas.tokens.releaseAll();

      // Wait for the next frame to ensure releaseAll completes
      await new Promise((resolve) => requestAnimationFrame(resolve));

      // Simulate multi-select behavior like Shift+click
      let selectedCount = 0;

      if (partyTokens.length > 0) {
        // Select first token normally
        const firstToken = partyTokens[0];
        if (firstToken && firstToken.control) {
          firstToken.control();
          selectedCount++;
        }

        // Select remaining tokens with "add to selection" behavior
        for (let i = 1; i < partyTokens.length; i++) {
          const token = partyTokens[i];
          if (token && token.control) {
            // Simulate Shift+click by not releasing previous selection
            token.control({ releaseOthers: false });
            selectedCount++;
          }
        }
      }

      ui.notifications?.info?.(`Selected ${selectedCount} party token(s).`);
    } catch (e) {
      console.error('[pf2e-visioner] select party error', e);
    }
  }

  static async _onSelectEnemies(_event, _button) {
    try {
      const enemyTokens = VisionerQuickPanel._getEnemyTokens();
      if (!enemyTokens.length) {
        ui.notifications?.warn?.('No enemy tokens found in the scene.');
        return;
      }

      // Clear current selection
      canvas.tokens.releaseAll();

      // Wait for the next frame to ensure releaseAll completes
      await new Promise((resolve) => requestAnimationFrame(resolve));

      // Simulate multi-select behavior like Shift+click
      let selectedCount = 0;

      if (enemyTokens.length > 0) {
        // Select first token normally
        const firstToken = enemyTokens[0];
        if (firstToken && firstToken.control) {
          firstToken.control();
          selectedCount++;
        }

        // Select remaining tokens with "add to selection" behavior
        for (let i = 1; i < enemyTokens.length; i++) {
          const token = enemyTokens[i];
          if (token && token.control) {
            // Simulate Shift+click by not releasing previous selection
            token.control({ releaseOthers: false });
            selectedCount++;
          }
        }
      }

      ui.notifications?.info?.(`Selected ${selectedCount} enemy token(s).`);
    } catch (e) {
      console.error('[pf2e-visioner] select enemies error', e);
    }
  }

  static async _onTargetParty(_event, _button) {
    try {
      const partyTokens = VisionerQuickPanel._getPartyTokens();
      if (!partyTokens.length) {
        ui.notifications?.warn?.('No party tokens found in the scene.');
        return;
      }

      // Clear current targets first
      for (const token of canvas.tokens.placeables) {
        if (token.isTargeted) {
          token.setTarget(false, { releaseOthers: false });
        }
      }

      // Target party tokens
      for (const token of partyTokens) {
        token.setTarget(true, { releaseOthers: false });
      }

      ui.notifications?.info?.(`Targeted ${partyTokens.length} party token(s).`);
    } catch (e) {
      console.error('[pf2e-visioner] target party error', e);
    }
  }

  static async _onTargetEnemies(_event, _button) {
    try {
      const enemyTokens = VisionerQuickPanel._getEnemyTokens();
      if (!enemyTokens.length) {
        ui.notifications?.warn?.('No enemy tokens found in the scene.');
        return;
      }

      // Clear current targets first
      for (const token of canvas.tokens.placeables) {
        if (token.isTargeted) {
          token.setTarget(false, { releaseOthers: false });
        }
      }

      // Target enemy tokens
      for (const token of enemyTokens) {
        token.setTarget(true, { releaseOthers: false });
      }

      ui.notifications?.info?.(`Targeted ${enemyTokens.length} enemy token(s).`);
    } catch (e) {
      console.error('[pf2e-visioner] target enemies error', e);
    }
  }

  static async _onClearAll(_event, _button) {
    try {
      // Clear all selected tokens
      canvas.tokens.releaseAll();

      // Clear all targeted tokens
      for (const token of canvas.tokens.placeables) {
        if (token.isTargeted) {
          token.setTarget(false, { releaseOthers: false });
        }
      }

      ui.notifications?.info?.('Cleared all selections and targets.');
    } catch (e) {
      console.error('[pf2e-visioner] clear all error', e);
    }
  }

  // Floating button helpers
  _bindAutoRefresh() {
    try {
      // Remove previous
      this._unbindAutoRefresh?.();
      const rerender = () => {
        try {
          if (this._autoRefreshTimer) clearTimeout(this._autoRefreshTimer);
          this._autoRefreshTimer = setTimeout(() => {
            try {
              this.render({ force: true });
            } catch (_) { }
          }, 50);
        } catch (_) { }
      };
      const onControlToken = () => rerender();
      const onTargetToken = () => rerender();
      Hooks.on('controlToken', onControlToken);
      Hooks.on('releaseToken', onControlToken);
      Hooks.on('targetToken', onTargetToken);
      this._unbindAutoRefresh = () => {
        try {
          Hooks.off('controlToken', onControlToken);
        } catch (_) { }
        try {
          Hooks.off('releaseToken', onControlToken);
        } catch (_) { }
        try {
          Hooks.off('targetToken', onTargetToken);
        } catch (_) { }
        try {
          if (this._autoRefreshTimer) {
            clearTimeout(this._autoRefreshTimer);
            this._autoRefreshTimer = null;
          }
        } catch (_) { }
        this._unbindAutoRefresh = null;
      };
      // Clean up on close
      this.once?.('close', () => {
        try {
          this._unbindAutoRefresh?.();
        } catch (_) { }
      });
    } catch (_) { }
  }
  _injectHeaderMinimizeButton() {
    try {
      const root =
        document.getElementById(this.id) ||
        this.element?.parentElement ||
        this.element?.closest?.('section, .application, .window-app') ||
        null;
      const header = root?.querySelector?.('.window-header, header') || null;
      if (!header) {
        setTimeout(() => this._injectHeaderMinimizeButton(), 50);
        return;
      }
      if (header.querySelector?.('.pf2e-visioner-minimize')) return;
      const closeBtn = header.querySelector?.('[data-action=close], .close, .window-close') || null;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pf2e-visioner-minimize';
      btn.setAttribute('data-tooltip', 'Minimize');
      btn.innerHTML = '<i class="fas fa-window-minimize"></i>';
      // Minimal header style
      btn.style.background = 'transparent';
      btn.style.border = 'none';
      btn.style.width = '24px';
      btn.style.height = '24px';
      btn.style.display = 'grid';
      btn.style.placeItems = 'center';
      btn.style.color = 'var(--color-text-light-highlight, #fff)';
      btn.style.marginRight = '4px';
      btn.addEventListener('click', () => {
        try {
          const rect = (
            document.getElementById(this.id) || this.element?.parentElement
          )?.getBoundingClientRect?.();
          const pos = rect ? { left: rect.left, top: rect.top } : null;
          this._showFloatingButton(pos || undefined);
          this.close();
        } catch (_) { }
      });
      if (closeBtn && closeBtn.parentElement) closeBtn.parentElement.insertBefore(btn, closeBtn);
      else header.appendChild(btn);
    } catch (_) { }
  }

  _showFloatingButton(pos) {
    try {
      if (this._floatingBtnEl && document.body.contains(this._floatingBtnEl)) return;
      const existing = document.getElementById('pf2e-visioner-floating-qp');
      if (existing) {
        this._floatingBtnEl = existing;
        return;
      }

      const btn = document.createElement('div');
      btn.id = 'pf2e-visioner-floating-qp';
      btn.style.position = 'fixed';
      btn.style.width = '28px';
      btn.style.height = '28px';
      btn.style.borderRadius = '6px';
      btn.style.display = 'flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.cursor = 'pointer';
      btn.style.background = 'var(--color-background, rgba(0,0,0,0.4))';
      btn.style.border = '1px solid var(--color-border-light-2, #2b2b2b)';
      btn.style.color = 'var(--color-text-light-highlight, #fff)';
      btn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.35)';
      btn.style.zIndex = 10000;

      // Position: restore last position if available else near current app
      try {
        const saved = localStorage.getItem('pf2e-visioner.qp.float.pos');
        if (saved) this._floatingPos = JSON.parse(saved);
      } catch (_) { }
      const basePos = pos || this._floatingPos || this.position || { left: 120, top: 120 };
      const left = Math.max(0, Math.round(basePos.left ?? 120));
      const top = Math.max(0, Math.round(basePos.top ?? 120));
      btn.style.left = `${Math.max(0, left)}px`;
      btn.style.top = `${Math.max(0, top)}px`;

      btn.innerHTML = '<i class="fas fa-bolt"></i>';

      // Click to reopen
      btn.addEventListener('click', (ev) => {
        if (btn._dragging) return; // ignore click after drag
        try {
          // Restore window near the floater position
          const leftNow = parseInt(btn.style.left || '0', 10);
          const topNow = parseInt(btn.style.top || '0', 10);
          this.position = { ...(this.position || {}), left: leftNow, top: topNow };
          this.render({ force: true });
          this._removeFloatingButton();
        } catch (_) { }
      });

      // Drag logic
      btn.addEventListener('mousedown', (downEv) => {
        if (downEv.button !== 0) return;
        downEv.preventDefault();
        const startX = downEv.clientX;
        const startY = downEv.clientY;
        const rect = btn.getBoundingClientRect();
        const offsetX = startX - rect.left;
        const offsetY = startY - rect.top;
        btn._dragging = false;

        const onMove = (moveEv) => {
          const x = moveEv.clientX - offsetX;
          const y = moveEv.clientY - offsetY;
          const moved = Math.abs(moveEv.clientX - startX) + Math.abs(moveEv.clientY - startY);
          if (moved > 2) btn._dragging = true;
          btn.style.left = `${Math.max(0, x)}px`;
          btn.style.top = `${Math.max(0, y)}px`;
        };
        const onUp = (upEv) => {
          document.removeEventListener('mousemove', onMove, true);
          document.removeEventListener('mouseup', onUp, true);
          try {
            this._floatingPos = {
              left: parseInt(btn.style.left || '0', 10),
              top: parseInt(btn.style.top || '0', 10),
            };
            localStorage.setItem('pf2e-visioner.qp.float.pos', JSON.stringify(this._floatingPos));
          } catch (_) { }
          setTimeout(() => {
            btn._dragging = false;
          }, 0);
        };
        document.addEventListener('mousemove', onMove, true);
        document.addEventListener('mouseup', onUp, true);
      });

      document.body.appendChild(btn);
      this._floatingBtnEl = btn;
    } catch (e) {
      console.error('[pf2e-visioner] quick panel floating button error', e);
    }
  }

  _removeFloatingButton() {
    try {
      if (this._floatingBtnEl && this._floatingBtnEl.parentElement)
        this._floatingBtnEl.parentElement.removeChild(this._floatingBtnEl);
      this._floatingBtnEl = null;
    } catch (_) { }
  }

  // Helper methods to get party and enemy tokens
  static _getPartyTokens() {
    try {
      return Array.from(canvas?.tokens?.placeables ?? [])
        .filter(
          (token) => token?.actor && token.actor.type === 'character' && token.actor.hasPlayerOwner,
        )
        .filter((token) => token.actor.alliance === 'party' || token.actor.alliance === 'self');
    } catch (_) {
      return [];
    }
  }

  static _getEnemyTokens() {
    try {
      return Array.from(canvas?.tokens?.placeables ?? [])
        .filter((token) => token?.actor && token.actor.type === 'npc')
        .filter((token) => !token.actor.hasPlayerOwner);
    } catch (_) {
      return [];
    }
  }
}
