/**
 * Scene Token Vision off means Foundry uses global scene visibility instead of token vision
 * sources. Visioner visibility/detection behavior must fully defer to Foundry Core in this mode.
 *
 * @param {object|null|undefined} scene
 * @returns {boolean}
 */
export function isSceneTokenVisionDisabled(scene = globalThis.canvas?.scene) {
  return scene?.tokenVision === false;
}
