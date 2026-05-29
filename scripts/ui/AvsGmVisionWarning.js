import { MODULE_ID } from '../constants.js';
import {
    clearGmVisionBypassCache,
    isGmVisionModeActive,
} from '../services/gm-vision-bypass.js';
import { getSystemId } from '../system-adapter.js';

const ELEMENT_ID = 'pf2e-visioner-avs-gm-vision-warning';
const STYLE_ID = 'pf2e-visioner-avs-gm-vision-warning-styles';

export { isGmVisionModeActive };

function suppressionEnabled() {
    return !!game.settings?.get?.(MODULE_ID, 'suppressAvsGmVisionWarning');
}

function warningState() {
    globalThis.pf2eVisioner = globalThis.pf2eVisioner || {};
    globalThis.pf2eVisioner._avsGmVisionWarning = globalThis.pf2eVisioner._avsGmVisionWarning || {
        registered: false,
        dismissed: false,
    };
    return globalThis.pf2eVisioner._avsGmVisionWarning;
}

function normalizeSettingId(setting) {
    if (!setting) return '';
    if (typeof setting === 'string') return setting;
    const fromKey = typeof setting.key === 'string' ? setting.key : '';
    const fromId = typeof setting.id === 'string' ? setting.id : '';
    const fromName = typeof setting.name === 'string' ? setting.name : '';
    const fromNsKey =
        typeof setting.namespace === 'string' && typeof setting.key === 'string'
            ? `${setting.namespace}.${setting.key}`
            : '';
    return fromNsKey || fromKey || fromId || fromName;
}

function isSetting(setting, namespace, key) {
    const id = normalizeSettingId(setting);
    if (id === `${namespace}.${key}`) return true;
    if (typeof setting === 'object' && setting) {
        if (setting.namespace === namespace && setting.key === key) return true;
        if (setting.namespace === namespace && setting.name === key) return true;
    }
    return false;
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
    #${ELEMENT_ID} {
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10050;
      max-width: min(720px, calc(100vw - 24px));
      padding: 8px 12px;
            padding-right: 30px;
      border-radius: 8px;
      border: 1px solid rgba(255, 192, 0, 0.75);
      background: rgba(30, 20, 0, 0.90);
      color: var(--color-text-light-0, #f0f0f0);
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(2px);
      font-size: 12px;
      line-height: 1.35;
      display: none;
            box-sizing: border-box;
    }

    #${ELEMENT_ID}.visible {
      display: block;
    }

    #${ELEMENT_ID} .title {
      font-weight: 700;
      margin: 0 0 2px 0;
    }

    #${ELEMENT_ID} .body {
      margin: 0;
      opacity: 0.95;
    }

        #${ELEMENT_ID} .options {
            margin-top: 6px;
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            align-items: center;
        }

        #${ELEMENT_ID} label.dont-show {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            opacity: 0.9;
            cursor: pointer;
            user-select: none;
        }

        #${ELEMENT_ID} label.dont-show input {
            margin: 0;
        }

        #${ELEMENT_ID} .close {
            position: absolute;
            top: 4px;
            right: 6px;
            width: 20px;
            height: 20px;
            padding: 0;
            margin: 0;
            border: 0;
            border-radius: 4px;
            background: transparent;
            color: inherit;
            opacity: 0.85;
            cursor: pointer;
            font-size: 16px;
            line-height: 20px;
            text-align: center;
        }

        #${ELEMENT_ID} .close:hover {
            opacity: 1;
        }

        #${ELEMENT_ID} .close:focus-visible {
            outline: 2px solid rgba(255, 192, 0, 0.85);
            outline-offset: 1px;
        }
  `;
    document.head.appendChild(style);
}

function ensureElement() {
    const existing = document.getElementById(ELEMENT_ID);
    if (existing) return existing;

    ensureStyles();

    const el = document.createElement('div');
    el.id = ELEMENT_ID;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');

    const close = document.createElement('button');
    close.className = 'close';
    close.type = 'button';
    close.textContent = '×';
    const closeLabel = game.i18n.localize('PF2E_VISIONER.AVS_GM_VISION_WARNING.CLOSE');
    close.setAttribute('aria-label', closeLabel);
    close.setAttribute('title', closeLabel);
    close.addEventListener('click', () => {
        warningState().dismissed = true;
        updateAvsGmVisionWarning();
    });

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = game.i18n.localize('PF2E_VISIONER.AVS_GM_VISION_WARNING.TITLE');

    const body = document.createElement('div');
    body.className = 'body';
    body.textContent = game.i18n.localize('PF2E_VISIONER.AVS_GM_VISION_WARNING.BODY');

    const options = document.createElement('div');
    options.className = 'options';

    const dontShow = document.createElement('label');
    dontShow.className = 'dont-show';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'dont-show-again';
    checkbox.checked = suppressionEnabled();
    checkbox.addEventListener('change', () => {
        const next = checkbox.checked;
        try {
            const maybePromise = game.settings?.set?.(MODULE_ID, 'suppressAvsGmVisionWarning', next);
            if (maybePromise && typeof maybePromise.then === 'function') {
                maybePromise.then(() => updateAvsGmVisionWarning());
            } else {
                updateAvsGmVisionWarning();
            }
        } catch {
            updateAvsGmVisionWarning();
        }
    });

    const labelText = document.createElement('span');
    labelText.textContent = game.i18n.localize('PF2E_VISIONER.AVS_GM_VISION_WARNING.DONT_SHOW_AGAIN');

    dontShow.appendChild(checkbox);
    dontShow.appendChild(labelText);
    options.appendChild(dontShow);

    el.appendChild(close);
    el.appendChild(title);
    el.appendChild(body);
    el.appendChild(options);

    document.body.appendChild(el);
    return el;
}

export function updateAvsGmVisionWarning() {
    if (!game.user?.isGM) return;

    clearGmVisionBypassCache();
    const state = warningState();
    const active = isGmVisionModeActive();
    if (!active) state.dismissed = false;

    const el = ensureElement();
    const suppressed = suppressionEnabled();
    const checkbox = el.querySelector('input[name="dont-show-again"]');
    if (checkbox) checkbox.checked = suppressed;

    const visible = active && !state.dismissed && !suppressed;

    if (visible) el.classList.add('visible');
    else el.classList.remove('visible');
}

export function registerAvsGmVisionWarning() {
    if (!game.user?.isGM) return;

    const state = warningState();
    if (state.registered) return;
    state.registered = true;

    updateAvsGmVisionWarning();

    Hooks.on('controlToken', () => updateAvsGmVisionWarning());
    Hooks.on('renderSceneControls', () => updateAvsGmVisionWarning());
    Hooks.on('updateScene', () => updateAvsGmVisionWarning());
    Hooks.on('canvasReady', () => updateAvsGmVisionWarning());
    Hooks.on('updateSetting', (setting) => {
        if (isSetting(setting, getSystemId(), 'gmVision')) return updateAvsGmVisionWarning();
        if (isSetting(setting, MODULE_ID, 'autoVisibilityEnabled')) return updateAvsGmVisionWarning();
        if (isSetting(setting, MODULE_ID, 'suppressAvsGmVisionWarning')) return updateAvsGmVisionWarning();
    });

    try {
        const maybe = foundry?.utils?.debounce?.(() => updateAvsGmVisionWarning(), 50);
        window.addEventListener('resize', typeof maybe === 'function' ? maybe : () => updateAvsGmVisionWarning(), {
            passive: true,
        });
    } catch {
        window.addEventListener('resize', () => updateAvsGmVisionWarning(), { passive: true });
    }
}
