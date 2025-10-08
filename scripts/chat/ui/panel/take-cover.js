export function buildTakeCoverPanel() {
  const label = 'Open Take Cover Results';
  const tooltip = 'Preview and apply Take Cover changes';
  const title = 'Take Cover';
  const icon = 'fas fa-shield-alt';
  const actionName = 'open-take-cover-results';
  const buttonClass = 'visioner-btn-take-cover';
  const panelClass = 'take-cover-panel';

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
              data-action="apply-now-take-cover"
              data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.APPLY_COVER_CHANGES_WITHOUT_DIALOG')}">
        <i class="fas fa-check-double"></i> Apply Changes
      </button>`;
  }

  return { title, icon, panelClass, actionButtonsHtml };
}
