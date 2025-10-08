export function buildSeekPanel(actionData, message) {
  const label = game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.OPEN_RESULTS');
  const tooltip = game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.OPEN_RESULTS_TOOLTIP');
  const title = 'Seek Results';
  const icon = 'fas fa-search';
  const actionName = 'open-seek-results';
  const buttonClass = 'visioner-btn-seek';
  const panelClass = 'seek-panel';

  const isSeekWithTemplateOption = game.settings.get('pf2e-visioner', 'seekUseTemplate');
  const msgForPanel = message || game.messages.get(actionData.messageId);
  const pendingSeek = msgForPanel?.flags?.['pf2e-visioner']?.seekTemplate;
  const hasPendingTemplateFromPlayer = !!pendingSeek && game.user.isGM;
  const pendingHasTargets = !!pendingSeek?.hasTargets;
  const isFromPlayer = game.user.isGM && !!msgForPanel?.author && msgForPanel.author.isGM === false;

  const hasExistingTemplate =
    isSeekWithTemplateOption &&
    !!canvas?.scene?.templates?.find?.((t) => {
      const f = t?.flags?.['pf2e-visioner'];
      return (
        f?.seekPreviewManual &&
        f?.messageId === actionData.messageId &&
        f?.actorTokenId === actionData.actor.id &&
        t?.user?.id === game.userId
      );
    });

  let actionButtonsHtml = '';
  if (hasPendingTemplateFromPlayer) {
    if (pendingHasTargets) {
      actionButtonsHtml = `
        <button type="button" 
                class="visioner-btn ${buttonClass}" 
                data-action="open-seek-results"
                data-tooltip="${tooltip}">
          <i class="${icon}"></i> ${label}
        </button>
        <button type="button"
                class="visioner-btn ${buttonClass} apply-now"
                data-action="apply-now-seek"
                data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.APPLY_WITHOUT_DIALOG')}">
          <i class="fas fa-check-double"></i> Apply Changes
        </button>`;
    } else {
      actionButtonsHtml = '';
    }
  } else if (isSeekWithTemplateOption) {
    actionButtonsHtml = `
      <button type="button"
              class="visioner-btn ${buttonClass} setup-template"
              data-action="${hasExistingTemplate ? 'remove-seek-template' : 'setup-seek-template'}"
              data-tooltip="${game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.SETUP_TEMPLATE_TOOLTIP')}">
        <i class="fas fa-bullseye"></i> ${
          hasExistingTemplate
            ? game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.REMOVE_TEMPLATE')
            : game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.SETUP_TEMPLATE')
        }
      </button>`;
    if (hasExistingTemplate && game.user.isGM) {
      actionButtonsHtml += `
        <button type="button"
                class="visioner-btn ${buttonClass} apply-now"
                data-action="apply-now-seek"
                data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.APPLY_WITHOUT_DIALOG')}">
          <i class="fas fa-check-double"></i> Apply Changes
        </button>`;
    }
    if (game.user.isGM && ((hasPendingTemplateFromPlayer && pendingHasTargets) || isFromPlayer)) {
      actionButtonsHtml =
        `
        <button type="button" 
                class="visioner-btn ${buttonClass}" 
                data-action="open-seek-results"
                data-tooltip="${tooltip}">
          <i class="${icon}"></i> ${label}
        </button>` + actionButtonsHtml;
    }
  } else if (game.user.isGM) {
    actionButtonsHtml = `
      <button type="button" 
              class="visioner-btn ${buttonClass}" 
              data-action="${actionName}"
              data-tooltip="${tooltip}">
        <i class="${icon}"></i> ${label}
      </button>
      <button type="button"
              class="visioner-btn ${buttonClass} apply-now"
              data-action="apply-now-seek"
              data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.APPLY_WITHOUT_DIALOG')}">
        <i class="fas fa-check-double"></i> Apply Changes
      </button>`;
  }

  return { title, icon, panelClass, actionButtonsHtml };
}
