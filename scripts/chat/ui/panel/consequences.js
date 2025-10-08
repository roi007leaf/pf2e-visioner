export function buildConsequencesPanel() {
  const label = 'Open Attack Consequences';
  const tooltip =
    'Preview and apply visibility changes after attack from hidden/undetected attacker';
  const title = 'Attack Consequences';
  const icon = 'fas fa-crosshairs';
  const actionName = 'open-consequences-results';
  const buttonClass = 'visioner-btn-consequences';
  const panelClass = 'consequences-panel';

  let actionButtonsHtml = '';
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
              data-action="apply-now-consequences"
              data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.APPLY_WITHOUT_DIALOG')}">
        <i class="fas fa-check-double"></i> Apply Changes
      </button>`;
  }

  return { title, icon, panelClass, actionButtonsHtml };
}
