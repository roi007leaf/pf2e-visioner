import { MODULE_ID } from '../constants.js';

const PF2E_HUD_ROOT_SELECTOR = [
  '#pf2e-hud',
  '#pf2e-hud-token',
  '#pf2e-hud-persistent',
  '#pf2e-hud-dice',
  '#pf2e-hud-tracker',
  '.pf2e-hud-element',
].join(',');

let registered = false;

function isPf2eHudActive() {
  return !!game?.modules?.get?.('pf2e-hud')?.active;
}

function isVisionerAutomationEnabled() {
  return !!game?.settings?.get?.(MODULE_ID, 'autoVisibilityEnabled');
}

function tokenFromActor(actor) {
  if (!actor) return null;
  const token = actor.token?.object || actor.token || null;
  if (token?.actor) return token;
  const active = actor.getActiveTokens?.(true, true) || actor.getActiveTokens?.(true) || [];
  return active[0] || null;
}

function getApplicationCandidates() {
  const candidates = [];
  candidates.push(...Object.values(ui?.windows || {}));

  const instances = foundry?.applications?.instances;
  if (instances instanceof Map) candidates.push(...instances.values());
  else if (instances) candidates.push(...Object.values(instances));

  return candidates.filter(Boolean);
}

export function isPf2eHudTakeCoverElement(element) {
  const action = element?.closest?.('[data-action="take-cover"]');
  if (!action) return false;
  return !!action.closest?.(PF2E_HUD_ROOT_SELECTOR);
}

export function resolvePf2eHudActorToken(element) {
  const action = element?.closest?.('[data-action="take-cover"]');
  if (!action) return null;
  const hudRoot = action.closest?.(PF2E_HUD_ROOT_SELECTOR);

  for (const app of getApplicationCandidates()) {
    try {
      const appElement = app.element instanceof HTMLElement ? app.element : app.element?.[0];
      if (hudRoot && appElement?.contains?.(hudRoot)) {
        const token = app.token || tokenFromActor(app.actor);
        if (token?.actor) return token;
      }
    } catch {
      // Keep searching other application instances.
    }
  }

  const controlled = canvas?.tokens?.controlled || [];
  if (controlled.length === 1 && controlled[0]?.actor) return controlled[0];

  const combatToken = game?.combat?.combatant?.token?.object || game?.combat?.combatant?.token;
  if (combatToken?.actor) return combatToken;

  return null;
}

export async function openVisionerTakeCoverPreview(actorToken) {
  const { TakeCoverActionHandler } = await import('../chat/services/actions/TakeCoverAction.js');
  const { TakeCoverPreviewDialog } = await import('../chat/dialogs/TakeCoverPreviewDialog.js');
  const handler = new TakeCoverActionHandler();
  const actionData = {
    actionType: 'take-cover',
    actor: actorToken,
    actorToken,
    source: 'pf2e-hud',
    ignoreAllies: game?.settings?.get?.(MODULE_ID, 'ignoreAllies') ?? false,
  };
  const subjects = await handler.discoverSubjects({ ...actionData, ignoreAllies: false });
  const outcomes = await Promise.all(subjects.map((subject) => handler.analyzeOutcome(actionData, subject)));
  const changes = outcomes.filter((outcome) => outcome?.changed);
  new TakeCoverPreviewDialog(actorToken, outcomes, changes, actionData).render(true);
}

export async function handlePf2eHudTakeCoverClick(event, options = {}) {
  const target = options.target || event?.target;
  if (!isPf2eHudTakeCoverElement(target)) return false;
  if (!isPf2eHudActive() || !isVisionerAutomationEnabled()) return false;

  const actorToken = options.resolveActorToken?.(target) || resolvePf2eHudActorToken(target);
  if (!actorToken?.actor) return false;

  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();

  const preview = options.preview || openVisionerTakeCoverPreview;
  await preview(actorToken);
  return true;
}

export function registerPf2eHudTakeCoverIntegration(root = document) {
  if (registered || !root?.addEventListener) return;
  registered = true;
  root.addEventListener(
    'click',
    (event) => {
      void handlePf2eHudTakeCoverClick(event).catch((error) => {
        console.error('PF2E Visioner | Failed to handle PF2E HUD Take Cover:', error);
      });
    },
    true,
  );
}

