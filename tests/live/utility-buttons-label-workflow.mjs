/* global Roll, ChatMessage */
import assert from 'node:assert/strict';

// Uses Utility Buttons' real _preCreate and renderHTML wrappers. No synthetic
// flatchecks or hand-rendered integration template.
export async function createUtilityButtonsLabelCard(page, fixture, runId, label, reverse = false) {
  const expand = page.locator(
    '#sidebar-tabs button[data-action="toggleState"][aria-label="Expand"]',
  );
  if (await expand.count()) await expand.click();
  const chatTab = page.locator('#sidebar-tabs button[data-tab="chat"]');
  if ((await chatTab.getAttribute('aria-pressed')) !== 'true') await chatTab.click();
  const result = await page.evaluate(
    async ({ f, runId, reverse }) => {
      if (
        !game.modules.get('pf2e-flatcheck-helper')?.active ||
        canvas.scene.getFlag('pf2e-visioner', 'liveTestRun') !== runId
      ) {
        throw Error('Utility Buttons and an owned QA scene required');
      }
      const observer = canvas.tokens.get(reverse ? f.target : f.observer);
      const target = canvas.tokens.get(reverse ? f.observer : f.target);
      target.setTarget(true, { releaseOthers: true });
      const roll = await new Roll('1d20+8').evaluate();
      const message = await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ token: observer.document }),
        rolls: [roll],
        flavor: 'Visioner Utility Buttons Label QA',
        flags: {
          pf2e: {
            context: {
              type: 'attack-roll',
              dc: { value: 18 },
              target: { token: target.document.uuid, actor: target.actor.uuid },
            },
          },
          'pf2e-visioner': { liveTestRun: runId },
        },
      });
      const element = await message.renderHTML();
      return {
        id: message.id,
        description: element.querySelector('.fc-description')?.textContent,
        tooltip: element.querySelector('.fc-label')?.dataset.tooltip,
        origin: message.getFlag('pf2e-flatcheck-helper', 'flatchecks')?.target?.origin,
      };
    },
    { f: fixture, runId, reverse },
  );
  assert.equal(result.description, label, 'Actual Utility Buttons visible source label');
  assert.ok(result.tooltip?.includes(label), 'Actual Utility Buttons tooltip label');
  assert.equal(result.origin.slug, 'rule-element-override', 'Stable source slug');
  assert.equal(result.origin.label, label, 'Label saved with roll');
  const visibleLabel = page.locator(`[data-message-id="${result.id}"] .fc-description`);
  await visibleLabel.scrollIntoViewIfNeeded();
  await visibleLabel.hover();
  assert.equal(await visibleLabel.innerText(), label, 'Visible chat sidebar label');
  return result.id;
}

export async function assertUtilityButtonsLabelSnapshot(page, id, label) {
  const description = await page.evaluate(async (id) => {
    const element = await game.messages.get(id).renderHTML();
    return element.querySelector('.fc-description')?.textContent;
  }, id);
  assert.equal(description, label, 'Old card retains original source label');
}
