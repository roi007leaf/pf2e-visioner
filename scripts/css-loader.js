/**
 * Lazy CSS Loader
 * Loads module stylesheets on-demand instead of all at init.
 * Reduces style recalculation overhead when Visioner UI isn't active.
 */

import { MODULE_ID } from './constants.js';

const _loaded = new Map(); // path → <link> element

/**
 * Load one or more module CSS files on demand.
 * Safe to call multiple times — already-loaded files are skipped.
 * @param {...string} paths - CSS file paths relative to the module root
 */
export function loadCSS(...paths) {
  for (const path of paths) {
    if (_loaded.has(path)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `modules/${MODULE_ID}/${path}`;
    document.head.appendChild(link);
    _loaded.set(path, link);
  }
}

/**
 * Unload previously loaded CSS files.
 * Removes the <link> elements from <head> so the browser stops
 * evaluating their rules during style recalculation.
 * @param {...string} paths - CSS file paths relative to the module root
 */
export function unloadCSS(...paths) {
  for (const path of paths) {
    const link = _loaded.get(path);
    if (link) {
      link.remove();
      _loaded.delete(path);
    }
  }
}

// CSS path groups

const TOKEN_MANAGER_CSS = [
  'styles/token-manager.css',
  'styles/token-manager-ui.css',
  'styles/token-effects.css',
];

const SHARED_UI_CSS = [
  'styles/responsive.css',
  'styles/tooltips.css',
  'styles/enhanced-position-tracking.css',
  'styles/templates-inline.css',
];

const DIALOG_CSS = [
  'styles/dialog-layout.css',
];

// Grouped loaders

export function loadTokenManagerCSS() {
  loadCSS(...TOKEN_MANAGER_CSS);
}

export function loadSharedUICSS() {
  loadCSS(...SHARED_UI_CSS);
}

export function loadDialogCSS() {
  loadCSS(...DIALOG_CSS);
}

export function unloadAllUICSS() {
  unloadCSS(...TOKEN_MANAGER_CSS, ...SHARED_UI_CSS, ...DIALOG_CSS);
}
