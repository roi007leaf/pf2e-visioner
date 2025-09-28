import { FeatsHandler } from '../../services/feats-handler.js';

function buildSneakDistanceChipHTML(tokenOrActor) {
  try {
    const actor = tokenOrActor?.actor || tokenOrActor?.document?.actor || tokenOrActor;
    const baseFromFlag = actor?.getFlag?.('pf2e-visioner', 'sneak-original-walk-speed');
    const baseSpeed = Number(baseFromFlag ?? actor?.system?.movement?.speeds?.land?.value ?? 0) || 0;
    if (!actor || baseSpeed <= 0) return '';

    const multiplier = Number(FeatsHandler.getSneakSpeedMultiplier(actor) ?? 0.5);
    const bonusFeet = Number(FeatsHandler.getSneakDistanceBonusFeet(actor) ?? 0);

    const raw = Math.floor(baseSpeed * multiplier) + bonusFeet;
    const capped = Math.min(baseSpeed, raw);
    const maxFeet = Math.floor(capped / 5) * 5;

    // Collect feat names for tooltip clarity
    const hasSwiftSneak = FeatsHandler.hasFeat(actor, 'swift-sneak');
    const hasLegendarySneak = FeatsHandler.hasFeat(actor, 'legendary-sneak');
    const hasVeryVerySneaky = FeatsHandler.hasFeat(actor, 'very-very-sneaky');
    const hasVerySneaky = FeatsHandler.hasFeat(actor, 'very-sneaky');
    const hasSneaky = FeatsHandler.hasFeat(actor, 'sneaky');

    const fullSpeedFeats = [];
    if (hasSwiftSneak) fullSpeedFeats.push('Swift Sneak');
    if (hasLegendarySneak) fullSpeedFeats.push('Legendary Sneak');
    if (hasVeryVerySneaky) fullSpeedFeats.push('Very, Very Sneaky');

    const tooltipLines = [
      `Base Speed: ${baseSpeed} ft`,
    ];
    if (Number.isFinite(multiplier)) {
      if (multiplier === 1) {
        tooltipLines.push(`Sneak multiplier: ×1.0${fullSpeedFeats.length ? ` (feats: ${fullSpeedFeats.join(', ')})` : ''}`);
      } else {
        tooltipLines.push(`Sneak multiplier: ×${multiplier}`);
      }
    }
    if (bonusFeet > 0) {
      tooltipLines.push(`Feat bonus: +${bonusFeet} ft${hasVerySneaky ? ' (Very Sneaky)' : ''}${hasSneaky ? ' (Sneaky)' : ''}`);
    }
    if (raw > baseSpeed) {
      tooltipLines.push(`Capped at base Speed (${baseSpeed} ft)`);
    }
    tooltipLines.push(`Est. max this action: ${maxFeet} ft`);

    const tooltip = tooltipLines.join('\n');

    return `
      <span class="sneak-max-distance-chip" 
            data-tooltip="${tooltip}"
            style="padding:2px 8px; border-radius:12px; background: var(--color-border-light-2, #ddd); font-size: 11px; line-height: 18px; display: inline-flex; align-items: center; gap: 6px;">
        <i class="fas fa-ruler-horizontal" aria-hidden="true"></i>
        <span>Max Sneak Distance: <strong>${maxFeet} ft</strong></span>
      </span>`;
  } catch (e) {
    console.error('PF2E Visioner | Failed to build Sneak distance chip:', e);
    return '';
  }
}

export function buildSneakPanel(actionData = {}, message = null) {
  const panelClass = 'sneak-panel';

  let actionButtonsHtml = '';
  if (game.user.isGM) {
    // Check if sneak has been started by looking for sneakStartStates flag
    const chatMessage = message || actionData?.message || game.messages.get(actionData?.messageId);
    const hasStartedSneak = chatMessage?.flags?.['pf2e-visioner']?.sneakStartStates;

    if (hasStartedSneak) {
      // Show "Open Results" if sneak has been started
      const label = 'Open Sneak Results';
      const tooltip = 'Preview and apply Sneak visibility changes';
      const icon = 'fas fa-user-ninja';
      const actionName = 'open-sneak-results';
      const buttonClass = 'visioner-btn-sneak';

      actionButtonsHtml = `
        <button type="button" 
                class="visioner-btn ${buttonClass}" 
                data-action="${actionName}"
                data-tooltip="${tooltip}">
          <i class="${icon}"></i> ${label}
        </button>
        <button type="button"
                class="visioner-btn ${buttonClass} apply-now"
                data-action="apply-now-sneak"
                data-tooltip="Apply all calculated changes without opening the dialog">
          <i class="fas fa-check-double"></i> Apply Changes
        </button>`;
    } else {
      // Show "Start Sneak" if sneak hasn't been started yet
      const buttonClass = 'visioner-btn-sneak';
      const distanceChip = buildSneakDistanceChipHTML(actionData?.actor);

      actionButtonsHtml = `
        <div class="visioner-row-with-chip" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <button type="button" 
                  class="visioner-btn ${buttonClass}" 
                  data-action="start-sneak"
                  data-tooltip="Start sneaking: capture current visibility and cover states"
                  style="flex:1 1 auto; white-space: normal;">
            <i class="fas fa-mask"></i> Start Sneak
          </button>
          ${distanceChip}
        </div>`;
    }
  } else {
    // Players: Only allow "Start Sneak"; do not show results/apply buttons
    const chatMessage = message || actionData?.message || game.messages.get(actionData?.messageId);
    const hasStartedSneak = chatMessage?.flags?.['pf2e-visioner']?.sneakStartStates;
    const buttonClass = 'visioner-btn-sneak';
    const disabledAttr = hasStartedSneak ? 'disabled' : '';
    const buttonText = hasStartedSneak ? 'Let the GM know when your Sneak movement is complete' : 'Start Sneak';
    const distanceChip = buildSneakDistanceChipHTML(actionData?.actor);

    // If sneak has started, stack the chip below the button to avoid squeezing text
    const containerStyle = hasStartedSneak
      ? 'display:flex; flex-direction:column; align-items:stretch; gap:8px;'
      : 'display:flex; align-items:center; justify-content:space-between; gap:8px;';

    actionButtonsHtml = `
      <div class="visioner-row-with-chip" style="${containerStyle}">
        <button type="button" 
                class="visioner-btn ${buttonClass}"
                data-action="start-sneak"
                ${disabledAttr}
                style="flex:1 1 auto; white-space: normal;">
          <i class="fas fa-mask"></i> ${buttonText}
        </button>
        ${distanceChip}
      </div>`;
  }

  const hasStartedSneak = (message || actionData?.message || game.messages.get(actionData?.messageId))?.flags?.['pf2e-visioner']?.sneakStartStates;
  const title = hasStartedSneak ? 'Sneak Results' : 'Sneak Action';
  const icon = hasStartedSneak ? 'fas fa-user-ninja' : 'fas fa-mask';

  return { title, icon, panelClass, actionButtonsHtml };
}
