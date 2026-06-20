import { MODULE_ID } from '../../constants.js';
import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';
import { detectionFrameCache, isTokenBlinded } from './detection-visibility-context.js';

let sceneVisionSharingLinkCache = null;

function currentCanvasFrameKey() {
  return canvas?.app?.ticker?.lastTime ?? null;
}

function sceneHasVisionSharingLinks() {
  const frameKey = currentCanvasFrameKey();
  if (sceneVisionSharingLinkCache?.frameKey === frameKey) {
    return sceneVisionSharingLinkCache.value;
  }

  const value = (canvas?.tokens?.placeables || []).some((token) =>
    !!token?.document?.getFlag?.(MODULE_ID, 'visionMasterTokenId'),
  );
  sceneVisionSharingLinkCache = { frameKey, value };
  return value;
}

export function wrapTokenDocumentPrepareBaseData(wrapped) {
  wrapped();
  if (shouldBypassAvsForGmVision()) return;

  const visionMasterTokenId = detectionFrameCache.getVisionMasterTokenId(this);
  const mode = detectionFrameCache.getVisionSharingMode(this);

  if (visionMasterTokenId && mode === 'replace' && this.sight) {
    this.sight.enabled = false;
  }

  const hasReverseMinionPointingToMe = detectionFrameCache.hasMinionWithMode(this.id, 'reverse');
  if (hasReverseMinionPointingToMe && this.sight) {
    this.sight.enabled = false;
  }
}

export function wrapTokenVisionSource(wrapped) {
  const isNormalVisionSource = wrapped();
  if (shouldBypassAvsForGmVision()) return isNormalVisionSource;

  const thisTokenBlinded = isTokenBlinded(this);
  if (thisTokenBlinded) {
    return false;
  }

  if (!sceneHasVisionSharingLinks()) {
    return isNormalVisionSource;
  }

  const controlledTokens = canvas?.tokens?.controlled || [];

  for (const controlledToken of controlledTokens) {
    const visionMasterTokenId = detectionFrameCache.getVisionMasterTokenId(
      controlledToken.document,
    );
    const mode = detectionFrameCache.getVisionSharingMode(controlledToken.document);

    if (visionMasterTokenId === this.id) {
      if (thisTokenBlinded) {
        return false;
      }

      if (mode === 'one-way' || mode === 'two-way' || mode === 'replace') {
        return true;
      }
    }
  }

  const visionMasterTokenId = detectionFrameCache.getVisionMasterTokenId(this.document);
  const mode = detectionFrameCache.getVisionSharingMode(this.document);

  if (visionMasterTokenId && mode === 'replace') {
    const masterToken = canvas?.tokens?.get(visionMasterTokenId);
    if (!masterToken || !isTokenBlinded(masterToken)) {
      return false;
    }
  }

  if (visionMasterTokenId && mode === 'two-way') {
    const isMasterControlled = controlledTokens.some((ct) => ct.id === visionMasterTokenId);
    if (isMasterControlled && !isTokenBlinded(this)) {
      return true;
    }
  }

  if (visionMasterTokenId && mode === 'reverse') {
    const isMasterControlled = controlledTokens.some((ct) => ct.id === visionMasterTokenId);
    if (isMasterControlled && !isTokenBlinded(this)) {
      return true;
    }
  }

  const hasTwoWayMinion = detectionFrameCache.hasMinionWithMode(this.id, 'two-way');
  if (hasTwoWayMinion && controlledTokens.some((ct) => ct.id === this.id) && !thisTokenBlinded) {
    return true;
  }

  const reverseMinion = detectionFrameCache.getMinionsForMaster(this.id, 'reverse')[0]?.token;
  if (reverseMinion && controlledTokens.some((ct) => ct.id === this.id)) {
    if (isTokenBlinded(reverseMinion)) {
      return isNormalVisionSource;
    }

    return false;
  }

  return isNormalVisionSource;
}
