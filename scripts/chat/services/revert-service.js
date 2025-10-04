// Revert helpers for chat automation actions

import { ConsequencesActionHandler } from './actions/ConsequencesAction.js';
import { DiversionActionHandler } from './actions/DiversionAction.js';
import { HideActionHandler } from './actions/HideAction.js';
import { PointOutActionHandler } from './actions/PointOutAction.js';
import { SeekActionHandler } from './actions/SeekAction.js';
import { SneakActionHandler } from './actions/SneakAction.js';
import { TakeCoverActionHandler } from './actions/TakeCoverAction.js';
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
