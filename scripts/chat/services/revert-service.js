// Revert helpers for chat automation actions

import { ConsequencesActionHandler } from './actions/consequences-action.js';
import { DiversionActionHandler } from './actions/diversion-action.js';
import { HideActionHandler } from './actions/HideAction.js';
import { PointOutActionHandler } from './actions/point-out-action.js';
import { SeekActionHandler } from './actions/seek-action.js';
import { SneakActionHandler } from './actions/sneak-action.js';
import { TakeCoverActionHandler } from './actions/take-cover-action.js';
import { log } from './infra/notifications.js';

export async function revertNowSeek(actionData, button) {
  const handler = new SeekActionHandler();
  await handler.revert(actionData, button);
}

export async function revertNowPointOut(actionData, button) {
  const handler = new PointOutActionHandler();
  await handler.revert(actionData, button);
}

export async function revertNowHide(actionData, button) {
  const handler = new HideActionHandler();
  try {
    await handler.revert(actionData, button);
  } catch (e) {
    log.error(e);
  }
}

export async function revertNowSneak(actionData, button) {
  const handler = new SneakActionHandler();
  try {
    await handler.revert(actionData, button);
  } catch (e) {
    log.error(e);
  }
}

export async function revertNowDiversion(actionData, button) {
  const handler = new DiversionActionHandler();
  try {
    await handler.revert(actionData, button);
  } catch (e) {
    log.error(e);
  }
}

export async function revertNowConsequences(actionData, button) {
  const handler = new ConsequencesActionHandler();
  try {
    await handler.revert(actionData, button);
  } catch (e) {
    log.error(e);
  }
}

export async function revertNowTakeCover(actionData, button) {
  const handler = new TakeCoverActionHandler();
  try {
    await handler.revert(actionData, button);
  } catch (e) {
    log.error(e);
  }
}
