import { MODULE_ID } from '../constants.js';
import { updateCanvasPerception } from '../helpers/perception-refresh.js';
import { requestFullVisibilityScopeRecalc } from './runtime-state.js';
import { showNotification } from '../utils.js';
import { isPointInCone } from './Peek/peek-geometry.js';
import { peekRegistry } from './Peek/PeekRegistry.js';
import { peekGmOverlay } from './Peek/peek-gm-overlay.js';

// Avoid name collision with Foundry/socket.io global `socket`
// No module-scoped socket reference required; use the service wrapper

class SocketService {
  constructor() {
    this._socket = null;
  }
  register() {
    if (typeof socketlib === 'undefined') {
      showNotification('PF2E_VISIONER.NOTIFICATIONS.NO_SOCKETLIB_INSTALLED', 'warn');
      return null;
    }
    this._socket = socketlib.registerModule(MODULE_ID);
    this._socket.register(REFRESH_CHANNEL, refreshLocalPerception);
    this._socket.register(POINT_OUT_CHANNEL, pointOutHandler);
    this._socket.register(SEEK_TEMPLATE_CHANNEL, seekTemplateHandler);
    this._socket.register(POINTOUT_REQUEST_CHANNEL, pointOutRequestHandler);
    this._socket.register(TAKE_COVER_REQUEST_CHANNEL, takeCoverRequestHandler);
    this._socket.register(WALL_VISUALS_CHANNEL, updateWallVisualsHandler);
    this._socket.register(PEEK_UPDATE_CHANNEL, peekUpdateHandler);
    this._socket.register(PEEK_END_CHANNEL, peekEndHandler);
    this._socket.register(PEEK_APPROVAL_REQUEST_CHANNEL, doorPeekApprovalRequestHandler);
    this._socket.register(PEEK_APPROVAL_RESPONSE_CHANNEL, doorPeekApprovalResponseHandler);
    this._socket.register(PEEK_REVEAL_REFRESH_CHANNEL, peekRevealRefreshHandler);
    this._socket.register(
      STEALTH_INITIATIVE_COVER_REQUEST_CHANNEL,
      stealthInitiativeCoverRequestHandler,
    );
    this._socket.register(
      STEALTH_INITIATIVE_COVER_RESPONSE_CHANNEL,
      stealthInitiativeCoverResponseHandler,
    );
    startPeekStalePruner();
    if (typeof Hooks !== 'undefined') Hooks.on('canvasTearDown', () => peekGmOverlay.clearAll());
    return this._socket;
  }
  get socket() {
    return this._socket;
  }
  executeForEveryone(channel, ...args) {
    this._socket?.executeForEveryone?.(channel, ...args);
  }
  executeAsGM(channel, ...args) {
    this._socket?.executeAsGM?.(channel, ...args);
  }
}

const _socketService = new SocketService();

// Export the socket service for use by other modules
export { _socketService };

export const REFRESH_CHANNEL = 'RefreshPerception';
const POINT_OUT_CHANNEL = 'PointOut';
const SEEK_TEMPLATE_CHANNEL = 'SeekTemplate';
const POINTOUT_REQUEST_CHANNEL = 'PointOutRequest';
const TAKE_COVER_REQUEST_CHANNEL = 'TakeCoverRequest';
const WALL_VISUALS_CHANNEL = 'UpdateWallVisuals';
const PEEK_UPDATE_CHANNEL = 'PeekUpdate';
const PEEK_END_CHANNEL = 'PeekEnd';
const PEEK_APPROVAL_REQUEST_CHANNEL = 'DoorPeekApprovalRequest';
const PEEK_APPROVAL_RESPONSE_CHANNEL = 'DoorPeekApprovalResponse';
const PEEK_REVEAL_REFRESH_CHANNEL = 'PeekRevealRefresh';
const STEALTH_INITIATIVE_COVER_REQUEST_CHANNEL = 'StealthInitiativeCoverRequest';
const STEALTH_INITIATIVE_COVER_RESPONSE_CHANNEL = 'StealthInitiativeCoverResponse';

export function registerSocket() {
  _socketService.register();
}

/*
 * Refresh perception on the local canvas
 */
export function refreshLocalPerception() {
  updateCanvasPerception({
    refreshVision: true,
    refreshSounds: true,
    refreshOcclusion: true,
  });
  // Removed redundant updateWallVisuals call - wall visual updates are properly handled
  // by TokenEventHandler._handleWallFlagChanges when wall flags actually change
}

/*
 * Handle wall visual updates for a specific observer token
 * This ensures per-player visibility is applied on each client
 */
async function updateWallVisualsHandler(observerId) {
  try {
    const { updateWallVisuals } = await import('./visual-effects.js');
    await updateWallVisuals(observerId);
  } catch (error) {
    console.warn(`[${MODULE_ID}] Error in wall visuals handler:`, error);
  }
}

/*
 * Forces a refresh on all clients including this one
 * (will call refreshLocalPerception on local client)
 */
// Debouncing for refreshEveryonesPerception to prevent spam
let _perceptionRefreshTimeout = null;

export function refreshEveryonesPerception() {
  // Debounce to prevent excessive calls that cause jittering and slider resets
  if (_perceptionRefreshTimeout) {
    clearTimeout(_perceptionRefreshTimeout);
  }

  _perceptionRefreshTimeout = setTimeout(() => {
    try {
      if (_socketService.socket) _socketService.executeForEveryone(REFRESH_CHANNEL);

      // Removed redundant updateWallVisuals call - wall visual updates are properly handled
      // by TokenEventHandler._handleWallFlagChanges when wall flags actually change
    } catch { }

    _perceptionRefreshTimeout = null;
  }, 10); // 10ms debounce to prevent spam
}

/*
 * Send a request for Point Out resolution to the GM
 */
export function requestGMHandlePointOut(...args) {
  if (_socketService.socket) _socketService.executeAsGM(POINT_OUT_CHANNEL, ...args);
}

/*
 * Update wall visuals for all clients with per-player visibility
 */
export function updateWallVisualsForEveryone(observerId) {
  if (_socketService.socket) {
    _socketService.executeForEveryone(WALL_VISUALS_CHANNEL, observerId);
  }
}

/*
 * Runs on GM machine with data sent from client
 */
function pointOutHandler() {
  //do what you want to do
}

/**
 * Ask the GM to open Point Out results for a player-initiated action
 * @param {string} pointerTokenId
 * @param {string} messageId
 */
export function requestGMOpenPointOut(pointerTokenId, targetTokenId, messageId) {
  if (!_socketService.socket) return;
  _socketService.executeAsGM(POINTOUT_REQUEST_CHANNEL, {
    pointerTokenId,
    targetTokenId,
    messageId,
    userId: game.userId,
  });
}

export function requestGMOpenTakeCover(actorTokenId, messageId = null) {
  if (!_socketService.socket || !actorTokenId) return false;
  _socketService.executeAsGM(TAKE_COVER_REQUEST_CHANNEL, {
    actorTokenId,
    messageId,
    userId: game.userId,
  });
  return true;
}

export function requestGMDoorPeekApproval(payload) {
  if (!_socketService.socket?.executeAsGM || !payload?.requestId) return false;
  _socketService.executeAsGM(PEEK_APPROVAL_REQUEST_CHANNEL, payload);
  return true;
}

async function takeCoverRequestHandler({ actorTokenId, messageId = null, userId = null } = {}) {
  try {
    if (!game.user?.isGM) return;

    const actorToken = canvas.tokens?.get?.(actorTokenId);
    if (!actorToken?.actor) return;

    const { openVisionerTakeCoverPreview } = await import('../integrations/pf2e-hud-take-cover.js');
    await openVisionerTakeCoverPreview(actorToken, {
      source: 'player-request',
      messageId,
      requestedByUserId: userId,
    });
  } catch (error) {
    console.error(`[${MODULE_ID}] Failed to handle GM Take Cover preview from player:`, error);
  }
}

async function pointOutRequestHandler({ pointerTokenId, targetTokenId, messageId, userId }) {
  try {
    if (!game.user.isGM) return;
    const pointerToken = canvas.tokens.get(pointerTokenId);
    if (!pointerToken) return;
    // Resolve target token: prefer provided tokenId; otherwise, fall back to message PF2e flags
    let targetToken = targetTokenId ? canvas.tokens.get(targetTokenId) : null;
    if (!targetToken && messageId) {
      const msg = game.messages.get(messageId);
      const flg = msg?.flags?.pf2e?.target;
      if (flg?.token) targetToken = canvas.tokens.get(flg.token);
    }

    // Ping the target token's location so the table sees what was pointed out
    try {
      if (targetToken) {
        const point = targetToken.center || {
          x: targetToken.x + (targetToken.w ?? targetToken.width * canvas.grid.size) / 2,
          y: targetToken.y + (targetToken.h ?? targetToken.height * canvas.grid.size) / 2,
        };
        const playerUser = game.users?.get?.(userId);
        if (typeof canvas.ping === 'function') {
          canvas.ping(point, {
            color: playerUser?.color,
            name: playerUser?.name || 'Point Out',
          });
        } else if (canvas?.pings?.create) {
          canvas.pings.create({ ...point, user: playerUser });
        }
      }
    } catch (pingErr) {
      console.warn(`[${MODULE_ID}] Failed to ping pointed-out target:`, pingErr);
    }

    // Determine whether there are any allies that benefit from Point Out
    let hasTargets = false;
    try {
      if (targetToken) {
        const { getVisibilityBetween } = await import('../utils.js');
        const allies = (canvas?.tokens?.placeables || []).filter(
          (t) =>
            t &&
            t.actor &&
            t.actor?.type !== 'loot' &&
            t.document.disposition === pointerToken.document.disposition,
        );
        const cannotSee = allies.filter((ally) => {
          const vis = getVisibilityBetween(ally, targetToken);
          return vis === 'hidden' || vis === 'undetected';
        });
        hasTargets = cannotSee.length > 0;
      }
    } catch (calcErr) {
      console.warn(`[${MODULE_ID}] Failed to evaluate allies for player Point Out:`, calcErr);
    }

    // Persist pending Point Out info so GM can decide when to open results
    const msg = game.messages.get(messageId);
    if (msg) {
      // Best-effort: annotate PF2e target flags so downstream code has a standard fallback
      try {
        const currentPF2eTarget = msg?.flags?.pf2e?.target || {};
        const updatedPF2eTarget = { ...currentPF2eTarget };
        if (targetToken) {
          updatedPF2eTarget.token = targetToken.id;
          if (targetToken.actor?.id) updatedPF2eTarget.actor = targetToken.actor.id;
        }
        await msg.update({ ['flags.pf2e.target']: updatedPF2eTarget });
      } catch (e) {
        console.warn(`[${MODULE_ID}] Unable to update PF2e target flags for Point Out:`, e);
      }
      await msg.update({
        [`flags.${MODULE_ID}.pointOut`]: {
          pointerTokenId,
          targetTokenId: targetToken?.id ?? null,
          hasTargets,
          fromUserId: userId,
        },
      });
      try {
        await msg.render(true);
      } catch { }
    }

    // Update GM panel actions if already rendered
    try {
      const panel = document.querySelector(
        `.pf2e-visioner-automation-panel[data-message-id="${messageId}"]`,
      );
      if (panel) {
        const actions = panel.querySelector('.automation-actions');
        if (actions) {
          if (hasTargets) {
            actions.innerHTML = `
              <button type="button" 
                      class="visioner-btn visioner-btn-point-out" 
                      data-action="open-point-out-results"
                      data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.PREVIEW_POINT_OUT_CHANGES')}">
                <i class="fas fa-hand-point-right"></i> Open Point Out Results
              </button>
              <button type="button"
                      class="visioner-btn visioner-btn-point-out apply-now"
                      data-action="apply-now-point-out"
                      data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.APPLY_WITHOUT_DIALOG')}">
                <i class="fas fa-check-double"></i> Apply Changes
              </button>
            `;
          } else {
            try {
              panel.remove();
            } catch {
              actions.innerHTML = '';
            }
          }
        }
      }
    } catch (domError) {
      console.warn(
        `[${MODULE_ID}] Failed to update GM panel actions for pending Point Out:`,
        domError,
      );
    }
  } catch (e) {
    console.error(`[${MODULE_ID}] Failed to handle GM Point Out preview from player action:`, e);
  }
}

/**
 * Ask the GM to open Seek preview with a provided template center/radius for an actor token
 * @param {string} actorTokenId
 * @param {{x:number,y:number}} center
 * @param {number} radiusFeet
 * @param {string} messageId
 */
export function requestGMOpenSeekWithTemplate(
  actorTokenId,
  center,
  radiusFeet,
  messageId,
  rollTotal,
  dieResult,
  templateType = 'circle',
  levels = [],
) {
  if (!_socketService.socket) return;
  _socketService.executeAsGM(SEEK_TEMPLATE_CHANNEL, {
    actorTokenId,
    center,
    radiusFeet,
    messageId,
    rollTotal,
    dieResult,
    templateType,
    levels,
    userId: game.userId,
  });
}

async function seekTemplateHandler({
  actorTokenId,
  center,
  radiusFeet,
  messageId,
  rollTotal,
  dieResult,
  templateType = 'circle',
  levels = [],
  userId,
}) {
  try {
    if (!game.user.isGM) return; // Only GM handles
    const actorToken = canvas.tokens.get(actorTokenId);
    if (!actorToken) return;

    // Determine whether there are any valid targets in the provided template area
    let hasTargets = false;
    try {
      const all = canvas?.tokens?.placeables || [];

      // For Seek actions, include both tokens with actors AND walls from the walls collection
      const targets = all.filter((t) => {
        if (!t || t === actorToken) return false;

        // Include tokens with actors (creatures, hazards, etc.)
        if (t.actor) return true;

        // Include loot tokens (tokens without actors but with loot flags)
        const isLoot =
          t.document?.getFlag?.(MODULE_ID, 'isLoot') ||
          t.document?.getFlag?.(MODULE_ID, 'minPerceptionRank');

        return isLoot;
      });

      // Also check for walls in the walls collection
      const walls = canvas?.walls?.placeables || [];

      const { isTokenWithinTemplate } = await import('../chat/services/infra/shared-utils.js');

      const tokensInTemplate = targets.some((t) =>
        isTokenWithinTemplate(center, radiusFeet, t, templateType, messageId, actorTokenId),
      );

      const wallsInTemplate = walls.some((wall) =>
        isTokenWithinTemplate(center, radiusFeet, wall, templateType, messageId, actorTokenId),
      );

      // Has targets if either tokens or walls are in the template
      hasTargets = tokensInTemplate || wallsInTemplate;
    } catch (calcErr) {
      console.warn(
        `[${MODULE_ID}] Failed to evaluate targets for player-provided Seek template:`,
        calcErr,
      );
    }

    // Persist the pending template data on the chat message flags so the GM can decide when to open results
    const msg = game.messages.get(messageId);
    if (msg) {
      await msg.update({
        [`flags.${MODULE_ID}.seekTemplate`]: {
          center,
          radiusFeet,
          templateType,
          levels,
          actorTokenId,
          rollTotal: typeof rollTotal === 'number' ? rollTotal : null,
          dieResult: typeof dieResult === 'number' ? dieResult : null,
          fromUserId: userId,
          hasTargets,
        },
      });
      // Ask the player's client to re-inject the panel so their Remove Template button stays visible
      try {
        const playerUser = game.users?.get?.(userId);
        if (playerUser) {
          executeSocketForUser(REFRESH_CHANNEL, userId);
        }
      } catch { }
      // Re-render the chat message so the injected panel can be updated/removed appropriately
      try {
        await msg.render(true);
      } catch { }
    }

    // If the automation panel is already injected for this message on the GM, swap its action to "Open Seek Results"
    try {
      const panel = document.querySelector(
        `.pf2e-visioner-automation-panel[data-message-id="${messageId}"]`,
      );
      if (panel) {
        const actions = panel.querySelector('.automation-actions');
        if (actions) {
          if (hasTargets) {
            const label = game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.OPEN_RESULTS');
            const tooltip = game.i18n.localize(
              'PF2E_VISIONER.SEEK_AUTOMATION.OPEN_RESULTS_TOOLTIP',
            );
            actions.innerHTML = `
              <button type="button" 
                      class="visioner-btn visioner-btn-seek" 
                      data-action="open-seek-results"
                      data-tooltip="${tooltip}">
                <i class="fas fa-search"></i> ${label}
              </button>
            `;
          } else {
            // No targets: remove the entire panel to avoid showing Setup Seek Template
            try {
              panel.remove();
            } catch {
              actions.innerHTML = '';
            }
          }
        }
      }
    } catch (domError) {
      console.warn(
        `[${MODULE_ID}] Failed to update GM panel actions for pending Seek template:`,
        domError,
      );
    }
  } catch (e) {
    console.error(`[${MODULE_ID}] Failed to handle GM Seek template from player:`, e);
  }
}

export function peekUpdateHandler(payload) {
  if (!game.user?.isGM) return;
  if (!payload || payload.sceneId !== canvas?.scene?.id) return;
  const now = Date.now();
  peekRegistry.set(payload.tokenId, {
    origin: payload.origin,
    direction: payload.direction,
    fov: payload.fov,
    range: payload.range ?? 0,
    ignoredWallIds: payload.ignoredWallIds ?? [],
    points: payload.points ?? null,
    userColor: payload.userColor ?? null,
    userName: payload.userName ?? payload.tokenId,
    userId: payload.userId ?? null,
  }, now);
  peekRegistry.pruneStale(5000, now);
  recalcPeekToken(payload.tokenId);
  schedulePeekRevealRefresh(payload.userId, {
    sceneId: payload.sceneId,
    tokenId: payload.tokenId,
    targetIds: collectPeekRefreshTokenIds(payload),
  });
  peekGmOverlay.render();
}

export function collectPeekRefreshTokenIds(payload, { tokens = globalThis.canvas?.tokens?.placeables } = {}) {
  const ids = [];
  const seen = new Set();
  const add = (id) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  add(payload?.tokenId);
  const origin = payload?.origin;
  const direction = payload?.direction;
  const fov = payload?.fov;
  const range = Number(payload?.range ?? 0);
  for (const token of tokens ?? []) {
    const id = token?.document?.id ?? token?.id;
    if (!id || id === payload?.tokenId) continue;
    const center = getTokenCenter(token);
    if (!center || !origin) continue;
    if (typeof fov === 'number' && !isPointInCone(origin, direction, fov, center)) continue;
    if (range > 0 && distance(origin, center) > range + tokenRadius(token)) continue;
    add(id);
  }
  return ids;
}

function getTokenCenter(token) {
  if (token?.center && Number.isFinite(token.center.x) && Number.isFinite(token.center.y)) {
    return { x: token.center.x, y: token.center.y };
  }
  const doc = token?.document ?? token;
  const grid = globalThis.canvas?.grid?.size ?? globalThis.canvas?.dimensions?.size ?? 100;
  const x = Number(doc?.x);
  const y = Number(doc?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: x + ((Number(doc?.width) || 1) * grid) / 2,
    y: y + ((Number(doc?.height) || 1) * grid) / 2,
  };
}

function tokenRadius(token) {
  const doc = token?.document ?? token;
  const grid = globalThis.canvas?.grid?.size ?? globalThis.canvas?.dimensions?.size ?? 100;
  return (Math.max(Number(doc?.width) || 1, Number(doc?.height) || 1) * grid) / 2;
}

function distance(a, b) {
  return Math.hypot(Number(b.x) - Number(a.x), Number(b.y) - Number(a.y));
}

const _pendingPeekRevealRefresh = new Map();

export function schedulePeekRevealRefresh(userId, payload) {
  if (!userId || userId === globalThis.game?.user?.id) return false;
  const tokenId = payload?.tokenId;
  _pendingPeekRevealRefresh.get(tokenId)?.cancel();

  let sent = false;
  let fallbackTimer = null;
  let hookFn = null;
  const clearPending = () => {
    if (tokenId && _pendingPeekRevealRefresh.get(tokenId) === pending) {
      _pendingPeekRevealRefresh.delete(tokenId);
    }
  };
  const send = () => {
    if (sent) return;
    sent = true;
    if (fallbackTimer) {
      try { clearTimeout(fallbackTimer); } catch (_) {}
      fallbackTimer = null;
    }
    if (hookFn) {
      try { globalThis.Hooks?.off?.('pf2eVisionerAvsBatchComplete', hookFn); } catch (_) {}
    }
    clearPending();
    sendPeekRevealRefresh(userId, payload);
  };
  const cancel = () => {
    if (sent) return;
    sent = true;
    if (fallbackTimer) {
      try { clearTimeout(fallbackTimer); } catch (_) {}
      fallbackTimer = null;
    }
    if (hookFn) {
      try { globalThis.Hooks?.off?.('pf2eVisionerAvsBatchComplete', hookFn); } catch (_) {}
    }
  };
  try {
    if (typeof globalThis.Hooks?.once === 'function') {
      hookFn = (batch = {}) => {
        const changed = batch.changedTokens;
        if (Array.isArray(changed) && payload?.tokenId && !changed.includes(payload.tokenId)) return;
        send();
      };
      globalThis.Hooks.once('pf2eVisionerAvsBatchComplete', hookFn);
    }
  } catch (_) {}
  if (typeof setTimeout === 'function') fallbackTimer = setTimeout(send, 75);
  else send();
  const pending = { cancel };
  if (tokenId) _pendingPeekRevealRefresh.set(tokenId, pending);
  return true;
}

export function sendPeekRevealRefresh(userId, payload) {
  return executeSocketForUser(PEEK_REVEAL_REFRESH_CHANNEL, userId, payload);
}

export function refreshPeekRevealTargets(
  targetIds,
  { tokensLayer = globalThis.canvas?.tokens } = {},
) {
  const ids = Array.from(new Set((targetIds ?? []).filter(Boolean)));
  let refreshed = 0;
  for (const id of ids) {
    const token = tokensLayer?.get?.(id);
    if (!token || token.destroyed) continue;
    if (token.turnMarker && !token.turnMarker.mesh) continue;
    token.renderFlags?.set?.({
      refreshState: true,
      refreshMesh: true,
      refreshVisibility: true,
    });
    token.refresh?.();
    refreshed += 1;
  }
  return refreshed;
}

export async function peekRevealRefreshHandler(
  payload,
  {
    refreshTargets = refreshPeekRevealTargets,
    refreshPerception = refreshLocalPerception,
    setTimer = globalThis.setTimeout,
  } = {},
) {
  if (!payload || payload.sceneId !== globalThis.canvas?.scene?.id) return false;
  const targetIds = Array.isArray(payload.targetIds)
    ? Array.from(new Set(payload.targetIds.filter(Boolean)))
    : [];
  const refresh = async () => {
    try {
      await refreshTargets(targetIds);
    } catch (error) {
      console.warn(`[${MODULE_ID}] peek reveal visual refresh failed`, error);
    }
    try {
      refreshPerception?.();
    } catch (_) {}
  };
  await refresh();
  for (const delay of [75, 200]) {
    if (typeof setTimer === 'function') setTimer(() => { void refresh(); }, delay);
  }
  return true;
}

export async function doorPeekApprovalRequestHandler(payload, { confirm = confirmDoorPeekApproval } = {}) {
  try {
    if (!globalThis.game?.user?.isGM) return;
    if (!payload || payload.sceneId !== globalThis.canvas?.scene?.id) return;
    const approved = await confirm(payload);
    sendDoorPeekApprovalResponse(payload.userId, {
      requestId: payload.requestId,
      sceneId: payload.sceneId,
      tokenId: payload.tokenId,
      wallId: payload.wallId,
      approved: !!approved,
    });
  } catch (error) {
    console.error(`[${MODULE_ID}] Failed to handle door peek approval request:`, error);
    try {
      sendDoorPeekApprovalResponse(payload?.userId, {
        requestId: payload?.requestId,
        sceneId: payload?.sceneId,
        tokenId: payload?.tokenId,
        wallId: payload?.wallId,
        approved: false,
      });
    } catch (_) {}
  }
}

export function sendDoorPeekApprovalResponse(userId, payload) {
  return executeSocketForUser(PEEK_APPROVAL_RESPONSE_CHANNEL, userId, payload);
}

export async function doorPeekApprovalResponseHandler(payload) {
  if (!payload || payload.sceneId !== globalThis.canvas?.scene?.id) return false;
  const manager = globalThis.game?.modules?.get?.(MODULE_ID)?.api?.peekManager;
  return manager?.handleDoorPeekApprovalResponse?.(payload) ?? false;
}

export async function confirmDoorPeekApproval(payload) {
  const { VisionerConfirmDialog } = await import('../ui/dialogs/ConfirmDialog.js');
  const token = globalThis.canvas?.tokens?.get?.(payload.tokenId);
  const wall = globalThis.canvas?.walls?.get?.(payload.wallId);
  const userName = payload.userName || globalThis.game?.users?.get?.(payload.userId)?.name || 'Player';
  const tokenName =
    payload.tokenName || token?.name || token?.document?.name || token?.actor?.name || payload.tokenId;
  const doorName = wall?.document?.name || wall?.name || payload.wallId;
  return VisionerConfirmDialog.confirm({
    title: globalThis.game?.i18n?.localize?.('PF2E_VISIONER.PEEK.APPROVAL_TITLE') ?? 'Approve Door Peek',
    content: buildDoorPeekApprovalContent({ userName, tokenName, doorName, wallId: payload.wallId }),
    yes: globalThis.game?.i18n?.localize?.('PF2E_VISIONER.PEEK.APPROVE') ?? 'Approve',
    no: globalThis.game?.i18n?.localize?.('PF2E_VISIONER.PEEK.DENY') ?? 'Deny',
    variant: 'info',
    icon: 'fas fa-eye',
    onRender: (root) => bindDoorPeekApprovalPanLink(root),
  });
}

export function buildDoorPeekApprovalContent({ userName, tokenName, doorName, wallId } = {}) {
  const panLabel =
    globalThis.game?.i18n?.localize?.('PF2E_VISIONER.PEEK.PAN_TO_DOOR') ?? 'Pan to door';
  const doorText = doorName || wallId;
  const wallIdText = String(wallId ?? '');
  return `
    <p>${escapeHtml(userName)} wants ${escapeHtml(tokenName)} to peek through ${escapeHtml(doorText)}.</p>
    <p class="pv-door-approval-meta">
      Door ID:
      <button type="button"
              class="pv-door-approval-pan-link"
              data-action="pan-door"
              data-wall-id="${escapeHtmlAttribute(wallIdText)}"
              data-tooltip="${escapeHtmlAttribute(panLabel)}"
              aria-label="${escapeHtmlAttribute(panLabel)}">
        <i class="fas fa-location-crosshairs" aria-hidden="true"></i>
        <span>${escapeHtml(wallIdText)}</span>
      </button>
    </p>
  `;
}

export function bindDoorPeekApprovalPanLink(root) {
  const container = root?.querySelector?.('.pv-door-approval-meta') ?? root;
  container?.querySelectorAll?.('[data-action="pan-door"][data-wall-id]')?.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      panCanvasToDoor(button.dataset.wallId);
    });
  });
}

export function panCanvasToDoor(wallId) {
  const wall = resolveCanvasWall(wallId);
  const c = wall?.document?.c ?? wall?.c;
  if (!Array.isArray(c) || c.length < 4) return false;
  const x = (Number(c[0]) + Number(c[2])) / 2;
  const y = (Number(c[1]) + Number(c[3])) / 2;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  try {
    globalThis.canvas?.animatePan?.({ x, y, duration: 500 });
    return true;
  } catch (_) {
    return false;
  }
}

function resolveCanvasWall(wallId) {
  if (!wallId) return null;
  return (
    globalThis.canvas?.walls?.get?.(wallId) ||
    globalThis.canvas?.walls?.placeables?.find?.((wall) => wall?.id === wallId || wall?.document?.id === wallId) ||
    globalThis.canvas?.scene?.walls?.get?.(wallId) ||
    globalThis.canvas?.scene?.getEmbeddedDocument?.('Wall', wallId) ||
    null
  );
}

export function executeSocketForUser(channel, userId, ...args) {
  const targetUserId = userId || null;
  const socket = _socketService.socket;
  if (!channel || !targetUserId || !socket) return false;
  if (typeof socket.executeForUsers === 'function') {
    socket.executeForUsers(channel, [targetUserId], ...args);
    return true;
  }
  if (typeof socket.executeAsUser === 'function') {
    socket.executeAsUser(channel, targetUserId, ...args);
    return true;
  }
  if (typeof socket.executeForUser === 'function') {
    socket.executeForUser(channel, targetUserId, ...args);
    return true;
  }
  return false;
}

function escapeHtml(value) {
  const div = globalThis.document?.createElement?.('div');
  if (div) {
    div.textContent = String(value ?? '');
    return div.innerHTML;
  }
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

export function peekEndHandler(payload) {
  if (!game.user?.isGM) return;
  if (!payload || payload.sceneId !== canvas?.scene?.id) return;
  peekRegistry.clear(payload.tokenId);
  recalcPeekToken(payload.tokenId);
  peekGmOverlay.render();
}

function recalcPeekToken(tokenId) {
  try {
    const autoVisibility = game.modules.get(MODULE_ID)?.api?.autoVisibility;
    if (typeof autoVisibility?.updateTokens !== 'function') return;
    requestFullVisibilityScopeRecalc();
    autoVisibility.updateTokens([tokenId]);
  } catch (e) {
    console.warn(`[${MODULE_ID}] peek recalc failed`, e);
  }
}

export function emitPeekUpdate(channel, data) {
  _socketService.executeAsGM(channel === PEEK_END_CHANNEL ? PEEK_END_CHANNEL : PEEK_UPDATE_CHANNEL, data);
}

let _peekPruneTimer = null;

export function startPeekStalePruner() {
  if (_peekPruneTimer || typeof setInterval === 'undefined') return;
  _peekPruneTimer = setInterval(() => {
    if (!game.user?.isGM) return;
    const before = peekRegistry.ids();
    peekRegistry.pruneStale(5000, Date.now());
    for (const id of before) {
      if (!peekRegistry.has(id)) recalcPeekToken(id);
    }
    peekGmOverlay.render();
  }, 1000);
}

export function requestGMStealthInitiativeCover(payload) {
  if (!_socketService.socket) return false;
  _socketService.executeAsGM(STEALTH_INITIATIVE_COVER_REQUEST_CHANNEL, payload);
  return true;
}

export async function stealthInitiativeCoverRequestHandler(payload = {}) {
  try {
    if (!game.user?.isGM) return;
    const { default: stealthInitiativeCoverCoordinator } = await import(
      '../cover/auto-cover/StealthInitiativeCoverCoordinator.js'
    );
    await stealthInitiativeCoverCoordinator.handleIncomingGMRequest(payload);
  } catch (error) {
    console.error(`[${MODULE_ID}] Failed to handle stealth-initiative cover request:`, error);
  }
}

export function sendStealthInitiativeCoverResponse(userId, payload) {
  return executeSocketForUser(STEALTH_INITIATIVE_COVER_RESPONSE_CHANNEL, userId, payload);
}

export async function stealthInitiativeCoverResponseHandler(payload = {}) {
  try {
    const { default: stealthInitiativeCoverCoordinator } = await import(
      '../cover/auto-cover/StealthInitiativeCoverCoordinator.js'
    );
    await stealthInitiativeCoverCoordinator.handleGMResponse(payload);
  } catch (error) {
    console.error(`[${MODULE_ID}] Failed to handle stealth-initiative cover response:`, error);
  }
}
