import { processedMessages } from '../data/message-cache.js';

export async function injectAutomationUI(message, html, actionData) {
  try {
    const { shouldInjectPanel } = await import('../infra/panel-visibility.js');
    const shouldInject = shouldInjectPanel(message, actionData);

    if (!shouldInject) {
      processedMessages.add(message.id);
      return;
    }

    const { buildAutomationPanel } = await import('../../ui/panel-builder.js');
    const panelHtml = buildAutomationPanel(actionData, message);
    const panel = $(panelHtml);
    const messageContent = html.find('.message-content');
    if (messageContent.length === 0) return;
    try {
      html.find('.pf2e-visioner-automation-panel').remove();
    } catch (_) { }
    messageContent.after(panel);
    try {
      // After injecting controls, auto-scroll chat to the bottom so buttons are visible.
      const doScroll = () => {
        try {
          if (ui?.chat && typeof ui.chat.scrollBottom === 'function') {
            ui.chat.scrollBottom();
            return;
          }
        } catch (_) {}
        try {
          const scroller =
            document.querySelector('#chat-log') || document.querySelector('.chat-log');
          if (scroller) scroller.scrollTop = scroller.scrollHeight;
        } catch (_) {}
      };
      // Defer to next tick to include the newly injected panel in layout
      setTimeout(doScroll, 0);
    } catch (_) {}
    try {
      // Ensure the panel reflects current user context so players keep their template controls
      panel.attr('data-user-id', game.userId);
    } catch (_) {}
    const { bindAutomationEvents } = await import('../../ui/event-binder.js');
    bindAutomationEvents(panel, message, actionData);
    processedMessages.add(message.id);
  } catch (error) {
    const { log } = await import('../infra/notifications.js');
    log.error('Error injecting automation UI:', error);
  }
}
