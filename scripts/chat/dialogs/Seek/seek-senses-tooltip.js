export function setupSeekSensesButtonTooltips(app, content) {
  const sensesButtons = content.querySelectorAll('.senses-button[data-tooltip-html]');

  sensesButtons.forEach((button) => {
    // Prevent built-in text tooltip from showing the raw id.
    button.setAttribute('data-tooltip', '');
  });

  if (content.dataset.seekSensesTooltipDelegated === 'true') return;
  content.dataset.seekSensesTooltipDelegated = 'true';

  content.addEventListener('mouseover', (event) => {
    const button = resolveSensesButton(content, event.target);
    if (!button || button.contains(event.relatedTarget)) return;
    showResolvedSensesTooltip(app, content, button);
  });
  content.addEventListener('mouseout', (event) => {
    const button = resolveSensesButton(content, event.target);
    if (!button || button.contains(event.relatedTarget)) return;
    hideSeekSensesTooltip(app);
  });
  content.addEventListener('focusin', (event) => {
    const button = resolveSensesButton(content, event.target);
    if (button) showResolvedSensesTooltip(app, content, button);
  });
  content.addEventListener('focusout', (event) => {
    if (resolveSensesButton(content, event.target)) hideSeekSensesTooltip(app);
  });
}

function resolveSensesButton(content, target) {
  const button = target?.closest?.('.senses-button[data-tooltip-html]');
  return button && content.contains(button) ? button : null;
}

function showResolvedSensesTooltip(app, content, button) {
  const tooltipId = button.getAttribute('data-tooltip-html');
  const tooltipContent = tooltipId ? content.querySelector(`#${tooltipId}`) : null;
  if (tooltipContent) showSeekSensesTooltip(app, button, tooltipContent);
}

export function showSeekSensesTooltip(app, element, tooltipContent) {
  hideSeekSensesTooltip(app);

  const tooltip = document.createElement('div');
  tooltip.className = 'senses-tooltip-content';
  tooltip.innerHTML = tooltipContent.innerHTML;
  tooltip.style.position = 'absolute';
  tooltip.style.zIndex = '10000';
  tooltip.style.pointerEvents = 'none';
  tooltip.style.opacity = '0';
  tooltip.style.transition = 'opacity 0.2s ease';

  document.body.appendChild(tooltip);

  const rect = element.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();

  let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
  let top = rect.bottom + 8;

  if (left < 8) left = 8;
  if (left + tooltipRect.width > window.innerWidth - 8) {
    left = window.innerWidth - tooltipRect.width - 8;
  }
  if (top + tooltipRect.height > window.innerHeight - 8) {
    top = rect.top - tooltipRect.height - 8;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;

  const reveal = () => {
    tooltip.style.opacity = '1';
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(reveal);
  else reveal();

  app._currentTooltip = tooltip;
}

export function hideSeekSensesTooltip(app) {
  const tooltip = app?._currentTooltip;
  if (!tooltip) return;

  tooltip.style.opacity = '0';
  app._currentTooltip = null;

  setTimeout(() => {
    tooltip.parentNode?.removeChild(tooltip);
  }, 200);
}
