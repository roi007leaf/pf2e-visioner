export function buildPointOutPanel() {
  const label = 'Open Point Out Results';
  const tooltip = 'Preview and apply Point Out visibility changes';
  const title = 'Point Out Results';
  const icon = 'fas fa-hand-point-right';
  const actionName = 'open-point-out-results';
  const buttonClass = 'visioner-btn-point-out';
  const panelClass = 'point-out-panel';

  // Simplified: GM always gets buttons

  let actionButtonsHtml = '';

  // Always show buttons for GM - simplify the logic
  if (game.user.isGM) {
    actionButtonsHtml = `
      <button type="button" 
              class="visioner-btn ${buttonClass}" 
              data-action="${actionName}"
              data-tooltip="${tooltip}">
        <i class="${icon}"></i> ${label}
      </button>
      <button type="button"
              class="visioner-btn ${buttonClass} apply-now"
              data-action="apply-now-point-out"
              data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.APPLY_WITHOUT_DIALOG')}">
        <i class="fas fa-check-double"></i> Apply Changes
      </button>`;
  }

  return { title, icon, panelClass, actionButtonsHtml };
}
