import { TIMED_OVERRIDE_TYPES, TURN_TIMING, VISIBILITY_STATES } from '../constants.js';

export class TimerDurationDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  constructor(options = {}) {
    options.window = options.window || {};
    options.window.title =
      game?.i18n?.localize('PF2E_VISIONER.TIMED_OVERRIDE.DIALOG_TITLE') || 'Apply Timed Override';

    super(options);
    this.targetToken = options.targetToken || null;
    this.observerToken = options.observerToken || null;
    this.defaultActorId = options.defaultActorId || null;
    this.newState = options.newState || 'hidden';
    this.onApplyCallback = options.onApply || null;
    this.onCancelCallback = options.onCancel || null;
    this.selectedDuration = null;
    this.customValue = 1;
    this.customUnit = 'rounds';
    this.turnTiming = TURN_TIMING.START;
    this.turnActorId = null;
    this._didApply = false;
  }

  static DEFAULT_OPTIONS = {
    id: 'timer-duration-dialog',
    tag: 'div',
    window: {
      icon: 'fas fa-clock',
      contentClasses: ['pf2e-visioner', 'timer-duration-dialog'],
      resizable: false,
    },
    position: {
      width: 380,
      height: 'auto',
    },
    actions: {
      selectPreset: TimerDurationDialog._onSelectPreset,
      applyTimer: TimerDurationDialog._onApplyTimer,
      cancelTimer: TimerDurationDialog._onCancelTimer,
    },
  };

  static PARTS = {
    content: {
      template: 'modules/pf2e-visioner/templates/timer-duration-dialog.hbs',
    },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    const stateConfig = VISIBILITY_STATES[this.newState] || VISIBILITY_STATES.observed;
    const stateLabel = game.i18n.localize(stateConfig.label);

    const combat = game.combat;
    const hasCombat = !!combat;
    const combatants = hasCombat ? this._getCombatantOptions(combat) : [];

    if (hasCombat && combatants.length > 0 && !this.turnActorId) {
      if (this.defaultActorId) {
        const matchingCombatant = combatants.find((c) => c.actorId === this.defaultActorId);
        this.turnActorId = matchingCombatant ? this.defaultActorId : combatants[0].actorId;
      } else {
        this.turnActorId = combatants[0].actorId;
      }
    }

    return {
      ...context,
      targetName: this.targetToken?.name || 'Unknown',
      targetImg: this._getTokenImage(this.targetToken),
      newState: this.newState,
      stateLabel,
      stateIcon: stateConfig.icon,
      stateCssClass: stateConfig.cssClass,
      hasCombat,
      combatants,
      selectedDuration: this.selectedDuration,
      customValue: this.customValue,
      customUnit: this.customUnit,
      turnTiming: this.turnTiming,
      turnActorId: this.turnActorId,
      presets: this._getPresets(hasCombat),
    };
  }

  _getTokenImage(token) {
    if (!token) return 'icons/svg/mystery-man.svg';
    return (
      token.actor?.img ||
      token.document?.texture?.src ||
      token.texture?.src ||
      'icons/svg/mystery-man.svg'
    );
  }

  _getCombatantOptions(combat) {
    if (!combat?.turns) return [];

    const options = [];
    for (const combatant of combat.turns) {
      if (!combatant.actor) continue;
      options.push({
        actorId: combatant.actorId,
        name: combatant.name || combatant.actor?.name || 'Unknown',
        img: combatant.actor?.img || combatant.token?.texture?.src || 'icons/svg/mystery-man.svg',
        selected: this.turnActorId === combatant.actorId,
      });
    }
    return options;
  }

  _getPresets(hasCombat) {
    const presets = [];

    if (hasCombat) {
      presets.push({
        key: '1round',
        label: game.i18n.localize('PF2E_VISIONER.TIMED_OVERRIDE.PRESET_1_ROUND'),
        icon: 'fas fa-dice-one',
        type: TIMED_OVERRIDE_TYPES.ROUNDS,
        value: 1,
      });
      presets.push({
        key: '3rounds',
        label: game.i18n.localize('PF2E_VISIONER.TIMED_OVERRIDE.PRESET_3_ROUNDS'),
        icon: 'fas fa-dice-three',
        type: TIMED_OVERRIDE_TYPES.ROUNDS,
        value: 3,
      });
      presets.push({
        key: '5rounds',
        label: game.i18n.localize('PF2E_VISIONER.TIMED_OVERRIDE.PRESET_5_ROUNDS'),
        icon: 'fas fa-dice-five',
        type: TIMED_OVERRIDE_TYPES.ROUNDS,
        value: 5,
      });
    }

    presets.push({
      key: '1min',
      label: game.i18n.localize('PF2E_VISIONER.TIMED_OVERRIDE.PRESET_1_MIN'),
      icon: 'fas fa-hourglass-half',
      type: TIMED_OVERRIDE_TYPES.REALTIME,
      value: 1,
    });
    presets.push({
      key: '5min',
      label: game.i18n.localize('PF2E_VISIONER.TIMED_OVERRIDE.PRESET_5_MIN'),
      icon: 'fas fa-hourglass',
      type: TIMED_OVERRIDE_TYPES.REALTIME,
      value: 5,
    });

    return presets;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);

    this._attachInputListeners();
    this._updatePresetSelection();
    this._updateTurnTimingVisibility();
    this._updateApplyButtonState();
  }

  _updateApplyButtonState() {
    const el = this.element;
    if (!el) return;
    const applyBtn = el.querySelector('.apply-btn');
    if (!applyBtn) return;
    applyBtn.disabled = !this.selectedDuration;
  }

  _getSelectedTimerType() {
    if (this.selectedDuration === 'custom') {
      return this.customUnit === 'rounds'
        ? TIMED_OVERRIDE_TYPES.ROUNDS
        : TIMED_OVERRIDE_TYPES.REALTIME;
    }

    const presets = this._getPresets(!!game.combat);
    const preset = presets.find((p) => p.key === this.selectedDuration);
    return preset?.type;
  }

  _updateTurnTimingVisibility() {
    const el = this.element;
    if (!el) return;
    const section = el.querySelector('.turn-timing-section');
    if (!section) return;
    const shouldShow =
      !!game.combat && this._getSelectedTimerType() === TIMED_OVERRIDE_TYPES.ROUNDS;
    section.hidden = !shouldShow;
  }

  _attachInputListeners() {
    const el = this.element;
    if (!el) return;

    const customValueInput = el.querySelector('input[name="customValue"]');
    if (customValueInput) {
      customValueInput.addEventListener('change', (e) => {
        this.customValue = parseInt(e.target.value) || 1;
        this.selectedDuration = 'custom';
        this._updatePresetSelection();
      });
      customValueInput.addEventListener('focus', () => {
        this.selectedDuration = 'custom';
        this._updatePresetSelection();
      });
    }

    const customUnitSelect = el.querySelector('select[name="customUnit"]');
    if (customUnitSelect) {
      customUnitSelect.addEventListener('change', (e) => {
        this.customUnit = e.target.value;
        this.selectedDuration = 'custom';
        this._updatePresetSelection();
        this._updateTurnTimingVisibility();
      });
    }

    const turnTimingSelect = el.querySelector('select[name="turnTiming"]');
    if (turnTimingSelect) {
      turnTimingSelect.addEventListener('change', (e) => {
        this.turnTiming = e.target.value;
      });
    }

    const turnActorSelect = el.querySelector('select[name="turnActorId"]');
    if (turnActorSelect) {
      this.turnActorId = turnActorSelect.value;
      turnActorSelect.addEventListener('change', (e) => {
        this.turnActorId = e.target.value;
      });
    }
  }

  _updatePresetSelection() {
    const el = this.element;
    if (!el) return;

    el.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.classList.remove('selected');
      if (btn.dataset.preset === this.selectedDuration) {
        btn.classList.add('selected');
      }
    });

    const customSection = el.querySelector('.custom-duration-section');
    if (customSection) {
      if (this.selectedDuration === 'custom') {
        customSection.classList.add('active');
      } else {
        customSection.classList.remove('active');
      }
    }

    this._updateTurnTimingVisibility();
    this._updateApplyButtonState();
  }

  static _onSelectPreset(event, target) {
    const preset = target.dataset.preset;
    if (!preset) return;

    this.selectedDuration = preset;
    this._updatePresetSelection();
    this._updateTurnTimingVisibility();
  }

  static async _onApplyTimer(event, target) {
    if (!this.selectedDuration) {
      ui.notifications?.warn(
        game.i18n.localize('PF2E_VISIONER.TIMED_OVERRIDE.NO_DURATION_SELECTED'),
      );
      return;
    }

    const timerConfig = this._buildTimerConfig();
    if (!timerConfig) {
      ui.notifications?.warn(
        game.i18n.localize('PF2E_VISIONER.TIMED_OVERRIDE.NO_COMBAT_FOR_ROUNDS'),
      );
      return;
    }

    if (typeof this.onApplyCallback === 'function') {
      await this.onApplyCallback(timerConfig);
    }

    this._didApply = true;

    this.close();
  }

  static _onCancelTimer(event, target) {
    try {
      if (typeof this.onCancelCallback === 'function') this.onCancelCallback();
    } catch {}
    this.close();
  }

  async close(options) {
    try {
      if (!this._didApply && typeof this.onCancelCallback === 'function') this.onCancelCallback();
    } catch {}
    return super.close(options);
  }

  static async prompt(options = {}) {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      TimerDurationDialog.show({
        ...options,
        onApply: (cfg) => settle(cfg),
        onCancel: () => settle(null),
      });
    });
  }

  _buildTimerConfig() {
    if (!this.selectedDuration) return null;
    const presets = this._getPresets(!!game.combat);

    if (this.selectedDuration === 'custom') {
      if (this.customUnit === 'rounds') {
        if (!game.combat) return null;
        return {
          type: TIMED_OVERRIDE_TYPES.ROUNDS,
          rounds: this.customValue,
          expiresOnTurn: this.turnActorId
            ? {
                actorId: this.turnActorId,
                timing: this.turnTiming,
              }
            : null,
        };
      } else {
        return {
          type: TIMED_OVERRIDE_TYPES.REALTIME,
          minutes: this.customValue,
        };
      }
    }

    const preset = presets.find((p) => p.key === this.selectedDuration);

    if (preset.type === TIMED_OVERRIDE_TYPES.ROUNDS) {
      if (!game.combat) return null;
      return {
        type: TIMED_OVERRIDE_TYPES.ROUNDS,
        rounds: preset.value,
        expiresOnTurn: this.turnActorId
          ? {
              actorId: this.turnActorId,
              timing: this.turnTiming,
            }
          : null,
      };
    }

    if (preset.type === TIMED_OVERRIDE_TYPES.REALTIME) {
      return {
        type: TIMED_OVERRIDE_TYPES.REALTIME,
        minutes: preset.value,
      };
    }
  }

  static async show(options = {}) {
    const dialog = new TimerDurationDialog(options);
    dialog.render(true);
    return dialog;
  }
}

export default TimerDurationDialog;
